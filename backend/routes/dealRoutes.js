const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permitDealAccess, getUserDealsFilter, getTeamMembers } = require("../middleware/dealAuth");
const Deal = require("../models/deal");
const Customer = require("../models/customer");
const Contact = require("../models/contact");
const Notification = require("../models/notification");
const User = require("../models/user");
const DealView = require("../models/dealView");

const normalizeDealStage = (stage) => {
  const value = String(stage || "").trim();
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const map = {
    closed_won: "won",
    closed_lost: "lost",
    proposal: "proposal_price_quote",
    negotiation: "negotiate",
  };

  return map[normalized] || normalized;
};

const getStageFilterValues = (stage) => {
  const normalized = normalizeDealStage(stage);
  const legacyMap = {
    qualification: "Qualification",
    need_analysis: "Need Analysis",
    value_proposition: "Value Proposition",
    proposal_price_quote: "Proposal",
    negotiate: "Negotiation",
    won: "Closed Won",
    lost: "Closed Lost",
  };

  return Array.from(new Set([normalized, legacyMap[normalized]].filter(Boolean)));
};

const getStatusFromStage = (stage) =>
  normalizeDealStage(stage) === "lost" ? "Inactive" : "Active";

const getDefaultProbabilityForStage = (stage) => {
  const normalizedStage = normalizeDealStage(stage);
  const probabilityMap = {
    qualification: 15,
    need_analysis: 35,
    value_proposition: 55,
    proposal_price_quote: 60,
    negotiate: 80,
    won: 100,
    lost: 0,
  };

  return probabilityMap[normalizedStage] ?? null;
};

const allowedTransitions = {
  qualification: ["need_analysis", "lost"],
  need_analysis: ["value_proposition", "qualification", "lost"],
  value_proposition: ["proposal_price_quote", "need_analysis", "lost"],
  proposal_price_quote: ["negotiate", "value_proposition", "lost"],
  negotiate: ["won", "proposal_price_quote", "lost"],
  won: [],
  lost: [],
};

const deriveStatusAndReason = ({ stage, reason, currentReason }) => {
  const status = getStatusFromStage(stage);
  if (status === "Inactive") {
    const resolvedReason = String(reason ?? currentReason ?? "").trim();
    if (!resolvedReason) {
      return {
        error: "Reason is required when moving a deal to Closed Lost",
      };
    }
    return { status, reason: resolvedReason };
  }

  return { status, reason: "" };
};

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
};

const normalizeOptionalDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDealBusinessFields = (payload) => {
  const normalized = { ...payload };

  if (!Object.prototype.hasOwnProperty.call(normalized, "amount") && Object.prototype.hasOwnProperty.call(normalized, "value")) {
    normalized.amount = normalized.value;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "amount")) {
    normalized.amount = Number(normalized.amount) || 0;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "probability")) {
    const probability = parseOptionalNumber(normalized.probability);
    normalized.probability = Number.isNaN(probability) ? null : probability;
  }

  if (
    (!Object.prototype.hasOwnProperty.call(normalized, "probability") ||
      normalized.probability === null ||
      normalized.probability === undefined ||
      normalized.probability === "") &&
    Object.prototype.hasOwnProperty.call(normalized, "stage")
  ) {
    normalized.probability = getDefaultProbabilityForStage(normalized.stage);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "expectedRevenue")) {
    const expectedRevenue = parseOptionalNumber(normalized.expectedRevenue);
    normalized.expectedRevenue = Number.isNaN(expectedRevenue) ? null : expectedRevenue;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "closingDate")) {
    normalized.closingDate = normalizeOptionalDate(normalized.closingDate);
  }

  ["nextStep", "dealType", "leadSource", "campaignSource", "description"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = String(normalized[field] || "").trim();
    }
  });

  return normalized;
};

const applyForecastFields = (dealPayload) => {
  const normalized = { ...dealPayload };
  if (normalized.probability === null || normalized.probability === undefined) {
    return normalized;
  }

  const amount = Number(normalized.amount) || 0;
  normalized.expectedRevenue = Number(((amount * normalized.probability) / 100).toFixed(2));
  return normalized;
};

