const mongoose = require("mongoose");
const Payment = require("../models/payment");
const Bill = require("../models/bill");
const Vendor = require("../models/vendor");
const { refreshBillStatus } = require("../utils/vendorFinance");
const { trackVendorActivity } = require("./vendorController");

const parseDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addPayment = async (req, res) => {
  try {
    const payload = {
      vendorId: req.body.vendorId,
      billId: req.body.billId,
      amount: Number(req.body.amount || 0),
      paymentMode: String(req.body.paymentMode || "").trim(),
      paymentDate: parseDate(req.body.paymentDate),
    };

    if (!mongoose.isValidObjectId(payload.vendorId) || !mongoose.isValidObjectId(payload.billId)) {
      return res.status(400).json({ message: "Invalid vendorId or billId" });
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    if (!["UPI", "Bank", "Cash"].includes(payload.paymentMode)) {
      return res.status(400).json({ message: "paymentMode must be UPI, Bank, or Cash" });
    }

    if (!payload.paymentDate) {
      return res.status(400).json({ message: "Invalid paymentDate" });
    }

    const [vendor, bill] = await Promise.all([
      Vendor.findById(payload.vendorId),
      Bill.findById(payload.billId),
    ]);

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (String(bill.vendorId) !== String(vendor._id)) {
      return res.status(400).json({ message: "billId does not belong to vendorId" });
    }

    const payment = await Payment.create(payload);
    const statusSummary = await refreshBillStatus(bill);

    await trackVendorActivity({
      vendorId: vendor._id,
      action: "PAYMENT_ADDED",
      entityType: "Payment",
      entityId: payment._id,
      message: `Payment of ${payment.amount} recorded for bill ${bill.billNumber}`,
      metadata: { billId: bill._id, paymentMode: payment.paymentMode },
    });

    return res.status(201).json({
      message: "Payment added",
      payment,
      billStatus: statusSummary.status,
      paidAmount: statusSummary.paidAmount,
      outstandingAmount: statusSummary.outstandingAmount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to add payment" });
  }
};

const getPayments = async (req, res) => {
  try {
    const { vendorId, billId, fromDate, toDate } = req.query;
    const filter = {};

    if (vendorId) {
      if (!mongoose.isValidObjectId(vendorId)) {
        return res.status(400).json({ message: "Invalid vendorId" });
      }
      filter.vendorId = vendorId;
    }

    if (billId) {
      if (!mongoose.isValidObjectId(billId)) {
        return res.status(400).json({ message: "Invalid billId" });
      }
      filter.billId = billId;
    }

    const fromDateValue = fromDate ? new Date(fromDate) : null;
    const toDateValue = toDate ? new Date(toDate) : null;

    if (fromDateValue && !Number.isNaN(fromDateValue.getTime())) {
      filter.paymentDate = { ...(filter.paymentDate || {}), $gte: fromDateValue };
    }

    if (toDateValue && !Number.isNaN(toDateValue.getTime())) {
      filter.paymentDate = { ...(filter.paymentDate || {}), $lte: toDateValue };
    }

    const payments = await Payment.find(filter)
      .populate("vendorId", "vendorName companyName email")
      .populate("billId", "billNumber amount status dueDate")
      .sort({ paymentDate: -1 });

    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch payments" });
  }
};

module.exports = {
  addPayment,
  getPayments,
};
