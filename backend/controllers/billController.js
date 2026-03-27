const mongoose = require("mongoose");
const Bill = require("../models/bill");
const Vendor = require("../models/vendor");
const { refreshBillStatus } = require("../utils/vendorFinance");
const { trackVendorActivity } = require("./vendorController");

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createBill = async (req, res) => {
  try {
    const payload = {
      vendorId: req.body.vendorId,
      billNumber: String(req.body.billNumber || "").trim(),
      dueDate: toDate(req.body.dueDate),
      status: String(req.body.status || "Unpaid").trim(),
    };

    // Process line items
    const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
    let totalAmount = 0;

    const processedLineItems = lineItems.map((item) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const itemTotal = qty * unitPrice;
      totalAmount += itemTotal;

      return {
        product: String(item.product || "").trim(),
        quantity: qty,
        unitPrice: unitPrice,
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

    if (!payload.billNumber) {
      return res.status(400).json({ message: "billNumber is required" });
    }

    if (lineItems.length === 0 || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      return res.status(400).json({ message: "At least one line item with valid quantity and price is required" });
    }

    if (!payload.dueDate) {
      return res.status(400).json({ message: "dueDate is required" });
    }

    if (!["Paid", "Unpaid", "Overdue"].includes(payload.status)) {
      payload.status = "Unpaid";
    }

    const bill = await Bill.create(payload);
    await refreshBillStatus(bill);

    await trackVendorActivity({
      vendorId: bill.vendorId,
      action: "BILL_CREATED",
      entityType: "Bill",
      entityId: bill._id,
      message: `Bill ${bill.billNumber} created with ${lineItems.length} item(s) for ${vendor.vendorName}`,
      metadata: { amount: bill.amount, itemCount: lineItems.length, dueDate: bill.dueDate },
    });

    return res.status(201).json({ message: "Bill created", bill });
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

    if (status && ["Paid", "Unpaid", "Overdue"].includes(status)) {
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
    if (!status || !["Paid", "Unpaid", "Overdue"].includes(status)) {
      return res.status(400).json({ message: "status must be Paid, Unpaid, or Overdue" });
    }

    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    bill.status = status;
    await bill.save();

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

const getOverdueNotifications = async (_req, res) => {
  try {
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
