const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../middleware/authMiddleware");
const { permitDealAccess, getUserDealsFilter, getTeamMembers } = require("../middleware/dealAuth");
const Deal = require("../models/deal");
const Lead = require("../models/lead");
const Customer = require("../models/customer");
const Contact = require("../models/contact");
const Item = require("../models/item");
const Activity = require("../models/activity");
const Notification = require("../models/notification");
const User = require("../models/user");
const DealView = require("../models/dealView");
const AppSettings = require("../models/appSettings");
const { sendLowStockCustomerEmail } = require("../utils/mailer");

// DEBUG: Test notification endpoint
router.post("/test-notification", async (req, res) => {
  try {
    const admins = await User.find({ role: { $regex: /^admin$/i } }).select("_id name username");
    if (!admins.length) {
      return res.status(404).json({ message: "No admin users found" });
    }

    const firstDeal = await Deal.findOne().select("_id").lean();
    if (!firstDeal?._id) {
      return res.status(400).json({ message: "No deals found. Create at least one deal before testing notifications." });
    }

    const message = `[DEBUG] Test notification for admins at ${new Date().toLocaleString()}`;
    await Notification.insertMany(
      admins.map((admin) => ({
        dealId: firstDeal._id,
        message,
        fromStage: "need_analysis",
        toStage: "need_analysis",
        changedBy: admin._id,
        changedByName: admin.name || admin.username || "Admin",
        recipients: [admin._id],
        isRead: false,
      }))
    );

    res.json({ message: `Test notification sent to ${admins.length} admin(s)` });
  } catch (err) {
    console.error("Test notification error:", err);
    res.status(500).json({ message: err.message });
  }
});

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

const getPublicBaseUrl = async (req) => {
  let settings = null;
  try {
    settings = await AppSettings.findOne().select("backendUrl").lean();
  } catch (_error) {
    settings = null;
  }

  const configuredBaseUrl =
    String(settings?.backendUrl || process.env.BACKEND_URL || process.env.API_URL || "").trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const host = String(req.get("host") || "").trim();
  if (!host) {
    return `http://localhost:${process.env.PORT || 5000}`;
  }

  return `${req.protocol}://${host}`;
};

const buildLowStockResponseUrls = async ({ req, dealId }) => {
  const token = jwt.sign(
    {
      dealId: String(dealId),
      purpose: "low_stock_response",
    },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "14d" }
  );

  const baseUrl = await getPublicBaseUrl(req);
  return {
    yesUrl: `${baseUrl}/api/deals/stock-response?action=yes&token=${encodeURIComponent(token)}`,
    noUrl: `${baseUrl}/api/deals/stock-response?action=no&token=${encodeURIComponent(token)}`,
  };
};

const appendRestockNote = (value) => {
  const existing = String(value || "").trim();
  const note = "Waiting for restock";
  if (!existing) return note;
  if (existing.toLowerCase().includes(note.toLowerCase())) return existing;
  return `${existing}\n${note}`;
};

