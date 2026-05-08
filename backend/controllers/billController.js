const mongoose = require("mongoose");
const Bill = require("../models/bill");
const Vendor = require("../models/vendor");
const {
  getUserNotificationPreferences,
  isAlertTypeEnabled,
} = require("../utils/notificationPreferences");
const Payment = require("../models/payment");
const { refreshBillStatus } = require("../utils/vendorFinance");
const { syncBillInventoryIfPaid } = require("../utils/vendorInventorySync");
const { trackVendorActivity } = require("./vendorController");

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeName = (value) => String(value || "").trim().toLowerCase();

const generateBillNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const count = await Bill.countDocuments({
    createdAt: {
      $gte: yearStart,
      $lt: yearEnd,
    },
  });
  return `PUR-${year}-${String(count + 1).padStart(3, "0")}`;
};

const createBill = async (req, res) => {
  try {
    const payload = {
      vendorId: req.body.vendorId,
      billNumber: String(req.body.billNumber || "").trim(),
      purchaseDate: toDate(req.body.purchaseDate) || new Date(),
      dueDate: toDate(req.body.dueDate),
      status: "Unpaid",
      notes: String(req.body.notes || "").trim(),
    };

    if (!payload.billNumber) {
      payload.billNumber = await generateBillNumber();
    }

    const paidAmount = Number(req.body.paidAmount || 0);
    const paymentMode = "Cash";

    // Process line items
    const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
    let totalAmount = 0;

    const processedLineItems = lineItems.map((item) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const gstPercentRaw = Number(item.gstPercent ?? item.gst_percent ?? 0);
      const gstPercent = Number.isFinite(gstPercentRaw) ? Math.max(0, Math.min(100, gstPercentRaw)) : 0;
      const subtotal = qty * unitPrice;
      const taxAmount = (subtotal * gstPercent) / 100;
      const itemTotal = subtotal + taxAmount;
      totalAmount += itemTotal;

      return {
        itemId: mongoose.isValidObjectId(item.itemId) ? item.itemId : undefined,
        type: String(item.type || "product").toLowerCase() === "service" ? "service" : "product",
        product: String(item.product || "").trim(),
        quantity: qty,
        unitPrice: unitPrice,
        subtotal,
        gstPercent,
        taxAmount,
        total: itemTotal,
      };
    });

    payload.lineItems = processedLineItems;
    payload.amount = totalAmount;

    if (!mongoose.isValidObjectId(payload.vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const vendor = await Vendor.findById(payload.vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (lineItems.length === 0 || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      return res.status(400).json({ message: "At least one line item with valid quantity and price is required" });
    }

    const invalidLineItem = processedLineItems.find(
      (item) => !item.product || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0
    );
    if (invalidLineItem) {
      return res.status(400).json({ message: "Each line item must have product/service name, quantity > 0 and unitPrice > 0" });
    }

    if (!payload.dueDate) {
      return res.status(400).json({ message: "dueDate is required" });
    }

    const vendorProducts = new Set((vendor.productsProvided || []).map(normalizeName));
    const vendorServices = new Set((vendor.servicesProvided || []).map(normalizeName));
    const hasProductRules = vendorProducts.size > 0;
    const hasServiceRules = vendorServices.size > 0;

    const unauthorizedLineItem = processedLineItems.find((lineItem) => {
      const key = normalizeName(lineItem.product);
      if (lineItem.type === "product" && hasProductRules) {
        return !vendorProducts.has(key);
      }
      if (lineItem.type === "service" && hasServiceRules) {
        return !vendorServices.has(key);
      }
      if (lineItem.type === "product" && !hasProductRules) {
        return true;
      }
      if (lineItem.type === "service" && !hasServiceRules) {
        return true;
      }
      return false;
    });

    if (unauthorizedLineItem) {
      return res.status(400).json({
        message: `Selected ${unauthorizedLineItem.type} '${unauthorizedLineItem.product}' is not configured for this vendor`,
      });
    }

    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > payload.amount) {
      return res.status(400).json({ message: "paidAmount must be between 0 and total amount" });
    }

    if (paidAmount <= 0) {
      payload.status = "Unpaid";
    } else if (paidAmount >= payload.amount) {
      payload.status = "Paid";
    } else {
      payload.status = "Partial";
    }

    const bill = await Bill.create(payload);
    let payment = null;

    if (paidAmount > 0) {
      payment = await Payment.create({
        vendorId: payload.vendorId,
        billId: bill._id,
        amount: paidAmount,
        paymentMode,
        paymentDate: payload.purchaseDate || new Date(),
      });
    }

    await refreshBillStatus(bill);
    const freshBill = await Bill.findById(bill._id).select("status");
    if (freshBill?.status === "Paid") {
      await syncBillInventoryIfPaid({ billId: bill._id, vendorName: vendor.vendorName });
    }

    await trackVendorActivity({
      vendorId: bill.vendorId,
      action: "BILL_CREATED",
      entityType: "Bill",
      entityId: bill._id,
      message: `Bill ${bill.billNumber} created with ${lineItems.length} item(s) for ${vendor.vendorName}`,
      metadata: {
        amount: bill.amount,
        itemCount: lineItems.length,
        dueDate: bill.dueDate,
        purchaseDate: payload.purchaseDate,
        paidAmount,
      },
    });

    if (payment) {
      await trackVendorActivity({
        vendorId: bill.vendorId,
        action: "PAYMENT_ADDED",
        entityType: "Payment",
        entityId: payment._id,
        message: `Initial payment of ${payment.amount} recorded for bill ${bill.billNumber}`,
        metadata: { paymentMode: payment.paymentMode },
      });
    }

    return res.status(201).json({ message: "Bill created", bill, payment });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Bill number already exists for this vendor" });
    }
    return res.status(500).json({ message: error.message || "Failed to create bill" });
  }
};