const validateCreateDealInput = (payload) => {
  const name = String(payload.name || "").trim();
  const company = String(payload.company || "").trim();
  const contact = String(payload.contact || "").trim();
  const email = String(payload.email || "").trim();
  const amount = Number(payload.amount);
  const closingDate = payload.closingDate ? new Date(payload.closingDate) : null;

  if (!name) {
    return "Deal Name is required";
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Amount (Deal Value) is required and must be greater than 0";
  }

  if (!company) {
    return "Company is required";
  }

  if (!contact) {
    return "Contact Person is required";
  }

  if (!email) {
    return "Email is required";
  }

  if (!closingDate || Number.isNaN(closingDate.getTime())) {
    return "Closing Date is required";
  }

  if (payload.probability !== undefined && payload.probability !== null && payload.probability !== "") {
    const probability = Number(payload.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      return "Probability must be between 0 and 100";
    }
  }

  return null;
};

const syncCustomerStatusFromLatestDeal = async (customerId) => {
  if (!customerId) return;

  const latestDeal = await Deal.findOne({ customerId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("stage status reason");

  if (!latestDeal) {
    await Customer.findByIdAndUpdate(customerId, {
      status: "Active",
      reason: "",
    });
    return;
  }

  const status = latestDeal.status || getStatusFromStage(latestDeal.stage);
  await Customer.findByIdAndUpdate(customerId, {
    status,
    reason: status === "Inactive" ? String(latestDeal.reason || "").trim() : "",
  });
};

const syncDealContact = async (deal) => {
  const normalizedEmail = String(deal.email || "").trim().toLowerCase();
  const contactPayload = {
    sourceDealId: deal._id,
    name: deal.contact || deal.name,
    company: deal.company || "",
    phone: deal.phone || "",
    source: "Deal",
    convertedAt: deal.createdAt || new Date(),
  };

  if (normalizedEmail) {
    contactPayload.email = normalizedEmail;
  }

  let contact = await Contact.findOne({ sourceDealId: deal._id });
  if (!contact && deal.sourceLeadId) {
    contact = await Contact.findOne({ sourceLeadId: deal.sourceLeadId });
  }

  if (contact) {
    Object.assign(contact, contactPayload);
    await contact.save();
    return;
  }

  await Contact.create(contactPayload);
};

const buildAdvancedDealFilter = (filters, user) => {
  if (!filters || !Array.isArray(filters.conditions) || filters.conditions.length === 0) {
    return {};
  }

  const processCondition = (condition) => {
    const query = {};

    switch (condition.field) {
      case "owner":
        query.assignedTo = user._id;
        break;
      case "stage":
        if (condition.operator === "equals") {
          query.stage = { $in: getStageFilterValues(condition.value) };
        } else if (condition.operator === "in") {
          const values = Array.isArray(condition.value) ? condition.value : [condition.value];
          query.stage = { $in: values.flatMap((value) => getStageFilterValues(value)) };
        }
        break;
      case "status":
        if (condition.operator === "equals") {
          query.status = condition.value;
        } else if (condition.operator === "in") {
          query.status = { $in: Array.isArray(condition.value) ? condition.value : [condition.value] };
        }
        break;
      case "createdAt":
      case "updatedAt": {
        query[condition.field] = {};
        if (condition.operator === "after" && condition.value) {
          query[condition.field].$gte = new Date(condition.value);
        } else if (condition.operator === "before" && condition.value) {
          const endDate = new Date(condition.value);
          endDate.setHours(23, 59, 59, 999);
          query[condition.field].$lte = endDate;
        } else if (condition.operator === "between" && condition.from && condition.to) {
          query[condition.field].$gte = new Date(condition.from);
          const endDate = new Date(condition.to);
          endDate.setHours(23, 59, 59, 999);
          query[condition.field].$lte = endDate;
        }
        break;
      }
      default:
        if (condition.operator === "equals") {
          query[condition.field] = condition.value;
        } else if (condition.operator === "contains") {
          query[condition.field] = { $regex: condition.value, $options: "i" };
        } else if (condition.operator === "in") {
          query[condition.field] = { $in: Array.isArray(condition.value) ? condition.value : [condition.value] };
        }
        break;
    }

    return query;
  };

  const conditions = filters.conditions
    .map(processCondition)
    .filter((condition) => Object.keys(condition).length > 0);

  if (conditions.length === 0) {
    return {};
  }

  return filters.logic === "OR" ? { $or: conditions } : { $and: conditions };
};

router.post("/filter", verifyToken, async (req, res) => {
  try {
    const { filters, sort = { createdAt: -1 }, limit = 100, skip = 0, status } = req.body;
    const baseConditions = [];
    let accessFilter = getUserDealsFilter(req.user);

    if (req.user.role.toUpperCase() === "MANAGER") {
      const teamIds = await getTeamMembers(req.user._id);
      accessFilter = { $or: [{ assignedTo: req.user._id }, { assignedTo: { $in: teamIds } }] };
    }

    if (Object.keys(accessFilter).length > 0) {
      baseConditions.push(accessFilter);
    }

    if (status && ["Active", "Inactive"].includes(String(status).trim())) {
      baseConditions.push({ status: String(status).trim() });
    }

    const advancedFilter = buildAdvancedDealFilter(filters, req.user);
    if (Object.keys(advancedFilter).length > 0) {
      baseConditions.push(advancedFilter);
    }

    const finalFilter =
      baseConditions.length === 0 ? {} : baseConditions.length === 1 ? baseConditions[0] : { $and: baseConditions };

    const deals = await Deal.find(finalFilter)
      .populate("assignedTo", "name username role employee_id")
      .sort(sort)
      .limit(limit)
      .skip(skip);

    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/views", verifyToken, async (req, res) => {
  try {
    const reqUserId = req.user._id;

    const views = await DealView.find({
      $or: [
        { userId: reqUserId, visibility: "private" },
        { visibility: "shared" },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(views);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/views", verifyToken, async (req, res) => {
  try {
    const viewData = { ...req.body, userId: req.user._id };

    if (!viewData.name) {
      return res.status(400).json({ message: "View name required" });
    }

    if (!["private", "shared"].includes(viewData.visibility)) {
      viewData.visibility = "private";
    }

    const view = await DealView.create(viewData);
    res.status(201).json(view);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/views/:id", verifyToken, async (req, res) => {
  try {
    const view = await DealView.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!view) {
      return res.status(404).json({ message: "View not found or access denied" });
    }

    Object.assign(view, req.body);
    await view.save();

    res.json(view);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/views/:id", verifyToken, async (req, res) => {
  try {
    const view = await DealView.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!view) {
      return res.status(404).json({ message: "View not found or access denied" });
    }

    res.json({ message: "View deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const filter = getUserDealsFilter(req.user);
    const requestedStatus = String(req.query.status || "").trim();

    if (requestedStatus) {
      if (!["Active", "Inactive"].includes(requestedStatus)) {
        return res.status(400).json({ message: "status must be Active or Inactive" });
      }
      filter.status = requestedStatus;
    }

    // For managers, extend filter to include team
    if (req.user.role.toUpperCase() === 'MANAGER') {
      const teamIds = await getTeamMembers(req.user._id);
      filter.$or.push({ assignedTo: { $in: teamIds } });
    }
    
    const deals = await Deal.find(filter)
      .populate('assignedTo', 'name username role employee_id')
      .sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      sourceLeadId,
      name,
      company,
      amount,
      value,
      contact,
      email,
      phone,
      stage,
      reason,
      assignedTo,
      closingDate,
      probability,
      expectedRevenue,
      nextStep,
      dealType,
      leadSource,
      campaignSource,
      description,
    } = req.body;
    const validationError = validateCreateDealInput({
      name,
      company,
      contact,
      email,
      phone,
      amount: amount ?? value,
      closingDate,
      probability,
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    const effectiveAssignedTo = assignedTo || req.user._id;

    let deal = null;
    if (sourceLeadId) {
      deal = await Deal.findOne({ sourceLeadId });
    }

    if (deal) {
      return res.json(deal);
    }

    const finalStage = stage || "qualification";
    const derived = deriveStatusAndReason({ stage: finalStage, reason });
    if (derived.error) {
      return res.status(400).json({ message: derived.error });
    }

    deal = await Deal.create(applyForecastFields(normalizeDealBusinessFields({
      sourceLeadId: sourceLeadId || null,
      name,
      company,
      amount: amount ?? value,
      contact,
      email,
      phone,
      closingDate,
      probability,
      expectedRevenue,
      nextStep,
      dealType,
      leadSource,
      campaignSource,
      description,
      stage: finalStage,
      status: derived.status,
      reason: derived.reason,
      assignedTo: effectiveAssignedTo,
    })));

    await syncDealContact(deal);
    await syncCustomerStatusFromLatestDeal(deal.customerId);

    res.status(201).json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/bulk", verifyToken, async (req, res) => {
  try {
    const { deals } = req.body;
    if (!Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({ message: "Deals array required" });
    }

    const normalizedDeals = deals
      .map((deal) =>
        applyForecastFields(normalizeDealBusinessFields({
          name: String(deal.name || "").trim(),
          company: String(deal.company || "").trim(),
          amount: deal.amount,
          contact: String(deal.contact || "").trim(),
          email: String(deal.email || "").trim(),
          phone: String(deal.phone || "").trim(),
          closingDate: deal.closingDate,
          probability: deal.probability,
          expectedRevenue: deal.expectedRevenue,
          nextStep: String(deal.nextStep || "").trim(),
          dealType: String(deal.dealType || "").trim(),
          leadSource: String(deal.leadSource || "").trim(),
          campaignSource: String(deal.campaignSource || "").trim(),
          description: String(deal.description || "").trim(),
          stage: deal.stage || "qualification",
          reason: String(deal.reason || "").trim(),
          assignedTo: req.user._id, // Bulk import assigns to current user
        }))
      )
      .filter((deal) => deal.name);

    if (normalizedDeals.length === 0) {
      return res.status(400).json({ message: "No valid deals found in import" });
    }

    const invalidLostDeal = normalizedDeals.find(
      (deal) => getStatusFromStage(deal.stage) === "Inactive" && !deal.reason
    );
    if (invalidLostDeal) {
      return res.status(400).json({
        message: `Reason is required for Closed Lost deals (error at: ${invalidLostDeal.name})`,
      });
    }

    const dealsWithStatus = normalizedDeals.map((deal) => {
      const derived = deriveStatusAndReason({ stage: deal.stage, reason: deal.reason });
      return {
        ...deal,
        status: derived.status,
        reason: derived.reason,
      };
    });

    const createdDeals = await Deal.insertMany(dealsWithStatus);
    await Promise.all(createdDeals.map((deal) => syncDealContact(deal)));
    await Promise.all(createdDeals.map((deal) => syncCustomerStatusFromLatestDeal(deal.customerId)));

    res.status(201).json({
      message: `${createdDeals.length} deals imported successfully`,
      count: createdDeals.length,
      deals: createdDeals,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const updateDealHandler = async (req, res) => {
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Authorize first (req.deal populated by middleware)
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    let stageChanged = false;
    const oldStage = req.deal.stage;
    let nextStage = oldStage;
    
    if (req.body.stage !== undefined) {
      const newStage = req.body.stage;
      const currentStageKey = normalizeDealStage(oldStage);
      const newStageKey = normalizeDealStage(newStage);

      if (currentStageKey !== newStageKey && 
          (!allowedTransitions[currentStageKey] || !allowedTransitions[currentStageKey].includes(newStageKey))) {
        return res.status(400).json({ 
          message: `Invalid stage transition: from "${oldStage}" to "${newStage}" not allowed` 
        });
      }
      if (currentStageKey !== newStageKey) {
        stageChanged = true;
        nextStage = newStage;
      }
    }

    const updates = normalizeDealBusinessFields({ ...req.body });
    delete updates.status;

    const amountForForecast = Object.prototype.hasOwnProperty.call(updates, "amount")
      ? Number(updates.amount) || 0
      : Number(req.deal.amount) || 0;
    const probabilityForForecast = Object.prototype.hasOwnProperty.call(updates, "probability")
      ? updates.probability
      : parseOptionalNumber(req.deal.probability);

    if (Object.prototype.hasOwnProperty.call(updates, "amount") || Object.prototype.hasOwnProperty.call(updates, "probability")) {
      if (probabilityForForecast !== null && !Number.isNaN(probabilityForForecast)) {
        updates.expectedRevenue = Number(((amountForForecast * probabilityForForecast) / 100).toFixed(2));
      } else if (!Object.prototype.hasOwnProperty.call(updates, "expectedRevenue")) {
        updates.expectedRevenue = null;
      }
    }

    const derived = deriveStatusAndReason({
      stage: nextStage,
      reason: updates.reason,
      currentReason: req.deal.reason,
    });
    if (derived.error) {
      return res.status(400).json({ message: derived.error });
    }
    updates.status = derived.status;
    updates.reason = derived.reason;

    let updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedDeal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    // **STAGE CHANGE LOGIC**
    if (stageChanged) {
      // Add to timeline without re-validating full document (supports legacy deals)
      const timelineEvent = {
        fromStage: oldStage,
        toStage: updates.stage,
        changedBy: req.user._id,
        changedAt: new Date(),
        userName: req.user.name || req.user.username
      };

      updatedDeal = await Deal.findByIdAndUpdate(
        updatedDeal._id,
        {
          $push: {
            timeline: {
              $each: [timelineEvent],
              $position: 0,
            },
          },
        },
        { new: true }
      );
      
      // Create notification
      const changerRole = req.user.role.toUpperCase();
      let recipients = [];
      
      if (changerRole === 'EMPLOYEE') {
        // Notify manager chain + admin
        let manager = await User.findById(req.user.reportsTo).populate('reportsTo');
        while (manager) {
          recipients.push(manager._id);
          manager = manager.reportsTo;
        }
      } else if (changerRole === 'MANAGER') {
        // Notify upper managers + admin
        let manager = await User.findById(req.user.reportsTo).populate('reportsTo');
        while (manager) {
          recipients.push(manager._id);
          manager = manager.reportsTo;
        }
      }
      // Always notify admins (find all ADMIN users)
      const admins = await User.find({ role: 'ADMIN' });
      recipients.push(...admins.map(a => a._id));
      
      if (recipients.length > 0) {
        await Notification.insertMany(recipients.map(recipient => ({
          dealId: updatedDeal._id,
          message: `Deal "${updatedDeal.name}" moved from ${oldStage.replace(/_/g, ' ')} to ${updates.stage.replace(/_/g, ' ')} by ${req.user.name || req.user.username}`,
          fromStage: oldStage,
          toStage: updates.stage,
          changedBy: req.user._id,
          changedByName: req.user.name || req.user.username,
          recipients: [recipient]
        })));
      }
    }

    await syncDealContact(updatedDeal);
    await syncCustomerStatusFromLatestDeal(updatedDeal.customerId);
    res.json(updatedDeal);
  } catch (err) {
    console.error('Deal update error:', err);
    res.status(500).json({ message: err.message });
  }
};

router.put("/:id", verifyToken, permitDealAccess(), updateDealHandler);

router.put("/:id/stage", verifyToken, permitDealAccess(), async (req, res) => {
  const stage = req.body.stage;
  if (stage === undefined) {
    return res.status(400).json({ message: "stage is required" });
  }

  req.body = {
    stage,
    reason: req.body.reason,
  };

  return updateDealHandler(req, res);
});

router.delete("/:id", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Double-check authorization
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    await Contact.deleteMany({ sourceDealId: deal._id });
    await syncCustomerStatusFromLatestDeal(deal.customerId);
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Notification APIs
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      recipients: req.user._id 
    })
      .populate('dealId', 'name stage amount company')
      .populate('changedBy', 'name username')
      .sort({ createdAt: -1 });

    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      notifications,
      unreadCount,
      hasUnread: unreadCount > 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/notifications/:ids/read", verifyToken, async (req, res) => {
  try {
    const ids = req.params.ids.split(',').map(id => id.trim());
    if (ids.length === 0) {
      return res.status(400).json({ message: "No notification IDs provided" });
    }

    const result = await Notification.updateMany(
      { 
        _id: { $in: ids },
        recipients: req.user._id  // Only own notifications
      },
      { isRead: true }
    );

    res.json({
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