const markDealWaitingForRestock = async (dealId) => {
  if (!dealId) return;

  const deal = await Deal.findById(dealId).select("_id nextStep description");
  if (!deal) return;

  await Deal.findByIdAndUpdate(
    dealId,
    {
      $set: {
        nextStep: appendRestockNote(deal.nextStep),
        description: appendRestockNote(deal.description || deal.nextStep),
        waitingForRestock: true,
      },
    },
    { new: false }
  );
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
  need_analysis: ["value_proposition", "proposal_price_quote", "qualification", "lost"],
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

const getUserDisplayName = (user) => user?.name || user?.username || "User";

const getProposalApprovalRecipients = async ({ requester, deal }) => {
  const recipients = [];
  const seen = new Set();

  const pushUser = (candidate) => {
    const id = String(candidate?._id || candidate || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    recipients.push(id);
  };

  const assignedManagerId = deal?.assignedTo?.reportsTo;
  if (assignedManagerId) {
    const manager = await User.findById(assignedManagerId).select("_id role");
    if (manager?._id && String(manager.role || "").toUpperCase() === "MANAGER") {
      pushUser(manager._id);
    }
  }

  if (!recipients.length && requester?.reportsTo) {
    const manager = await User.findById(requester.reportsTo).select("_id role");
    if (manager?._id && String(manager.role || "").toUpperCase() === "MANAGER") {
      pushUser(manager._id);
    }
  }

  return recipients;
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

const getDealCustomerEmail = async (deal) => {
  const directEmail = String(deal?.email || "").trim();
  if (directEmail) return directEmail;

  const customerId = deal?.customerId?._id || deal?.customerId;
  if (!customerId) return "";

  try {
    const customer = await Customer.findById(customerId).select("email").lean();
    return String(customer?.email || "").trim();
  } catch (_err) {
    return "";
  }
};

const notifyLowStockToCustomer = async ({ req, deal, item, availableQuantity, requestedQuantity }) => {
  const recipient = await getDealCustomerEmail(deal);
  if (!recipient) return;

  const customerName =
    String(deal?.name || "").trim() ||
    [String(deal?.firstName || "").trim(), String(deal?.lastName || "").trim()].filter(Boolean).join(" ") ||
    "Customer";

  try {
    const responseUrls = await buildLowStockResponseUrls({ req, dealId: deal?._id });
    await sendLowStockCustomerEmail({
      to: recipient,
      customerName,
      company: String(deal?.company || "").trim(),
      itemName: String(item?.name || item?.sku || "Product").trim(),
      requestedQuantity,
      availableQuantity,
      ...responseUrls,
    });
  } catch (emailError) {
    console.error("Low-stock customer email failed:", emailError.message);
  }
};

const notifyLowStockToAdmins = async ({ deal, item, availableQuantity, requestedQuantity, actor }) => {
  const admins = await User.find({ role: { $regex: /^admin$/i } }).select("_id");
  if (admins.length === 0 || !deal?._id) {
    return;
  }

  const itemName = String(item?.name || item?.sku || "Product").trim() || "Product";
  const dealName = String(deal?.name || "").trim() || "Deal";
  const companyName = String(deal?.company || "").trim();
  const contactName = String(deal?.contact || deal?.firstName || deal?.name || "").trim() || "Customer";
  const emailText = String(deal?.email || "").trim() || "-";
  const phoneText = String(deal?.phone || deal?.mobile || "").trim() || "-";
  const availableText = Number.isFinite(Number(availableQuantity)) ? Number(availableQuantity) : 0;
  const requestedText = Number.isFinite(Number(requestedQuantity)) ? Number(requestedQuantity) : 0;
  const companySegment = companyName ? ` for ${companyName}` : "";
  const changedById = actor?._id || deal?.assignedTo || admins[0]?._id;
  const changedByName = actor?.name || actor?.username || "Employee";
  const stageLabel = String(normalizeDealStage(deal.stage || "need_analysis") || "need_analysis").replace(/_/g, " ");
  if (!changedById) {
    return;
  }

  const message =
    `Need Analysis - Wait for refill. Customer needs ${itemName}${companySegment}, but it is in low stock. ` +
    `Requested: ${requestedText}. Available: ${availableText}. ` +
    `Customer: ${contactName}. Email: ${emailText}. Phone: ${phoneText}. ` +
    `Updated by employee: ${changedByName}. Current stage: ${stageLabel}. Please refill inventory.`;

  await Notification.insertMany(
    admins.map((admin) => ({
      dealId: deal._id,
      message,
      fromStage: normalizeDealStage(deal.stage || "need_analysis"),
      toStage: normalizeDealStage(deal.stage || "need_analysis"),
      changedBy: changedById,
      changedByName,
      recipients: [admin._id],
      isRead: false,
    }))
  );
  console.log(`Low-stock YES notification sent to ${admins.length} admin(s) for deal ${deal._id}`);
};

const notifyCustomerWaitingForRestockToAdmins = async ({ deal, item, availableQuantity, requestedQuantity, actor = null }) => {
  const admins = await User.find({ role: { $regex: /^admin$/i } }).select("_id");
  if (admins.length === 0 || !deal?._id) {
    return;
  }

  const itemName =
    String(item?.name || item?.sku || "").trim() ||
    String(deal?.product?.name || deal?.product?.sku || "").trim() ||
    "Product";
  const companyName = String(deal?.company || "").trim() || "-";
  const customerName =
    String(deal?.contact || "").trim() ||
    String(deal?.firstName || "").trim() ||
    String(deal?.name || "").trim() ||
    "Customer";
  const emailText = String(deal?.email || "").trim() || "-";
  const phoneText = String(deal?.phone || deal?.mobile || "").trim() || "-";
  const availableText = Number.isFinite(Number(availableQuantity)) ? Number(availableQuantity) : 0;
  const requestedText = Number.isFinite(Number(requestedQuantity)) ? Number(requestedQuantity) : 0;
  let changedById = actor?._id || deal?.assignedTo || admins[0]?._id;
  let changedByName = actor?.name || actor?.username || "Employee";

  if (!actor && deal?.assignedTo) {
    const assignedEmployee = await User.findById(deal.assignedTo).select("_id name username role").lean();
    if (assignedEmployee?._id) {
      changedById = assignedEmployee._id;
      const employeeName = assignedEmployee.name || assignedEmployee.username || "Employee";
      const employeeRole = String(assignedEmployee.role || "EMPLOYEE").toUpperCase();
      changedByName = `${employeeName} (${employeeRole})`;
    }
  }

  if (!changedById) {
    return;
  }

  const message =
    `Need Analysis - Wait for refill. Customer confirmed waiting for restock. Product: ${itemName}. ` +
    `Requested: ${requestedText}. Available: ${availableText}. ` +
    `Customer: ${customerName}. Company: ${companyName}. Email: ${emailText}. Phone: ${phoneText}. ` +
    `Updated by employee: ${changedByName}. Please refill inventory.`;

  await Notification.insertMany(
    admins.map((admin) => ({
      dealId: deal._id,
      message,
      fromStage: normalizeDealStage(deal.stage || "need_analysis"),
      toStage: normalizeDealStage(deal.stage || "need_analysis"),
      changedBy: changedById,
      changedByName,
      recipients: [admin._id],
      isRead: false,
    }))
  );
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
  const stageKey = normalizeDealStage(payload.stage || "qualification");
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

const getManagerLeadScopeIds = async (managerId) => {
  const leads = await Lead.find({
    $or: [
      {
        $and: [
          { assignedTo: managerId },
          { $or: [{ assignedByRole: "ADMIN" }, { assignedByRole: { $exists: false } }, { assignedByRole: null }, { assignedByRole: "" }] },
        ],
      },
      {
        $and: [
          { assignedBy: managerId },
          { assignedByRole: "MANAGER" },
        ],
      },
    ],
  }).select("_id");

  return leads.map((lead) => lead._id);
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
      const managerLeadIds = await getManagerLeadScopeIds(req.user._id);
      accessFilter = {
        $or: [
          { assignedTo: req.user._id },
          { assignedTo: { $in: teamIds } },
          { sourceLeadId: { $in: managerLeadIds } },
        ],
      };
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
      .populate({
        path: "assignedTo",
        select: "name username role employee_id reportsTo",
        populate: {
          path: "reportsTo",
          select: "name username role employee_id",
        },
      })
      .populate({
        path: "sourceLeadId",
        select: "assignedBy assignedTo",
        populate: [
          { path: "assignedBy", select: "name username role employee_id" },
          { path: "assignedTo", select: "name username role employee_id" },
        ],
      })
      .populate("customerId", "name company email phone")
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
      const managerLeadIds = await getManagerLeadScopeIds(req.user._id);
      filter.$or.push({ assignedTo: { $in: teamIds } });
      filter.$or.push({ sourceLeadId: { $in: managerLeadIds } });
    }
    
    const deals = await Deal.find(filter)
      .populate({
        path: "assignedTo",
        select: "name username role employee_id reportsTo",
        populate: {
          path: "reportsTo",
          select: "name username role employee_id",
        },
      })
      .populate({
        path: "sourceLeadId",
        select: "assignedBy assignedTo",
        populate: [
          { path: "assignedBy", select: "name username role employee_id" },
          { path: "assignedTo", select: "name username role employee_id" },
        ],
      })
      .populate("customerId", "name company email phone")
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
      stage,
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

    if (lowStockOnCreate) {
      await notifyLowStockToAdmins({
        deal,
        item: resolvedItem,
        availableQuantity,
        requestedQuantity,
        actor: req.user,
      });
    }

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
      .populate({
        path: "assignedTo",
        select: "name username role employee_id reportsTo",
        populate: {
          path: "reportsTo",
          select: "name username role employee_id",
        },
      })
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
    await Promise.all(
      createdDeals.map(async (deal) => {
        await syncDealContact(deal);
        await syncCustomerFromDeal(deal);
        await syncCustomerStatusFromLatestDeal(deal.customerId);
      })
    );

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

    const isNeedAnalysisToProposal =
      normalizeDealStage(oldStage) === "need_analysis" && normalizeDealStage(nextStage) === "proposal_price_quote";
    if (isNeedAnalysisToProposal) {
      const itemType = String(itemForValidation?.type || "").toLowerCase();
      const inferredAvailableQuantity = Number(itemForValidation?.stock ?? itemForValidation?.quantity ?? 0);
      const treatAsProduct = itemType === "product" || (itemType !== "service" && Number.isFinite(inferredAvailableQuantity));

      if (treatAsProduct) {
        const nextQuantity = Object.prototype.hasOwnProperty.call(updates, "quantity")
          ? parseOptionalNumber(updates.quantity)
          : parseOptionalNumber(req.deal.quantity);
        const availableQuantity = Number(itemForValidation?.stock ?? itemForValidation?.quantity ?? 0);
        if (nextQuantity === null || nextQuantity <= 0) {
          return res.status(400).json({ message: "Quantity is required when moving a product deal to Proposal stage" });
        }
        if (Number.isFinite(availableQuantity) && nextQuantity > availableQuantity) {
          await markDealWaitingForRestock(req.deal._id);
          await notifyLowStockToAdmins({
            deal: req.deal,
            item: itemForValidation,
            availableQuantity,
            requestedQuantity: nextQuantity,
            actor: req.user,
          });
          await notifyLowStockToCustomer({
            req,
            deal: req.deal,
            item: itemForValidation,
            availableQuantity,
            requestedQuantity: nextQuantity,
          });
          return res.status(400).json({
            message: `Low stock. Available quantity is ${availableQuantity}.`,
            availableQuantity,
            requestedQuantity: nextQuantity,
          });
        }
        updates.quantity = nextQuantity;
        updates.waitingForRestock = false;
      } else if (itemType === "service") {
        const nextBillingCycle = Object.prototype.hasOwnProperty.call(updates, "billingCycle")
          ? normalizeBillingCycle(updates.billingCycle)
          : normalizeBillingCycle(req.deal.billingCycle);
        if (!nextBillingCycle) {
          return res.status(400).json({
            message: "Plan / Billing Cycle is required when moving a service deal to Proposal stage",
          });
        }
        updates.billingCycle = nextBillingCycle;
      } else {
        return res.status(400).json({ message: "Unable to determine item type for this deal" });
      }
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
        .populate({
          path: "assignedTo",
          select: "name username role employee_id reportsTo",
          populate: {
            path: "reportsTo",
            select: "name username role employee_id",
          },
        })
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
      const admins = await User.find({ role: { $regex: /^admin$/i } });
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
    ...req.body,
    stage,
    reason: req.body.reason,
  };

  return updateDealHandler(req, res);
});

router.put("/:id/waiting-restock", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate("product", "name sku stock quantity")
      .populate("assignedTo", "_id name username role")
      .lean();

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    await markDealWaitingForRestock(deal._id);

    const item = deal.product || null;
    const requestedQuantity = Number(req.body?.requestedQuantity ?? deal.quantity ?? 0);
    const availableQuantity = Number(req.body?.availableQuantity ?? item?.stock ?? item?.quantity ?? 0);

    await notifyCustomerWaitingForRestockToAdmins({
      deal,
      item,
      availableQuantity,
      requestedQuantity,
      actor: req.user,
    });

    return res.json({
      message: "Deal marked as waiting for restock and admin notified",
      dealId: deal._id,
    });
  } catch (err) {
    console.error("waiting-restock update error:", err);
    return res.status(500).json({ message: err.message || "Failed to mark waiting for restock" });
  }
});

