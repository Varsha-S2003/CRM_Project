const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const Customer = require("../models/customer");
const Deal = require("../models/deal");

const normalizeDealStage = (stage) => {
  const value = String(stage || "").trim().toLowerCase().replace(/\s+/g, "_");
  const map = {
    closed_won: "won",
    closed_lost: "lost",
    proposal: "proposal_price_quote",
    negotiation: "negotiate",
  };
  return map[value] || value;
};

const getStatusFromStage = (stage) =>
  normalizeDealStage(stage) === "lost" ? "Inactive" : "Active";

const normalizeStatus = (status, stage) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "inactive") return "Inactive";
  if (value === "active") return "Active";
  return getStatusFromStage(stage);
};

const getDealSortTimestamp = (deal) => {
  const updatedAt = new Date(deal?.updatedAt || 0).getTime();
  const createdAt = new Date(deal?.createdAt || 0).getTime();
  return Math.max(updatedAt || 0, createdAt || 0);
};

router.get("/", verifyToken, async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || "").trim();
    const requestedStatusKey = requestedStatus.toLowerCase();
    const normalizedRequestedStatus =
      requestedStatusKey === "active"
        ? "Active"
        : requestedStatusKey === "inactive"
        ? "Inactive"
        : "";

    if (requestedStatus && !normalizedRequestedStatus) {
      return res.status(400).json({ message: "status must be Active or Inactive" });
    }

    const customers = await Customer.find()
      .populate("leadId", "name email phone status source")
      .populate("product", "name sku category price")
      .sort({ createdAt: -1 });

    const customerIds = customers.map((customer) => customer._id);
    const leadIds = customers
      .map((customer) => customer.leadId?._id || customer.leadId)
      .filter(Boolean);

    const relevantDeals = await Deal.find({
      $or: [
        { customerId: { $in: customerIds } },
        { sourceLeadId: { $in: leadIds } },
      ],
    })
      .populate("product", "name sku category price")
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("customerId sourceLeadId stage status reason product leadSource updatedAt createdAt");

    const customerIdToCustomerKey = new Map(
      customers.map((customer) => [String(customer._id), String(customer._id)])
    );
    const leadIdToCustomerKey = new Map(
      customers
        .filter((customer) => customer.leadId)
        .map((customer) => [
          String(customer.leadId?._id || customer.leadId),
          String(customer._id),
        ])
    );

    const latestDealByCustomerKey = new Map();
    relevantDeals.forEach((deal) => {
      const customerKeyFromCustomerId = customerIdToCustomerKey.get(String(deal.customerId || ""));
      const customerKeyFromLeadId = leadIdToCustomerKey.get(String(deal.sourceLeadId || ""));
      const customerKey = customerKeyFromCustomerId || customerKeyFromLeadId;
      if (!customerKey) return;

      const existingDeal = latestDealByCustomerKey.get(customerKey);
      if (!existingDeal || getDealSortTimestamp(deal) > getDealSortTimestamp(existingDeal)) {
        latestDealByCustomerKey.set(customerKey, deal);
      }
    });

    const response = customers.map((customer) => {
      const latestDeal = latestDealByCustomerKey.get(String(customer._id));
      const derivedStatus = latestDeal
        ? normalizeStatus(latestDeal.status, latestDeal.stage)
        : normalizeStatus(customer.status, null);
      const derivedReason =
        derivedStatus === "Inactive"
          ? String(latestDeal?.reason || customer.reason || "").trim()
          : "";

      return {
        ...customer.toObject(),
        product: customer.product || latestDeal?.product || null,
        dealStage: latestDeal?.stage || "",
        dealStatus: latestDeal
          ? normalizeStatus(latestDeal.status, latestDeal.stage)
          : normalizeStatus(customer.status, null),
        dealReason: String(latestDeal?.reason || "").trim(),
        dealSource: String(latestDeal?.leadSource || customer.leadId?.source || "").trim(),
        dealCreatedAt: latestDeal?.createdAt || null,
        status: derivedStatus,
        reason: derivedReason,
      };
    });

    const filtered = normalizedRequestedStatus
      ? response.filter((customer) => customer.status === normalizedRequestedStatus)
      : response;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
