const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const Customer = require("../models/customer");
const Deal = require("../models/deal");
const Lead = require("../models/lead");
const { getTeamMembers } = require("../middleware/dealAuth");

const GSTIN_REGEX = /^[0-9]{2}[A-Z0-9]{13}$/;
const STATE_NAMES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const normalizeState = (value) => String(value || "").trim();
const normalizeGstin = (value) => String(value || "").trim().toUpperCase();

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

const getExpiryState = (expiryDate) => {
  if (!expiryDate) return "";
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return "";

  const now = new Date();
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Expired";
  if (diffDays <= 7) return "Expiring Soon";
  return "Active";
};

const getDaysRemaining = (expiryDate) => {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const diff = expiry.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const formatPlanLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "6_months") return "6 Months";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const toPurchasePayload = (deal, customer) => ({
  id: deal?._id || null,
  product: deal?.product || customer?.product || null,
  stage: String(deal?.stage || "").trim(),
  status: normalizeStatus(deal?.status, deal?.stage),
  reason: String(deal?.reason || "").trim(),
  source: String(deal?.leadSource || customer?.leadId?.source || "").trim(),
  createdAt: deal?.createdAt || null,
});

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

    const role = String(req.user?.role || "").toUpperCase();
    let customerFilter = {};

    if (role === "MANAGER") {
      const teamIds = await getTeamMembers(req.user._id);
      const visibleAssigneeIds = [req.user._id, ...teamIds];
      const assignedLeadIds = await Lead.find({
        $or: [
          {
            $and: [
              { assignedTo: req.user._id },
              {
                $or: [
                  { assignedByRole: "ADMIN" },
                  { assignedByRole: { $exists: false } },
                  { assignedByRole: null },
                  { assignedByRole: "" },
                ],
              },
            ],
          },
          {
            $and: [
              { assignedBy: req.user._id },
              { assignedByRole: "MANAGER" },
            ],
          },
        ],
      }).distinct("_id");
      const customerIdsFromLeadDeals = await Deal.find({
        sourceLeadId: { $in: assignedLeadIds },
      }).distinct("customerId");
      const customerIdsFromAssignedDeals = await Deal.find({
        assignedTo: { $in: visibleAssigneeIds },
      }).distinct("customerId");
      const visibleCustomerIds = [...customerIdsFromLeadDeals, ...customerIdsFromAssignedDeals].filter(Boolean);

      customerFilter = {
        $or: [
          { leadId: { $in: assignedLeadIds } },
          { _id: { $in: visibleCustomerIds } },
        ],
      };
    } else if (role === "EMPLOYEE") {
      const assignedLeadIds = await Lead.find({ assignedTo: req.user._id }).distinct("_id");
      const customerIdsFromLeadDeals = await Deal.find({
        sourceLeadId: { $in: assignedLeadIds },
      }).distinct("customerId");
      const customerIdsFromAssignedDeals = await Deal.find({
        assignedTo: req.user._id,
      }).distinct("customerId");
      const visibleCustomerIds = [...customerIdsFromLeadDeals, ...customerIdsFromAssignedDeals].filter(Boolean);

      customerFilter = {
        $or: [
          { leadId: { $in: assignedLeadIds } },
          { _id: { $in: visibleCustomerIds } },
        ],
      };
    }

    const customers = await Customer.find(customerFilter)
      .populate("leadId", "name email phone status source")
      .populate("product", "name sku category price type status serviceType billingCycle")
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
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate("product", "name sku category price type status serviceType billingCycle")
      .select("customerId sourceLeadId stage status reason product leadSource updatedAt createdAt quantity billingCycle startDate expiryDate nextBillingDate");

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
    const purchasesByCustomerKey = new Map();
    relevantDeals.forEach((deal) => {
      const customerKeyFromCustomerId = customerIdToCustomerKey.get(String(deal.customerId || ""));
      const customerKeyFromLeadId = leadIdToCustomerKey.get(String(deal.sourceLeadId || ""));
      const customerKey = customerKeyFromCustomerId || customerKeyFromLeadId;
      if (!customerKey) return;

      const existingPurchases = purchasesByCustomerKey.get(customerKey) || [];
      existingPurchases.push(deal);
      purchasesByCustomerKey.set(customerKey, existingPurchases);

      const existingDeal = latestDealByCustomerKey.get(customerKey);
      if (!existingDeal || getDealSortTimestamp(deal) > getDealSortTimestamp(existingDeal)) {
        latestDealByCustomerKey.set(customerKey, deal);
      }
    });

    const response = customers.map((customer) => {
      const latestDeal = latestDealByCustomerKey.get(String(customer._id));
      const purchases = (purchasesByCustomerKey.get(String(customer._id)) || [])
        .sort((a, b) => getDealSortTimestamp(b) - getDealSortTimestamp(a))
        .map((deal) => toPurchasePayload(deal, customer));
      const derivedStatus = latestDeal
        ? normalizeStatus(latestDeal.status, latestDeal.stage)
        : normalizeStatus(customer.status, null);
      const derivedReason =
        derivedStatus === "Inactive"
          ? String(latestDeal?.reason || customer.reason || "").trim()
          : "";

      const serviceSubscriptions = relevantDeals
        .filter((deal) => {
          const customerKeyFromCustomerId = customerIdToCustomerKey.get(String(deal.customerId || ""));
          const customerKeyFromLeadId = leadIdToCustomerKey.get(String(deal.sourceLeadId || ""));
          return (customerKeyFromCustomerId || customerKeyFromLeadId) === String(customer._id);
        })
        .filter((deal) => normalizeDealStage(deal.stage) === "won" && deal.product && deal.product.type === "service")
        .map((deal) => {
          const expiryDate = deal.expiryDate || deal.nextBillingDate || null;
          const daysRemaining = getDaysRemaining(expiryDate);
          return {
            dealId: deal._id,
            productId: deal.product?._id || null,
            serviceName: deal.product?.name || deal.name || "-",
            plan: formatPlanLabel(deal.billingCycle || deal.product?.billingCycle),
            startDate: deal.startDate || deal.createdAt || null,
            expiryDate,
            nextBillingDate: deal.nextBillingDate || expiryDate || null,
            daysRemaining,
            alertStatus: getExpiryState(expiryDate),
          };
        })
        .sort((a, b) => {
          const aExpiry = new Date(a.expiryDate || 0).getTime();
          const bExpiry = new Date(b.expiryDate || 0).getTime();
          return aExpiry - bExpiry;
        });

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
        purchases,
        status: derivedStatus,
        reason: derivedReason,
        serviceSubscriptions,
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

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const state = normalizeState(req.body?.state);
    const gstin = normalizeGstin(req.body?.gstin);

    if (gstin && !GSTIN_REGEX.test(gstin)) {
      return res.status(400).json({ message: "GSTIN must be a valid 15-character GSTIN" });
    }

    if (state && !STATE_NAMES.includes(state)) {
      return res.status(400).json({ message: "State must be selected from the approved list" });
    }

    const updates = {
      state,
      gstin,
    };

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate("leadId", "name email phone status source")
      .populate("product", "name sku category price type status serviceType billingCycle");

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
