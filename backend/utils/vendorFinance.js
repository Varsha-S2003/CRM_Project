const Bill = require("../models/bill");
const Payment = require("../models/payment");

const toObjectIdSet = (values = []) => values.map((value) => String(value));

const refreshBillStatus = async (bill) => {
  const payments = await Payment.find({ billId: bill._id }).select("amount paymentDate");
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const isFullyPaid = paidAmount >= Number(bill.amount || 0);
  const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;
  const isOverdue = !isFullyPaid && bill.dueDate && new Date(bill.dueDate).getTime() < Date.now();
  const nextStatus = isFullyPaid ? "Paid" : isOverdue ? "Overdue" : isPartiallyPaid ? "Partial" : "Unpaid";

  if (bill.status !== nextStatus) {
    bill.status = nextStatus;
    await bill.save();
  }

  return {
    status: bill.status,
    paidAmount,
    outstandingAmount: Math.max(0, Number(bill.amount || 0) - paidAmount),
  };
};

const computeVendorFinancials = async (vendorIds = []) => {
  const normalizedVendorIds = toObjectIdSet(vendorIds);
  if (!normalizedVendorIds.length) return new Map();

  const [bills, payments] = await Promise.all([
    Bill.find({ vendorId: { $in: normalizedVendorIds } }).select("vendorId amount status dueDate"),
    Payment.find({ vendorId: { $in: normalizedVendorIds } }).select("vendorId amount billId"),
  ]);

  const byVendor = new Map();
  normalizedVendorIds.forEach((vendorId) => {
    byVendor.set(String(vendorId), {
      totalBills: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueBills: 0,
    });
  });

  bills.forEach((bill) => {
    const key = String(bill.vendorId);
    const current = byVendor.get(key) || {
      totalBills: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueBills: 0,
    };

    current.totalBills += Number(bill.amount || 0);
    if (bill.status === "Overdue") current.overdueBills += 1;
    byVendor.set(key, current);
  });

  payments.forEach((payment) => {
    const key = String(payment.vendorId);
    const current = byVendor.get(key) || {
      totalBills: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueBills: 0,
    };

    current.totalPaid += Number(payment.amount || 0);
    byVendor.set(key, current);
  });

  byVendor.forEach((value) => {
    value.totalOutstanding = Math.max(0, value.totalBills - value.totalPaid);
  });

  return byVendor;
};

module.exports = {
  refreshBillStatus,
  computeVendorFinancials,
};
