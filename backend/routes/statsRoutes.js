const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const User = require("../models/user");
const Lead = require("../models/lead");
const Deal = require("../models/deal");

// GET /api/stats - return some dashboard statistics (admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    // simple aggregation from users for demo
    const totalUsers = await User.countDocuments();
    const managers = await User.countDocuments({ role: "manager" });
    const employees = await User.countDocuments({ role: "employee" });

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

    const stats = {
      totalUsers,
      managers,
      employees,
      totalRevenue: 1650,
      totalDeals,
      totalLeads,
      conversionRate,
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
