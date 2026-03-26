const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permitDealAccess, getUserDealsFilter, getTeamMembers } = require("../middleware/dealAuth");
const Deal = require("../models/deal");
const Customer = require("../models/customer");
const Contact = require("../models/contact");
const Item = require("../models/item");
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

const normalizeBillingCycle = (value) => String(value || "").trim().toLowerCase();

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const computeServiceLifecycle = (billingCycle, startDate = new Date()) => {
  const normalizedBillingCycle = normalizeBillingCycle(billingCycle);
  const durations = {
    monthly: 1,
    "6_months": 6,
    yearly: 12,
  };
  const durationMonths = durations[normalizedBillingCycle] || 1;
  const expiryDate = addMonths(startDate, durationMonths);
  return {
    startDate,
    expiryDate,
    nextBillingDate: expiryDate,
  };
};

const resolveDealItem = async (itemId) => {
  if (!itemId) {
    return null;
  }

  const item = await Item.findById(itemId).select(
    "_id name type status stock quantity serviceType billingCycle"
  );
  return item;
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

  if (Object.prototype.hasOwnProperty.call(normalized, "product")) {
    normalized.product = normalized.product || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "quantity")) {
    const quantity = parseOptionalNumber(normalized.quantity);
    normalized.quantity = Number.isNaN(quantity) ? null : quantity;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "billingCycle")) {
    normalized.billingCycle = normalizeBillingCycle(normalized.billingCycle);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "startDate")) {
    normalized.startDate = normalizeOptionalDate(normalized.startDate);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "expiryDate")) {
    normalized.expiryDate = normalizeOptionalDate(normalized.expiryDate);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "nextBillingDate")) {
    normalized.nextBillingDate = normalizeOptionalDate(normalized.nextBillingDate);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "employeeCount")) {
    const employeeCount = parseOptionalNumber(normalized.employeeCount);
    normalized.employeeCount = Number.isNaN(employeeCount) ? null : employeeCount;
  }

  if (normalized.address || ["street", "city", "state", "postalCode", "country"].some((field) => Object.prototype.hasOwnProperty.call(normalized, field))) {
    const sourceAddress = normalized.address || {};
    normalized.address = {
      street: String(sourceAddress.street ?? normalized.street ?? "").trim(),
      city: String(sourceAddress.city ?? normalized.city ?? "").trim(),
      state: String(sourceAddress.state ?? normalized.state ?? "").trim(),
      postalCode: String(sourceAddress.postalCode ?? normalized.postalCode ?? "").trim(),
      country: String(sourceAddress.country ?? normalized.country ?? "").trim(),
    };
    delete normalized.street;
    delete normalized.city;
    delete normalized.state;
    delete normalized.postalCode;
    delete normalized.country;
  }

  ["salutation", "firstName", "lastName", "title", "secondaryEmail", "mobile", "website", "industry", "nextStep", "dealType", "leadSource", "campaignSource", "description"].forEach((field) => {
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
  const salutation = String(payload.salutation || "").trim();
  const firstName = String(payload.firstName || "").trim();
  const company = String(payload.company || "").trim();
  const contact = String(payload.contact || "").trim();
  const email = String(payload.email || "").trim();
  const product = String(payload.product || "").trim();
  const quantity = parseOptionalNumber(payload.quantity);
  const billingCycle = normalizeBillingCycle(payload.billingCycle);
  const dealType = String(payload.dealType || "").trim();
  const dealSource = String(payload.leadSource || "").trim();
  const amount = Number(payload.amount);
  const closingDate = payload.closingDate ? new Date(payload.closingDate) : null;
  const isInactiveService = payload.itemType === "service" && String(payload.itemStatus || "").trim() === "Inactive";

  if (!name) {
    return "Deal Name is required";
  }

  if (!firstName) {
    return "First Name is required";
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

  if (!product) {
    return "Product is required";
  }

  if (payload.itemType === "product") {
    if (quantity === null || quantity <= 0) {
      return "Quantity is required for selected products";
    }
  }

  if (payload.itemType === "service" && !isInactiveService) {
    if (!billingCycle) {
      return "Plan / Billing Cycle is required for selected services";
    }
  }

  if (!dealType) {
    return "Deal Type is required";
  }

  if (!dealSource) {
    return "Deal Source is required";
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

const validateWonDealAgainstItem = ({ item, quantity, billingCycle }) => {
  if (!item) {
    return "Selected product not found";
  }

  const itemType = item.type === "service" ? "service" : "product";
  if (itemType === "product") {
    const requestedQuantity = parseOptionalNumber(quantity);
    const availableQuantity = Number(item.stock ?? item.quantity ?? 0);
    if (requestedQuantity === null || requestedQuantity <= 0) {
      return "Quantity is required for selected products";
    }
    if (requestedQuantity > availableQuantity) {
      return "Insufficient stock";
    }
    return null;
  }

  if (String(item.status || "").trim() === "Inactive") {
    return "Service is inactive";
  }

  if (!normalizeBillingCycle(billingCycle)) {
    return "Plan / Billing Cycle is required for selected services";
  }

  return null;
};

const getInactiveServiceLossReason = () => "Service is inactive";
const getOutOfStockLossReason = () => "Out of stock";
const getLowStockLossReason = () => "Low stock";

const shouldDowngradeWonServiceToLost = (item, stage) =>
  normalizeDealStage(stage) === "won" && item?.type === "service" && String(item.status || "").trim() === "Inactive";

const applyWonDealEffects = async ({ deal, item }) => {
  const itemType = item.type === "service" ? "service" : "product";

  if (itemType === "product") {
    const quantity = Number(deal.quantity ?? 0);
    await Item.findByIdAndUpdate(item._id, {
      $inc: { stock: -quantity },
    });
    return {
      startDate: null,
      expiryDate: null,
      nextBillingDate: null,
    };
  }

  const lifecycle = computeServiceLifecycle(deal.billingCycle || item.billingCycle || "monthly");
  return lifecycle;
};

const syncCustomerStatusFromLatestDeal = async (customerId) => {
  if (!customerId) return;

  const latestDeal = await Deal.findOne({ customerId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("stage status reason product");

  if (!latestDeal) {
    await Customer.findByIdAndUpdate(customerId, {
      status: "Active",
      reason: "",
      product: null,
    });
    return;
  }

  const status = latestDeal.status || getStatusFromStage(latestDeal.stage);
  await Customer.findByIdAndUpdate(customerId, {
    status,
    reason: status === "Inactive" ? String(latestDeal.reason || "").trim() : "",
    product: latestDeal.product || null,
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

  try {
    await Contact.create(contactPayload);
  } catch (error) {
    // Contact email is uniquely indexed in the legacy contacts collection.
    // Deal creation should not fail just because another contact already uses the same email.
    if (error?.code === 11000) {
      const fallbackPayload = { ...contactPayload };
      delete fallbackPayload.email;
      await Contact.create(fallbackPayload);
      return;
    }
    throw error;
  }
};

const syncCustomerFromDeal = async (deal) => {
  const normalizedEmail = String(deal.email || "").trim().toLowerCase();
  const customerName = String(deal.name || "").trim();
  const companyName = String(deal.company || "").trim();
  const primaryPhone = String(deal.contact || "").trim();
  const fallbackPhone = String(deal.phone || "").trim();

  let customer = deal.customerId ? await Customer.findById(deal.customerId) : null;

  if (!customer) {
    customer = await Customer.create({
      name: customerName || deal.name || "Customer",
      email: normalizedEmail || undefined,
      phone: primaryPhone || fallbackPhone,
      company: companyName,
      product: deal.product || null,
      status: deal.status || "Active",
      reason: deal.status === "Inactive" ? String(deal.reason || "").trim() : "",
      leadId: deal.sourceLeadId || null,
    });
  } else {
    customer.name = customerName || customer.name;
    customer.email = normalizedEmail || customer.email;
    customer.phone = primaryPhone || fallbackPhone || customer.phone || "";
    customer.company = companyName || customer.company;
    customer.product = deal.product || customer.product || null;
    customer.status = deal.status || customer.status || "Active";
    customer.reason = customer.status === "Inactive" ? String(deal.reason || customer.reason || "").trim() : "";
    if (!customer.leadId && deal.sourceLeadId) {
      customer.leadId = deal.sourceLeadId;
    }
    await customer.save();
  }

  if (!deal.customerId || String(deal.customerId) !== String(customer._id)) {
    deal.customerId = customer._id;
    await deal.save();
  }

  return customer;
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
      .populate("product", "name sku category price type status stock serviceType billingCycle")
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
      .populate("product", "name sku category price type status stock serviceType billingCycle")
      .sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  let createdDeal = null;
  let createdDealStockRollback = null;
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
      product,
      salutation,
      firstName,
      lastName,
      title,
      secondaryEmail,
      mobile,
      website,
      industry,
      employeeCount,
      address,
      quantity,
      billingCycle,
    } = req.body;
    const resolvedItem = await resolveDealItem(product);
    if (product && !resolvedItem) {
      return res.status(400).json({ message: "Selected product not found" });
    }
    const validationError = validateCreateDealInput({
      name,
      salutation,
      firstName,
      lastName,
      title,
      company,
      contact,
      email,
      phone,
      dealType,
      leadSource,
      amount: amount ?? value,
      closingDate,
      probability,
      product,
      quantity,
      billingCycle,
      itemType: resolvedItem?.type || "",
      itemStatus: resolvedItem?.status || "",
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
    const itemType = resolvedItem?.type === "service" ? "service" : "product";
    const requestedQuantity = parseOptionalNumber(quantity) ?? 0;
    const availableQuantity = Number(resolvedItem?.stock ?? resolvedItem?.quantity ?? 0);
    const inactiveServiceOnCreate = itemType === "service" && String(resolvedItem?.status || "").trim() === "Inactive";
    const outOfStockOnCreate = itemType === "product" && availableQuantity <= 0;
    const lowStockOnCreate = itemType === "product" && availableQuantity > 0 && requestedQuantity > availableQuantity;
    const forceLostOnCreate = inactiveServiceOnCreate || outOfStockOnCreate || lowStockOnCreate;
    const effectiveStage = forceLostOnCreate ? "lost" : finalStage;
    const finalReason = inactiveServiceOnCreate
      ? String(reason || "").trim() || getInactiveServiceLossReason()
      : outOfStockOnCreate
        ? String(reason || "").trim() || getOutOfStockLossReason()
        : lowStockOnCreate
          ? String(reason || "").trim() || getLowStockLossReason()
          : reason;
    const derived = deriveStatusAndReason({ stage: effectiveStage, reason: finalReason });
    if (derived.error) {
      return res.status(400).json({ message: derived.error });
    }

    const normalizedDealPayload = applyForecastFields(normalizeDealBusinessFields({
      sourceLeadId: sourceLeadId || null,
      name,
      company,
      amount: amount ?? value,
      contact,
      email,
      phone,
      secondaryEmail,
      mobile,
      closingDate,
      probability,
      expectedRevenue,
      salutation,
      firstName,
      lastName,
      title,
      website,
      industry,
      employeeCount,
      address,
      nextStep,
      dealType,
      leadSource,
      campaignSource,
      description,
      product: resolvedItem?._id || null,
      quantity: resolvedItem?.type === "product" ? parseOptionalNumber(quantity) : null,
      billingCycle: resolvedItem?.type === "service" ? normalizeBillingCycle(billingCycle) : "",
      stage: effectiveStage,
      status: derived.status,
      reason: derived.reason,
      assignedTo: effectiveAssignedTo,
    }));

    if (!forceLostOnCreate && derived.status === "Active" && normalizeDealStage(finalStage) === "won" && itemType === "service") {
      const wonValidationError = validateWonDealAgainstItem({
        item: resolvedItem,
        quantity: normalizedDealPayload.quantity,
        billingCycle: normalizedDealPayload.billingCycle,
      });
      if (wonValidationError) {
        return res.status(400).json({ message: wonValidationError });
      }
      const lifecycle = computeServiceLifecycle(normalizedDealPayload.billingCycle || resolvedItem.billingCycle || "monthly");
      normalizedDealPayload.startDate = lifecycle.startDate;
      normalizedDealPayload.expiryDate = lifecycle.expiryDate;
      normalizedDealPayload.nextBillingDate = lifecycle.nextBillingDate;
    }

    deal = await Deal.create(normalizedDealPayload);
    createdDeal = deal;

    if (!forceLostOnCreate && derived.status === "Active" && normalizeDealStage(finalStage) === "won" && itemType === "product") {
      const wonValidationError = validateWonDealAgainstItem({
        item: resolvedItem,
        quantity: normalizedDealPayload.quantity,
        billingCycle: normalizedDealPayload.billingCycle,
      });
      if (wonValidationError) {
        await Deal.findByIdAndDelete(deal._id);
        return res.status(400).json({ message: wonValidationError });
      }

      try {
        const quantityValue = Number(normalizedDealPayload.quantity) || 0;
        await Item.findByIdAndUpdate(resolvedItem._id, {
          $inc: { stock: -quantityValue },
        });
        createdDealStockRollback = { itemId: resolvedItem._id, quantity: quantityValue };
      } catch (stockErr) {
        await Deal.findByIdAndDelete(deal._id);
        throw stockErr;
      }
    }

    await syncDealContact(deal);
    await syncCustomerFromDeal(deal);
    await syncCustomerStatusFromLatestDeal(deal.customerId);

    const populatedDeal = await Deal.findById(deal._id)
      .populate("assignedTo", "name username role employee_id")
      .populate("product", "name sku category price type status stock serviceType billingCycle");

    const responseDeal = populatedDeal.toObject ? populatedDeal.toObject() : populatedDeal;
    if (inactiveServiceOnCreate) {
      responseDeal.warningMessage = "Service is inactive. Deal moved to Lost.";
    } else if (outOfStockOnCreate) {
      responseDeal.warningMessage = "Out of stock. Deal moved to Lost.";
    } else if (lowStockOnCreate) {
      responseDeal.warningMessage = "Low stock. Deal moved to Lost.";
    }

    res.status(201).json(responseDeal);
  } catch (err) {
    if (createdDealStockRollback?.itemId && createdDealStockRollback.quantity > 0) {
      try {
        await Item.findByIdAndUpdate(createdDealStockRollback.itemId, {
          $inc: { stock: createdDealStockRollback.quantity },
        });
      } catch (rollbackErr) {
        console.error("Failed to rollback inventory after deal create error:", rollbackErr);
      }
    }
    if (createdDeal?._id) {
      try {
        await Deal.findByIdAndDelete(createdDeal._id);
      } catch (cleanupErr) {
        console.error("Failed to cleanup deal after create error:", cleanupErr);
      }
    }
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
  let stockRollback = null;
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Authorize first (req.deal populated by middleware)
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    const currentStageKey = normalizeDealStage(req.deal.stage);
    if (
      currentStageKey === "won" &&
      (Object.prototype.hasOwnProperty.call(req.body, "product") ||
        Object.prototype.hasOwnProperty.call(req.body, "quantity") ||
        Object.prototype.hasOwnProperty.call(req.body, "billingCycle"))
    ) {
      return res.status(400).json({
        message: "Won deals cannot change product, quantity, or billing cycle",
      });
    }

    let stageChanged = false;
    const oldStage = req.deal.stage;
    let nextStage = oldStage;
    let warningMessage = "";
    
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
    if (Object.prototype.hasOwnProperty.call(req.body, "product")) {
      const resolvedItem = await resolveDealItem(req.body.product);
      if (req.body.product && !resolvedItem) {
        return res.status(400).json({ message: "Selected product not found" });
      }
      updates.product = resolvedItem?._id || null;
    }

    const itemForValidation = await resolveDealItem(updates.product || req.deal.product);
    if (shouldDowngradeWonServiceToLost(itemForValidation, nextStage)) {
      nextStage = "lost";
      updates.stage = "lost";
      updates.reason = String(updates.reason || req.deal.reason || getInactiveServiceLossReason()).trim();
      warningMessage = "Service is inactive. Deal moved to Lost.";
      stageChanged = normalizeDealStage(oldStage) !== "lost";
    }

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

    let lifecycleUpdates = {};
    const itemIdForWonValidation = Object.prototype.hasOwnProperty.call(req.body, "product")
      ? req.body.product
      : req.deal.product;

    if (normalizeDealStage(nextStage) === "won") {
      const item = await resolveDealItem(itemIdForWonValidation);
      const wonValidationError = validateWonDealAgainstItem({
        item,
        quantity: Object.prototype.hasOwnProperty.call(updates, "quantity") ? updates.quantity : req.deal.quantity,
        billingCycle: Object.prototype.hasOwnProperty.call(updates, "billingCycle")
          ? updates.billingCycle
          : req.deal.billingCycle,
      });
      if (wonValidationError) {
        return res.status(400).json({ message: wonValidationError });
      }

      lifecycleUpdates = await applyWonDealEffects({
        deal: {
          ...req.deal.toObject(),
          ...updates,
          quantity: Object.prototype.hasOwnProperty.call(updates, "quantity") ? updates.quantity : req.deal.quantity,
          billingCycle: Object.prototype.hasOwnProperty.call(updates, "billingCycle")
            ? updates.billingCycle
            : req.deal.billingCycle,
        },
        item,
      });

      if (item.type !== "service") {
        stockRollback = {
          itemId: item._id,
          quantity: Number(
            Object.prototype.hasOwnProperty.call(updates, "quantity") ? updates.quantity : req.deal.quantity
          ) || 0,
        };
      }

      Object.assign(updates, lifecycleUpdates);
    }

    let updatedDeal;
    try {
      updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      })
        .populate("assignedTo", "name username role employee_id")
        .populate("product", "name sku category price type status stock serviceType billingCycle");
    } catch (error) {
      if (stockRollback?.itemId && stockRollback.quantity > 0) {
        await Item.findByIdAndUpdate(stockRollback.itemId, { $inc: { stock: stockRollback.quantity } });
      }
      throw error;
    }

    if (!updatedDeal) {
      if (stockRollback?.itemId && stockRollback.quantity > 0) {
        await Item.findByIdAndUpdate(stockRollback.itemId, { $inc: { stock: stockRollback.quantity } });
      }
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
    await syncCustomerFromDeal(updatedDeal);
    await syncCustomerStatusFromLatestDeal(updatedDeal.customerId);
    const responseDeal = updatedDeal.toObject ? updatedDeal.toObject() : updatedDeal;
    if (warningMessage) {
      responseDeal.warningMessage = warningMessage;
    }
    res.json(responseDeal);
  } catch (err) {
    console.error('Deal update error:', err);
    if (stockRollback?.itemId && stockRollback.quantity > 0) {
      try {
        await Item.findByIdAndUpdate(stockRollback.itemId, { $inc: { stock: stockRollback.quantity } });
      } catch (rollbackErr) {
        console.error("Failed to rollback inventory after deal update error:", rollbackErr);
      }
    }
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
  let restockRollback = null;
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Double-check authorization
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    if (normalizeDealStage(req.deal.stage) === "won") {
      const item = await resolveDealItem(req.deal.product);
      if (item && item.type !== "service") {
        const quantity = Number(req.deal.quantity || 0);
        if (quantity > 0) {
          await Item.findByIdAndUpdate(item._id, {
            $inc: { stock: quantity },
          });
          restockRollback = { itemId: item._id, quantity };
        }
      }
    }

    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) {
      if (restockRollback?.itemId && restockRollback.quantity > 0) {
        await Item.findByIdAndUpdate(restockRollback.itemId, { $inc: { stock: -restockRollback.quantity } });
      }
      return res.status(404).json({ message: "Deal not found" });
    }
    await Contact.deleteMany({ sourceDealId: deal._id });
    await syncCustomerStatusFromLatestDeal(deal.customerId);
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    if (restockRollback?.itemId && restockRollback.quantity > 0) {
      try {
        await Item.findByIdAndUpdate(restockRollback.itemId, { $inc: { stock: -restockRollback.quantity } });
      } catch (rollbackErr) {
        console.error("Failed to rollback inventory after deal delete error:", rollbackErr);
      }
    }
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