router.get("/stock-response", async (req, res) => {
  const action = String(req.query.action || "").trim().toLowerCase();
  const token = String(req.query.token || "").trim();

  if (!["yes", "no"].includes(action) || !token) {
    return res.status(400).send(`
      <html><body style="font-family: Arial, sans-serif; padding: 32px;">
        <h2>Invalid response link</h2>
        <p>This stock response link is invalid or incomplete.</p>
      </body></html>
    `);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    if (decoded?.purpose !== "low_stock_response" || !decoded?.dealId) {
      throw new Error("Invalid response token");
    }

    const deal = await Deal.findById(decoded.dealId);
    if (!deal) {
      return res.status(404).send(`
        <html><body style="font-family: Arial, sans-serif; padding: 32px;">
          <h2>Request not found</h2>
          <p>This deal could not be found.</p>
        </body></html>
      `);
    }

    if (action === "yes") {
      await markDealWaitingForRestock(deal._id);

      const item = await resolveDealItem(deal.product);
      const requestedQuantity = Number(deal.quantity || 0);
      const availableQuantity = Number(item?.stock ?? item?.quantity ?? deal?.product?.stock ?? deal?.product?.quantity ?? 0);
      await notifyCustomerWaitingForRestockToAdmins({
        deal,
        item,
        availableQuantity,
        requestedQuantity,
      });

      const openActivities = await Activity.find({
        "relatedTo.recordType": "Deal",
        "relatedTo.recordId": deal._id,
        status: { $nin: ["Completed", "Cancelled"] },
      }).select("_id notes description");

      if (openActivities.length > 0) {
        await Activity.bulkWrite(
          openActivities.map((activity) => ({
            updateOne: {
              filter: { _id: activity._id },
              update: {
                $set: {
                  notes: appendRestockNote(activity.notes),
                  description: appendRestockNote(activity.description || activity.notes),
                },
              },
            },
          }))
        );
      }

      return res.send(`
        <html><body style="font-family: Arial, sans-serif; padding: 32px; color: #111827;">
          <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
            <h2 style="margin-top: 0; color: #166534;">Thank you for your confirmation</h2>
            <p>We have kept your request active.</p>
            <p>Our team will follow up with full details as soon as inventory is restocked.</p>
          </div>
        </body></html>
      `);
    }

    const previousStage = deal.stage;
    if (String(deal.stage || "").toLowerCase() !== "lost") {
      await Deal.findByIdAndUpdate(
        deal._id,
        {
          $set: {
            stage: "lost",
            status: "Inactive",
            reason: "Customer declined to wait for inventory restock",
          },
          $push: {
            timeline: {
              $each: [
                {
                  fromStage: previousStage,
                  toStage: "lost",
                  changedBy: null,
                  changedAt: new Date(),
                  userName: "Customer Response",
                },
              ],
              $position: 0,
            },
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      await Activity.deleteMany({
        "relatedTo.recordType": "Deal",
        "relatedTo.recordId": deal._id,
        status: { $nin: ["Completed", "Cancelled"] },
      });
    }

    return res.send(`
      <html><body style="font-family: Arial, sans-serif; padding: 32px; color: #111827;">
        <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
          <h2 style="margin-top: 0; color: #991b1b;">Thank you for your interest</h2>
          <p>Your request has been closed as per your response.</p>
          <p>If you would like to continue later, our team will be happy to help you.</p>
        </div>
      </body></html>
    `);
  } catch (error) {
    return res.status(400).send(`
      <html><body style="font-family: Arial, sans-serif; padding: 32px;">
        <h2>Response link expired</h2>
        <p>This stock response link is invalid or has expired.</p>
      </body></html>
    `);
  }
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

router.get("/:id/proposal-workspace", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate("assignedTo", "name username role reportsTo")
      .populate("customerId", "name company email phone")
      .populate("product", "name sku category price type status stock serviceType billingCycle")
      .populate("proposalDraft.approvedBy", "name username")
      .lean();

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const historyCriteria = [
      ...(deal.customerId ? [{ customerId: deal.customerId._id || deal.customerId }] : []),
      ...(deal.company ? [{ company: deal.company }] : []),
      ...(deal.contact ? [{ contact: deal.contact }] : []),
    ];

    const history = historyCriteria.length
      ? await Deal.find({
          _id: { $ne: deal._id },
          $or: historyCriteria,
        })
          .select("name company contact amount stage status updatedAt createdAt")
          .sort({ updatedAt: -1 })
          .limit(8)
          .lean()
      : [];

    const notifications = await Notification.find({
      dealId: deal._id,
      recipients: req.user._id,
    })
      .select("message isRead createdAt fromStage toStage changedByName")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ deal, history, notifications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-draft", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const update = {
      "proposalDraft.title": String(req.body?.title || "").trim(),
      "proposalDraft.introduction": String(req.body?.introduction || "").trim(),
      "proposalDraft.problem": String(req.body?.problem || "").trim(),
      "proposalDraft.solution": String(req.body?.solution || "").trim(),
      "proposalDraft.scope": String(req.body?.scope || "").trim(),
      "proposalDraft.pricingNotes": String(req.body?.pricingNotes || "").trim(),
      "proposalDraft.terms": String(req.body?.terms || "").trim(),
    };

    const deal = await Deal.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate("assignedTo", "name username role reportsTo")
      .populate("proposalDraft.approvedBy", "name username");

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    res.json({ deal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-approval-request", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id).populate("assignedTo", "name username role reportsTo");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const recipients = await getProposalApprovalRecipients({ requester: req.user, deal });
    if (!recipients.length) {
      return res.status(400).json({ message: "No assigned manager found for approval notification." });
    }

    deal.proposalDraft = deal.proposalDraft || {};
    deal.proposalDraft.status = "pending_approval";
    deal.proposalDraft.approvalRequestedAt = new Date();
    deal.proposalDraft.approvalRespondedAt = null;
    deal.proposalDraft.approvedBy = null;
    deal.proposalDraft.approvalComment = "";
    await deal.save();

    const requesterName = getUserDisplayName(req.user);
    await Notification.insertMany(
      recipients.map((recipient) => ({
        dealId: deal._id,
        message: `Proposal approval requested for deal "${deal.name}" by ${requesterName}`,
        fromStage: String(deal.stage || ""),
        toStage: "proposal_approval_requested",
        changedBy: req.user._id,
        changedByName: requesterName,
        recipients: [recipient],
        isRead: false,
      }))
    );

    res.json({ message: "Proposal sent to manager for approval.", status: deal.proposalDraft.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-approval", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (!["ADMIN", "MANAGER"].includes(role)) {
      return res.status(403).json({ message: "Only managers or admins can approve proposals." });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be approve or reject" });
    }

    const comment = String(req.body?.comment || "").trim();
    const deal = await Deal.findById(req.params.id).populate("assignedTo", "name username");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    deal.proposalDraft = deal.proposalDraft || {};
    deal.proposalDraft.status = action === "approve" ? "approved" : "rejected";
    deal.proposalDraft.approvalRespondedAt = new Date();
    deal.proposalDraft.approvedBy = req.user._id;
    deal.proposalDraft.approvalComment = comment;
    await deal.save();

    if (deal.assignedTo?._id) {
      await Notification.create({
        dealId: deal._id,
        message:
          action === "approve"
            ? `Proposal approved for deal "${deal.name}" by ${getUserDisplayName(req.user)}`
            : `Proposal rejected for deal "${deal.name}" by ${getUserDisplayName(req.user)}`,
        fromStage: String(deal.stage || ""),
        toStage: action === "approve" ? "proposal_approved" : "proposal_rejected",
        changedBy: req.user._id,
        changedByName: getUserDisplayName(req.user),
        recipients: [deal.assignedTo._id],
        isRead: false,
      });
    }

    res.json({ message: `Proposal ${action}d successfully.`, status: deal.proposalDraft.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-send-client", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (String(deal?.proposalDraft?.status || "") !== "approved") {
      return res.status(400).json({ message: "Proposal must be approved before sending to client." });
    }

    deal.proposalDraft.status = "sent_to_client";
    deal.proposalDraft.clientSentAt = new Date();
    deal.proposalDraft.clientSentBy = req.user._id;
    await deal.save();

    res.json({ message: "Proposal sent to client.", status: deal.proposalDraft.status });
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
      .populate('leadId', 'name company status')
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
