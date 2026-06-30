const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const User = require("../models/user");
const Lead = require("../models/lead");
const Product = require("../models/product");
const Item = require("../models/item");
const Deal = require("../models/deal");
const Vendor = require("../models/vendor");
const Bill = require("../models/bill");
const Payment = require("../models/payment");

const normalizeStageKey = (stage) => {
  const value = String(stage || "").trim().toLowerCase().replace(/\s+/g, "_");
  const map = {
    closed_won: "won",
    closed_lost: "lost",
    proposal_price_quote: "proposal",
    negotiate: "negotiation",
  };
  return map[value] || value || "unknown";
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const resolveReportRange = (query) => {
  const now = new Date();
  const range = String(query.range || "month").toLowerCase();
  let start;
  let end = endOfDay(query.endDate ? query.endDate : now);

  if (range === "year") {
    start = startOfDay(new Date(now.getFullYear(), 0, 1));
    end = endOfDay(now);
  } else if (range === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = startOfDay(new Date(now.getFullYear(), quarterStartMonth, 1));
    end = endOfDay(now);
  } else if (range === "custom") {
    const startDate = query.startDate ? new Date(query.startDate) : null;
    const endDate = query.endDate ? new Date(query.endDate) : null;
    if (startDate && !Number.isNaN(startDate.getTime())) {
      start = startOfDay(startDate);
    }
    if (endDate && !Number.isNaN(endDate.getTime())) {
      end = endOfDay(endDate);
    }
    if (!start) start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    if (!end) end = endOfDay(now);
  } else {
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    end = endOfDay(now);
  }

  return { range, start, end };
};

// GET /api/stats - return some dashboard statistics (admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { range, start, end } = resolveReportRange(req.query);
    const createdAtFilter = { createdAt: { $gte: start, $lte: end } };
    const [
      totalUsers,
      managers,
      employees,
      totalProducts,
      allItems,
      allDeals,
      leads,
      totalVendors,
      bills,
      payments,
      overdueBills,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "MANAGER" }),
      User.countDocuments({ role: "EMPLOYEE" }),
      Product.countDocuments(),
      Item.find({}).select("type stock reservedStock soldStock lowStockThreshold serviceType totalStorage usedStorage nextBillingDate endDate expiryDate"),
      Deal.find(createdAtFilter)
        .select("stage amount value assignedTo createdAt updatedAt")
        .populate("assignedTo", "name username email"),
      Lead.find(createdAtFilter).select("status createdAt"),
      Vendor.countDocuments(),
      Bill.find(createdAtFilter).select("amount status createdAt"),
      Payment.find(createdAtFilter).select("amount createdAt"),
      Bill.countDocuments({ status: "Overdue" }),
    ]);

    const productItems = allItems.filter((item) => String(item.type || "product").toLowerCase() !== "service");
    const serviceItems = allItems.filter((item) => String(item.type || "").toLowerCase() === "service");
    const totalAvailableStock = productItems.reduce((sum, item) => sum + toNumber(item.stock), 0);
    const totalReservedStock = productItems.reduce((sum, item) => sum + toNumber(item.reservedStock), 0);
    const totalSoldStock = productItems.reduce((sum, item) => sum + toNumber(item.soldStock), 0);
    const totalPhysicalStock = totalAvailableStock + totalReservedStock + totalSoldStock;
    const inventoryRiskBuffer = productItems.reduce((sum, item) => sum + toNumber(item.lowStockThreshold || 0), 0);
    const netFreeStock = Math.max(0, totalAvailableStock - inventoryRiskBuffer);
    const stockConversionRate = totalReservedStock > 0
      ? Math.round((totalSoldStock / totalReservedStock) * 100)
      : 0;
    const pipelinePressureRate = totalPhysicalStock > 0
      ? Math.round((totalReservedStock / totalPhysicalStock) * 100)
      : 0;
    const lowStockItems = productItems.filter((item) => toNumber(item.stock) < toNumber(item.lowStockThreshold || 5)).length;

    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const serviceAlerts = serviceItems.filter((item) => {
      const serviceType = String(item.serviceType || "").toLowerCase();

      if (serviceType === "storage") {
        const total = toNumber(item.totalStorage);
        const available = Math.max(0, total - toNumber(item.usedStorage));
        if (total <= 0) return true;
        return available / total < 0.2;
      }

      if (serviceType === "license" || serviceType === "subscription") {
        const expiryRaw = item.nextBillingDate || item.endDate || item.expiryDate;
        if (!expiryRaw) return false;
        const expiry = new Date(expiryRaw);
        if (Number.isNaN(expiry.getTime())) return false;
        return expiry <= in30Days;
      }

      return false;
    }).length;

    // prepare employee creation trend for last six months
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const empAgg = await User.aggregate([
      { $match: { role: "EMPLOYEE", createdAt: { $gte: sixMonthsAgo } } },
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

    const leadCounts = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, proposal: 0, proposal_sent: 0 };

    // Use stage timestamps to compute *converted* correctly.
    // Previously we only counted by `status` over a createdAt date range,
    // which can exclude leads that were created outside the range but converted inside.
    const convertedStart = start;
    const convertedEnd = end;

    leads.forEach((lead) => {
      const statusKey = String(lead.status || "").trim().toLowerCase().replace(/\s+/g, "_");

      if (statusKey === "converted") {
        const convertedAt = lead.stageTimestamps?.convertedAt;
        if (convertedAt) {
          const dt = new Date(convertedAt);
          if (!Number.isNaN(dt.getTime()) && dt >= convertedStart && dt <= convertedEnd) {
            leadCounts.converted += 1;
          }
        } else {
          // Fallback: if convertedAt isn't present, rely on updatedAt/createdAt window.
          // (We may not have updatedAt in this select; keep this as a safe fallback.)
          // If no usable timestamp, count it as 0 to avoid false stats.
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(leadCounts, statusKey) && statusKey !== "converted") {
        leadCounts[statusKey] += 1;
      }
    });


    const totalLeads = Object.values(leadCounts).reduce((a, b) => a + b, 0);
    const conversionRate = totalLeads ? Math.round((leadCounts.converted / totalLeads) * 100) : 0;
    const activeLeads = Math.max(0, totalLeads - toNumber(leadCounts.converted) - toNumber(leadCounts.lost));

    const totalDeals = allDeals.length;
    const totalRevenue = allDeals.reduce((sum, deal) => sum + toNumber(deal.amount || deal.value), 0);

    const monthlyRevenue = Array.from({ length: 6 }, () => 0);
    allDeals.forEach((deal) => {
      const when = new Date(deal.createdAt || deal.updatedAt || now);
      if (Number.isNaN(when.getTime()) || when < sixMonthsAgo) return;

      const monthOffset = (when.getFullYear() - sixMonthsAgo.getFullYear()) * 12 + (when.getMonth() - sixMonthsAgo.getMonth());
      if (monthOffset < 0 || monthOffset > 5) return;

      monthlyRevenue[monthOffset] += toNumber(deal.amount || deal.value);
    });

    const dealsByStage = allDeals.reduce((acc, deal) => {
      const stageKey = normalizeStageKey(deal.stage);
      acc[stageKey] = (acc[stageKey] || 0) + 1;
      return acc;
    }, {});

    const stageSummary = allDeals.reduce((acc, deal) => {
      const stageKey = normalizeStageKey(deal.stage);
      const amount = toNumber(deal.amount || deal.value);
      if (!acc[stageKey]) {
        acc[stageKey] = { count: 0, revenue: 0 };
      }
      acc[stageKey].count += 1;
      acc[stageKey].revenue += amount;
      return acc;
    }, {});

    const managerScoreMap = allDeals.reduce((acc, deal) => {
      const owner = deal.assignedTo;
      const ownerName = owner?.name || owner?.username || owner?.email || "Unassigned";
      if (!acc[ownerName]) {
        acc[ownerName] = {
          total: 0,
          won: 0,
          advanced: 0,
          revenue: 0,
          cycleDays: 0,
          cycleCount: 0,
        };
      }

      const stageKey = normalizeStageKey(deal.stage);
      const amount = toNumber(deal.amount || deal.value);
      const closingDate = deal.closingDate || deal.updatedAt || deal.createdAt;
      const createdDate = deal.createdAt || closingDate;
      const cycleMs = new Date(closingDate) - new Date(createdDate);
      const cycleDays = Number.isFinite(cycleMs) && cycleMs >= 0 ? Math.round(cycleMs / (1000 * 60 * 60 * 24)) : 0;

      acc[ownerName].total += 1;
      acc[ownerName].revenue += amount;
      if (cycleDays > 0) {
        acc[ownerName].cycleDays += cycleDays;
        acc[ownerName].cycleCount += 1;
      }

      if (stageKey === "won") {
        acc[ownerName].won += 1;
        acc[ownerName].advanced += 1;
      } else if (["negotiation", "proposal", "value_proposition"].includes(stageKey)) {
        acc[ownerName].advanced += 1;
      }

      return acc;
    }, {});

    const maxOwnerRevenue = Math.max(1, ...Object.values(managerScoreMap).map((entry) => toNumber(entry.revenue)));

    const managerPerformance = Object.entries(managerScoreMap).reduce((acc, [ownerName, entry]) => {
      const total = Math.max(1, toNumber(entry.total));
      const winRate = Math.round((toNumber(entry.won) / total) * 100);
      const progressRate = Math.round((toNumber(entry.advanced) / total) * 100);
      const revenueScore = (toNumber(entry.revenue) / maxOwnerRevenue) * 100;
      const score = Math.round((winRate * 0.5) + (progressRate * 0.3) + (revenueScore * 0.2));

      acc[ownerName] = {
        score: Math.max(0, Math.min(100, score)),
        deals: toNumber(entry.total),
        won: toNumber(entry.won),
        revenue: toNumber(entry.revenue),
        winRate,
        avgCycleDays: entry.cycleCount > 0 ? Math.round(entry.cycleDays / entry.cycleCount) : 0,
      };

      return acc;
    }, {});

    const totalBillAmount = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
    const totalPaidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalPayables = Math.max(0, totalBillAmount - totalPaidAmount);

    const stats = {
      totalUsers,
      managers,
      employees,
      totalRevenue,
      totalDeals,
      totalLeads,
      activeLeads,
      conversionRate,
      totalVendors,
      totalPayables,
      overdueBills,
      // Product stats
      totalProducts,
      totalStock: totalAvailableStock,
      availableStock: totalAvailableStock,
      sellableStock: totalAvailableStock,
      reservedStock: totalReservedStock,
      committedStock: totalReservedStock,
      soldStock: totalSoldStock,
      physicalStock: totalPhysicalStock,
      netFreeStock,
      inventoryRiskBuffer,
      stockConversionRate,
      pipelinePressureRate,
      lowStockItems,
      serviceAlerts,
      // additional fields for charts
      revenueTrend: monthlyRevenue,
      dealsByStage,
      stageSummary,
      managerPerformance,
      employeeTrend: employeeTrend,
      leadCounts,
      reportRange: range,
      reportRangeStart: start,
      reportRangeEnd: end,
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