const getBills = async (req, res) => {
  try {
    const { vendorId, status, fromDate, toDate } = req.query;
    const filter = {};

    if (vendorId) {
      if (!mongoose.isValidObjectId(vendorId)) {
        return res.status(400).json({ message: "Invalid vendorId" });
      }
      filter.vendorId = vendorId;
    }

    if (status && ["Paid", "Partial", "Unpaid", "Overdue"].includes(status)) {
      filter.status = status;
    }

    const fromDateValue = fromDate ? new Date(fromDate) : null;
    const toDateValue = toDate ? new Date(toDate) : null;

    if (fromDateValue && !Number.isNaN(fromDateValue.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $gte: fromDateValue };
    }

    if (toDateValue && !Number.isNaN(toDateValue.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $lte: toDateValue };
    }

    const bills = await Bill.find(filter).populate("vendorId", "vendorName companyName email status").sort({ createdAt: -1 });

    for (const bill of bills) {
      await refreshBillStatus(bill);
      if (bill.status === "Paid") {
        await syncBillInventoryIfPaid({
          billId: bill._id,
          vendorName: bill.vendorId?.vendorName || "",
        });
      }
    }

    const refreshed = await Bill.find({ _id: { $in: bills.map((bill) => bill._id) } })
      .populate("vendorId", "vendorName companyName email status")
      .sort({ createdAt: -1 });

    return res.json(refreshed);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch bills" });
  }
};

const updateBillStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid bill id" });
    }

    const status = String(req.body.status || "").trim();
    if (!status || !["Paid", "Partial", "Unpaid", "Overdue"].includes(status)) {
      return res.status(400).json({ message: "status must be Paid, Partial, Unpaid, or Overdue" });
    }

    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    bill.status = status;
    await bill.save();

    if (bill.status === "Paid") {
      const vendor = await Vendor.findById(bill.vendorId).select("vendorName");
      await syncBillInventoryIfPaid({ billId: bill._id, vendorName: vendor?.vendorName || "" });
    }

    await trackVendorActivity({
      vendorId: bill.vendorId,
      action: "BILL_UPDATED",
      entityType: "Bill",
      entityId: bill._id,
      message: `Bill ${bill.billNumber} status updated to ${bill.status}`,
      metadata: { status: bill.status },
    });

    return res.json({ message: "Bill updated", bill });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to update bill" });
  }
};

const getOverdueNotifications = async (req, res) => {
  try {
    const [preferences, invoiceOverdueEnabled] = await Promise.all([
      getUserNotificationPreferences(req.user?._id),
      isAlertTypeEnabled("invoiceOverdue"),
    ]);

    if (!preferences.appNotifications || !invoiceOverdueEnabled) {
      return res.json({ count: 0, notifications: [] });
    }

    const overdueBills = await Bill.find({ status: "Overdue" })
      .populate("vendorId", "vendorName companyName email")
      .sort({ dueDate: 1 })
      .limit(100);

    const notifications = overdueBills.map((bill) => ({
      id: String(bill._id),
      type: "OVERDUE_BILL",
      message: `Bill ${bill.billNumber} for ${bill.vendorId?.vendorName || "Unknown Vendor"} is overdue.`,
      vendorId: bill.vendorId?._id || null,
      dueDate: bill.dueDate,
      amount: bill.amount,
      createdAt: bill.updatedAt || bill.createdAt,
    }));

    return res.json({ count: notifications.length, notifications });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch overdue notifications" });
  }
};

module.exports = {
  createBill,
  getBills,
  updateBillStatus,
  getOverdueNotifications,
};
