const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const User = require("../models/user");
const Lead = require("../models/lead");
const Product = require("../models/product");
const Deal = require("../models/deal");
const Vendor = require("../models/vendor");
const Bill = require("../models/bill");
const Payment = require("../models/payment");

// GET /api/stats - return some dashboard statistics (admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    // simple aggregation from users for demo
    const totalUsers = await User.countDocuments();
    const managers = await User.countDocuments({ role: "manager" });
    const employees = await User.countDocuments({ role: "employee" });

    // Product statistics
    const totalProducts = await Product.countDocuments();
    const allProducts = await Product.find({}, "type stock lowStockThreshold serviceCategory availableLicenses licenseAlertThreshold totalCapacity availableCapacity endDate expiryDate");
    const productItems = allProducts.filter((p) => (p.type || "product") !== "service");
    const serviceItems = allProducts.filter((p) => p.type === "service");
    const totalStock = productItems.reduce((sum, p) => sum + (p.stock || 0), 0);
    const lowStockItems = productItems.filter((p) => p.stock < (p.lowStockThreshold ?? 5)).length;

    const today = new Date();
    const serviceAlerts = serviceItems.filter((item) => {
      if (item.serviceCategory === "license") {
        return (item.availableLicenses ?? 0) < (item.licenseAlertThreshold ?? 5);
      }
      if (item.serviceCategory === "storage") {
        const total = item.totalCapacity || 0;
        if (total <= 0) return true;
        const availablePercent = ((item.availableCapacity ?? 0) / total) * 100;
        return availablePercent < 20;
      }
      if (item.serviceCategory === "subscription") {
        const expiry = item.endDate || item.expiryDate;
        if (!expiry) return true;
        const daysLeft = (new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        return daysLeft <= 30;
      }
      return false;
    }).length;

    // prepare employee creation trend for last six months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const empAgg = await User.aggregate([
      { $match: { role: "employee", createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id": 1 } },
    ]);
    // construct array of counts for each of the six months in order
    const employeeTrend = [];
    for (let i = 0; i < 6; i++) {
      const m = sixMonthsAgo.getMonth() + 1 + i; // 1-indexed month
      const monthIndex = ((m - 1) % 12) + 1;
      const entry = empAgg.find((e) => e._id === monthIndex);
      employeeTrend.push(entry ? entry.count : 0);
    }

    // compute lead counts by status
    const leadAgg = await Lead.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const leadCounts = { new: 0, contacted: 0, qualified: 0, converted: 0 };
    leadAgg.forEach((e) => {
      if (leadCounts.hasOwnProperty(e._id)) leadCounts[e._id] = e.count;
    });

    const totalLeads = Object.values(leadCounts).reduce((a, b) => a + b, 0);
    const conversionRate = totalLeads ? Math.round((leadCounts.converted / totalLeads) * 100) : 0;

    const totalDeals = await Deal.countDocuments();

    const [totalVendors, bills, payments, overdueBills] = await Promise.all([
      Vendor.countDocuments(),
      Bill.find({}).select("amount"),
      Payment.find({}).select("amount"),
      Bill.countDocuments({ status: "Overdue" }),
    ]);

    const totalBillAmount = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
    const totalPaidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalPayables = Math.max(0, totalBillAmount - totalPaidAmount);

    const stats = {
      totalUsers,
      managers,
      employees,
      totalRevenue: 1650,
      totalDeals,
      totalLeads,
      conversionRate,
      totalVendors,
      totalPayables,
      overdueBills,
      // Product stats
      totalProducts,
      totalStock,
      lowStockItems,
      serviceAlerts,
      // additional fields for charts
      revenueTrend: [45000, 52000, 48000, 61000, 55000, 68000],
      dealsByStage: { proposal: 1, negotiation: 1, closedWon: 0, closedLost: 0 },
      managerPerformance: { John: 1, Mike: 1 },
      // employee growth for the past 6 months (dummy data)
      // employee creation counts for last six months
      employeeTrend: employeeTrend,
      leadCounts,
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

