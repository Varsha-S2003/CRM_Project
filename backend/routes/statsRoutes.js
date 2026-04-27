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

// GET /api/stats - return some dashboard statistics (admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      managers,
      employees,
      totalProducts,
      allItems,
      allDeals,
      leadAgg,
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
      Deal.find({})
        .select("stage amount value assignedTo createdAt updatedAt")
        .populate("assignedTo", "name username email"),
      Lead.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Vendor.countDocuments(),
      Bill.find({}).select("amount status"),
      Payment.find({}).select("amount"),
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

    const leadCounts = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, proposal: 0, proposal_sent: 0 };
    leadAgg.forEach((e) => {
      if (leadCounts.hasOwnProperty(e._id)) leadCounts[e._id] = e.count;
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

    const managerPerformance = allDeals.reduce((acc, deal) => {
      const owner = deal.assignedTo;
      const ownerName = owner?.name || owner?.username || owner?.email || "Unassigned";
      const stageKey = normalizeStageKey(deal.stage);
      const weight = stageKey === "won" ? 100 : stageKey === "negotiation" ? 70 : 40;
      acc[ownerName] = (acc[ownerName] || 0) + weight;
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
      managerPerformance,
      employeeTrend: employeeTrend,
      leadCounts,
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

