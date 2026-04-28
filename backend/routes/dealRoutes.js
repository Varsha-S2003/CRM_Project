const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/authMiddleware");
const { permitDealAccess, getTeamMembers } = require("../middleware/dealAuth");
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
const { sendLowStockCustomerEmail, sendLeadProposalEmail } = require("../utils/mailer");
const { generateProposalPdfBuffer } = require("../utils/proposalPdf");

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
    quarterly: 3,
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
    "_id name type status stock reservedStock soldStock quantity serviceType billingCycle price cost gst_percent hsn_sac"
  );
  return item;
};

const getSellerTaxProfile = async () => {
  const settings = await AppSettings.findOne().select("companyState companyGstin").lean();
  return {
    sellerState: String(settings?.companyState || "").trim(),
    sellerGstin: String(settings?.companyGstin || "").trim(),
  };
};

const normalizeState = (value) => String(value || "").trim();
const PRODUCT_GST_PERCENT_VALUES = [5, 12, 18, 28];

const computeTaxSummary = ({ item, quantity, customerState = "", sellerState = "", sellerGstin = "", customerGstin = "" }) => {
  if (!item) return null;

  const unitPrice = Number(item.price ?? item.cost ?? 0);
  let qty = Number(quantity ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) {
    qty = 1;
  }
  const taxableAmount = Number((unitPrice * qty).toFixed(2));
  const itemType = String(item.type || "").trim().toLowerCase();
  const rawGstPercent = Number(item.gst_percent);
  const warnings = [];
  let gstPercent = 18;

  if (itemType === "product") {
    if (PRODUCT_GST_PERCENT_VALUES.includes(rawGstPercent)) {
      gstPercent = rawGstPercent;
    } else {
      warnings.push(
        `Product GST is missing or invalid in item master for ${item.name || "selected item"}. Using default 18% until item GST is corrected to 5, 12, 18, or 28.`
      );
    }
  } else {
    gstPercent = Number.isFinite(rawGstPercent)
      ? Math.max(0, Math.min(100, rawGstPercent))
      : 18;
  }
  const gstAmount = Number(((taxableAmount * gstPercent) / 100).toFixed(2));
  const sameState =
    normalizeState(customerState).toLowerCase() &&
    normalizeState(customerState).toLowerCase() === normalizeState(sellerState).toLowerCase();

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (sameState) {
    cgst = Number((gstAmount / 2).toFixed(2));
    sgst = Number((gstAmount / 2).toFixed(2));
  } else {
    igst = gstAmount;
  }

  const grandTotal = Number((taxableAmount + gstAmount).toFixed(2));

  return {
    taxableAmount,
    gstPercent,
    gstAmount,
    cgst,
    sgst,
    igst,
    grandTotal,
    hsnSac: String(item.hsn_sac || "").trim(),
    sellerState: normalizeState(sellerState),
    sellerGstin: String(sellerGstin || "").trim(),
    customerState: normalizeState(customerState),
    customerGstin: String(customerGstin || "").trim(),
    placeOfSupply: normalizeState(customerState || sellerState),
    warnings,
  };
};

const applyTaxSummaryToPayload = (payload, taxSummary) => {
  if (!taxSummary) return payload;

  payload.taxableAmount = taxSummary.taxableAmount;
  payload.gstPercent = taxSummary.gstPercent;
  payload.gstAmount = taxSummary.gstAmount;
  payload.cgst = taxSummary.cgst;
  payload.sgst = taxSummary.sgst;
  payload.igst = taxSummary.igst;
  payload.grandTotal = taxSummary.grandTotal;
  payload.hsnSac = taxSummary.hsnSac;
  payload.placeOfSupply = taxSummary.placeOfSupply;
  payload.sellerState = taxSummary.sellerState;
  payload.sellerGstin = taxSummary.sellerGstin;
  payload.customerState = taxSummary.customerState;
  payload.customerGstin = taxSummary.customerGstin;
  return payload;
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

  if (Object.prototype.hasOwnProperty.call(normalized, "customerState")) {
    normalized.customerState = String(normalized.customerState || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "customerGstin")) {
    normalized.customerGstin = String(normalized.customerGstin || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "product")) {
    normalized.product = normalized.product || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "quantity")) {
    const quantity = parseOptionalNumber(normalized.quantity);
    normalized.quantity = Number.isNaN(quantity) ? null : quantity;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "usersOrSeats")) {
    const usersOrSeats = parseOptionalNumber(normalized.usersOrSeats);
    normalized.usersOrSeats = Number.isNaN(usersOrSeats) ? null : usersOrSeats;
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

const buildRoleScopedDealFilter = async (user) => {
  const role = String(user?.role || "").toUpperCase();

  if (role === "ADMIN") {
    return {};
  }

  if (role === "MANAGER") {
    const teamIds = await getTeamMembers(user._id);
    const managerLeadIds = await getManagerLeadScopeIds(user._id);
    return {
      $or: [
        { assignedTo: user._id },
        { assignedTo: { $in: teamIds } },
        { sourceLeadId: { $in: managerLeadIds } },
      ],
    };
  }

  if (role === "EMPLOYEE") {
    return { assignedTo: user._id };
  }

  return { assignedTo: user._id };
};

const buildCreatedProposalFilter = () => ({
  $or: [
    { "proposalDraft.title": { $exists: true, $nin: ["", null] } },
    { "proposalDraft.approvalRequestedAt": { $ne: null } },
    { "proposalDraft.approvalRespondedAt": { $ne: null } },
    { "proposalDraft.clientSentAt": { $ne: null } },
    {
      "proposalDraft.status": {
        $in: ["pending_approval", "approved", "changes_requested", "rejected", "sent_to_client"],
      },
    },
  ],
});

const getNotificationAssignableUsers = async (user) => {
  const role = String(user?.role || "").toUpperCase();

  if (role === "ADMIN") {
    return User.find({ role: { $regex: "^MANAGER$", $options: "i" } })
      .select("name username email role employee_id")
      .sort({ createdAt: -1 })
      .lean();
  }

  if (role === "MANAGER") {
    const teamIds = await getTeamMembers(user._id);
    if (!teamIds.length) return [];
    return User.find({ _id: { $in: teamIds } })
      .select("name username email role employee_id")
      .sort({ createdAt: -1 })
      .lean();
  }

  return [];
};

const parseNotificationIds = (input = []) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((id) => String(id || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
};

const validateWonDealAgainstItem = ({ item, quantity, billingCycle, reservedQuantity = 0 }) => {
  if (!item) {
    return "Selected product not found";
  }

  const itemType = item.type === "service" ? "service" : "product";
  if (itemType === "product") {
    const requestedQuantity = parseOptionalNumber(quantity);
    const reservedForDeal = Number(reservedQuantity || 0);
    const reservedQuantityGlobal = Number(item.reservedStock ?? 0);
    const availableQuantity = Number(item.stock ?? item.quantity ?? 0);
    if (requestedQuantity === null || requestedQuantity <= 0) {
      return "Quantity is required for selected products";
    }
    if (reservedForDeal >= requestedQuantity) {
      return null;
    }
    if (requestedQuantity > reservedQuantityGlobal && requestedQuantity > availableQuantity) {
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

const reserveProductStockForDeal = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) {
    throw new Error("Selected product not found");
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity is required for selected products");
  }

  const updated = await Item.findOneAndUpdate(
    { _id: itemId, stock: { $gte: qty } },
    { $inc: { stock: -qty, reservedStock: qty } },
    { new: true }
  ).select("_id stock reservedStock soldStock");

  if (!updated) {
    throw new Error("Insufficient stock");
  }

  return updated;
};

const releaseReservedProductStockForDeal = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) {
    throw new Error("Selected product not found");
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return null;
  }

  const updated = await Item.findOneAndUpdate(
    { _id: itemId, reservedStock: { $gte: qty } },
    { $inc: { stock: qty, reservedStock: -qty } },
    { new: true }
  ).select("_id stock reservedStock soldStock");

  if (!updated) {
    throw new Error("Reserved stock is insufficient to release");
  }

  return updated;
};

const confirmReservedStockToSoldForDeal = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) {
    throw new Error("Selected product not found");
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity is required for selected products");
  }

  const updated = await Item.findOneAndUpdate(
    { _id: itemId, reservedStock: { $gte: qty } },
    { $inc: { reservedStock: -qty, soldStock: qty } },
    { new: true }
  ).select("_id stock reservedStock soldStock");

  if (!updated) {
    throw new Error("Reserved stock is insufficient");
  }

  return updated;
};

const rollbackReservedStockConfirmForDeal = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) return;
  if (!Number.isFinite(qty) || qty <= 0) return;

  await Item.findOneAndUpdate(
    { _id: itemId, soldStock: { $gte: qty } },
    { $inc: { reservedStock: qty, soldStock: -qty } }
  );
};

const rollbackReservedProductStockForDeal = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) return;
  if (!Number.isFinite(qty) || qty <= 0) return;

  await Item.findOneAndUpdate(
    { _id: itemId, reservedStock: { $gte: qty } },
    { $inc: { stock: qty, reservedStock: -qty } }
  );
};

const rollbackPaidProductSaleToStock = async ({ itemId, quantity }) => {
  const qty = Number(quantity || 0);
  if (!mongoose.Types.ObjectId.isValid(String(itemId || ""))) {
    throw new Error("Selected product not found");
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return null;
  }

  const updated = await Item.findOneAndUpdate(
    { _id: itemId, soldStock: { $gte: qty } },
    { $inc: { stock: qty, soldStock: -qty } },
    { new: true }
  ).select("_id stock reservedStock soldStock");

  if (!updated) {
    throw new Error("Sold stock is insufficient to rollback");
  }

  return updated;
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
  const normalizedState = String(deal.customerState || deal.address?.state || deal.state || "").trim();
  const normalizedGstin = String(deal.customerGstin || deal.gstin || "").trim();

  let customer = deal.customerId ? await Customer.findById(deal.customerId) : null;

  if (!customer) {
    customer = await Customer.create({
      name: customerName || deal.name || "Customer",
      email: normalizedEmail || undefined,
      phone: primaryPhone || fallbackPhone,
      company: companyName,
      state: normalizedState,
      gstin: normalizedGstin,
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
    customer.state = normalizedState || customer.state || "";
    customer.gstin = normalizedGstin || customer.gstin || "";
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
    const accessFilter = await buildRoleScopedDealFilter(req.user);

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
    const filter = await buildRoleScopedDealFilter(req.user);
    const requestedStatus = String(req.query.status || "").trim();

    if (requestedStatus) {
      if (!["Active", "Inactive"].includes(requestedStatus)) {
        return res.status(400).json({ message: "status must be Active or Inactive" });
      }
      filter.status = requestedStatus;
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

router.get("/proposal-history", verifyToken, async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
      : 20;
    const accessFilter = await buildRoleScopedDealFilter(req.user);
    const proposalFilter = buildCreatedProposalFilter();
    const finalFilter = Object.keys(accessFilter).length
      ? { $and: [accessFilter, proposalFilter] }
      : proposalFilter;

    const history = await Deal.find(finalFilter)
      .select("name company contact amount stage status updatedAt createdAt")
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  let createdDeal = null;
  let reservedOnCreate = null;
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
    const requiresStockConfirmationOnCreate = outOfStockOnCreate || lowStockOnCreate;
    const forceLostOnCreate = inactiveServiceOnCreate;
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
      reservedQuantity: 0,
      billingCycle: resolvedItem?.type === "service" ? normalizeBillingCycle(billingCycle) : "",
      stage: effectiveStage,
      status: derived.status,
      paymentStatus: normalizeDealStage(effectiveStage) === "won" ? "pending" : "not_required",
      reason: derived.reason,
      assignedTo: effectiveAssignedTo,
      customerState: String(address?.state || "").trim(),
      customerGstin: "",
    }));

    const sellerTaxProfile = await getSellerTaxProfile();
    const dealCustomerState = String(
      normalizedDealPayload.customerState || normalizedDealPayload.address?.state || normalizedDealPayload.state || ""
    ).trim();
    const dealCustomerGstin = String(normalizedDealPayload.customerGstin || "").trim();
    const taxSummary = computeTaxSummary({
      item: resolvedItem,
      quantity: normalizedDealPayload.quantity,
      customerState: dealCustomerState,
      sellerState: sellerTaxProfile.sellerState,
      sellerGstin: sellerTaxProfile.sellerGstin,
      customerGstin: dealCustomerGstin,
    });

    applyTaxSummaryToPayload(normalizedDealPayload, taxSummary);

    if (!forceLostOnCreate && derived.status === "Active" && normalizeDealStage(finalStage) === "won" && itemType === "service") {
      const wonValidationError = validateWonDealAgainstItem({
        item: resolvedItem,
        quantity: normalizedDealPayload.quantity,
        billingCycle: normalizedDealPayload.billingCycle,
      });
      if (wonValidationError) {
        return res.status(400).json({ message: wonValidationError });
      }
    }

    deal = await Deal.create(normalizedDealPayload);
    createdDeal = deal;

    if (requiresStockConfirmationOnCreate) {
      await notifyLowStockToAdmins({
        deal,
        item: resolvedItem,
        availableQuantity,
        requestedQuantity,
        actor: req.user,
      });

      await notifyLowStockToCustomer({
        req,
        deal,
        item: resolvedItem,
        availableQuantity,
        requestedQuantity,
      });
    }

    const normalizedFinalStage = normalizeDealStage(finalStage);
    if (!forceLostOnCreate && derived.status === "Active" && itemType === "product" && normalizedFinalStage === "need_analysis") {
      const reserveQty = Number(normalizedDealPayload.quantity || 0);
      if (reserveQty > 0) {
        await reserveProductStockForDeal({
          itemId: resolvedItem._id,
          quantity: reserveQty,
        });
        reservedOnCreate = {
          itemId: resolvedItem._id,
          quantity: reserveQty,
        };
        deal.reservedQuantity = reserveQty;
        await deal.save();
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
      responseDeal.warningMessage = "Out of stock. Confirmation email sent to customer. Deal will move to Lost only if customer declines to wait.";
    } else if (lowStockOnCreate) {
      responseDeal.warningMessage = "Low stock. Confirmation email sent to customer. Deal will move to Lost only if customer declines to wait.";
    }

    res.status(201).json(responseDeal);
  } catch (err) {
    const knownInventoryError = String(err?.message || "");
    if (/insufficient stock|quantity is required|selected product not found|reserved stock is insufficient/i.test(knownInventoryError)) {
      return res.status(400).json({ message: knownInventoryError });
    }
    if (reservedOnCreate?.itemId && reservedOnCreate.quantity > 0) {
      try {
        await rollbackReservedProductStockForDeal(reservedOnCreate);
      } catch (rollbackErr) {
        console.error("Failed to rollback reserved stock after deal create error:", rollbackErr);
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
  let reservedOnUpdate = null;
  let releasedOnUpdate = null;
  let confirmedOnUpdate = null;
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
    const sellerTaxProfile = await getSellerTaxProfile();
    const customerStateForTax = String(
      updates.customerState ||
        req.body.customerState ||
        updates.address?.state ||
        req.body.address?.state ||
        req.deal.customerState ||
        req.deal.customerId?.state ||
        req.deal.address?.state ||
        req.deal.state ||
        ""
    ).trim();
    const customerGstinForTax = String(
      updates.customerGstin ||
        req.body.customerGstin ||
        req.deal.customerGstin ||
        req.deal.customerId?.gstin ||
        req.deal.gstin ||
        ""
    ).trim();
    applyTaxSummaryToPayload(
      updates,
      computeTaxSummary({
        item: itemForValidation,
        quantity: Object.prototype.hasOwnProperty.call(updates, "quantity") ? updates.quantity : req.deal.quantity,
        customerState: customerStateForTax,
        sellerState: sellerTaxProfile.sellerState,
        sellerGstin: sellerTaxProfile.sellerGstin,
        customerGstin: customerGstinForTax,
      })
    );
    if (shouldDowngradeWonServiceToLost(itemForValidation, nextStage)) {
      nextStage = "lost";
      updates.stage = "lost";
      updates.reason = String(updates.reason || req.deal.reason || getInactiveServiceLossReason()).trim();
      warningMessage = "Service is inactive. Deal moved to Lost.";
      stageChanged = normalizeDealStage(oldStage) !== "lost";
    }

    const normalizedOldStage = normalizeDealStage(oldStage);
    const normalizedNextStage = normalizeDealStage(nextStage);
    const isNeedAnalysisAdvance =
      normalizedOldStage === "need_analysis" &&
      ["value_proposition", "proposal_price_quote"].includes(normalizedNextStage);
    if (isNeedAnalysisAdvance) {
      const itemType = String(itemForValidation?.type || "").toLowerCase();
      const inferredAvailableQuantity = Number(itemForValidation?.stock ?? itemForValidation?.quantity ?? 0);
      const treatAsProduct = itemType === "product" || (itemType !== "service" && Number.isFinite(inferredAvailableQuantity));

      if (treatAsProduct) {
        const nextQuantity = Object.prototype.hasOwnProperty.call(updates, "quantity")
          ? parseOptionalNumber(updates.quantity)
          : parseOptionalNumber(req.deal.quantity);
        const availableQuantity = Number(itemForValidation?.stock ?? itemForValidation?.quantity ?? 0);
        if (nextQuantity === null || nextQuantity <= 0) {
          return res.status(400).json({
            message:
              normalizedNextStage === "value_proposition"
                ? "Quantity is required when moving a product deal from Need Analysis"
                : "Quantity is required when moving a product deal to Proposal stage",
          });
        }
        if (Number.isFinite(availableQuantity) && nextQuantity > availableQuantity) {
          const stockMessage =
            availableQuantity <= 0
              ? "Out of stock. Available quantity is 0."
              : `Low stock. Available quantity is ${availableQuantity}.`;
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
            message: stockMessage,
            availableQuantity,
            requestedQuantity: nextQuantity,
          });
        }
        updates.quantity = nextQuantity;
        updates.waitingForRestock = false;

        const previousReserved = Number(req.deal.reservedQuantity || 0);
        const targetReserved = Number(nextQuantity || 0);
        if (targetReserved > previousReserved) {
          const reserveDelta = targetReserved - previousReserved;
          await reserveProductStockForDeal({
            itemId: itemForValidation._id,
            quantity: reserveDelta,
          });
          reservedOnUpdate = {
            itemId: itemForValidation._id,
            quantity: reserveDelta,
          };
        } else if (targetReserved < previousReserved) {
          const releaseDelta = previousReserved - targetReserved;
          await releaseReservedProductStockForDeal({
            itemId: itemForValidation._id,
            quantity: releaseDelta,
          });
          releasedOnUpdate = {
            itemId: itemForValidation._id,
            quantity: releaseDelta,
          };
        }
        updates.reservedQuantity = targetReserved;
      } else if (itemType === "service") {
        const nextBillingCycle = Object.prototype.hasOwnProperty.call(updates, "billingCycle")
          ? normalizeBillingCycle(updates.billingCycle)
          : normalizeBillingCycle(req.deal.billingCycle);
        if (!nextBillingCycle) {
          return res.status(400).json({
            message:
              normalizedNextStage === "value_proposition"
                ? "Plan / Billing Cycle is required when moving a service deal from Need Analysis"
                : "Plan / Billing Cycle is required when moving a service deal to Proposal stage",
          });
        }
        updates.billingCycle = nextBillingCycle;
      } else {
        return res.status(400).json({ message: "Unable to determine item type for this deal" });
      }
    }

    const isNeedAnalysisQuantityUpdate =
      normalizeDealStage(nextStage) === "need_analysis" &&
      String(itemForValidation?.type || "").toLowerCase() === "product" &&
      Object.prototype.hasOwnProperty.call(updates, "quantity");

    if (isNeedAnalysisQuantityUpdate) {
      const targetReserved = Number(updates.quantity || 0);
      const previousReserved = Number(req.deal.reservedQuantity || 0);

      if (targetReserved > previousReserved) {
        const reserveDelta = targetReserved - previousReserved;
        await reserveProductStockForDeal({
          itemId: itemForValidation._id,
          quantity: reserveDelta,
        });
        reservedOnUpdate = {
          itemId: itemForValidation._id,
          quantity: reserveDelta,
        };
      } else if (targetReserved < previousReserved) {
        const releaseDelta = previousReserved - targetReserved;
        await releaseReservedProductStockForDeal({
          itemId: itemForValidation._id,
          quantity: releaseDelta,
        });
        releasedOnUpdate = {
          itemId: itemForValidation._id,
          quantity: releaseDelta,
        };
      }

      updates.reservedQuantity = targetReserved;
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

    const itemIdForWonValidation = Object.prototype.hasOwnProperty.call(req.body, "product")
      ? req.body.product
      : req.deal.product;

    const normalizedNextStageForInventory = normalizeDealStage(nextStage);
    if (normalizedNextStageForInventory === "lost" && itemForValidation?.type !== "service") {
      const toRelease = Number(req.deal.reservedQuantity || 0);
      if (toRelease > 0) {
        await releaseReservedProductStockForDeal({
          itemId: itemForValidation._id,
          quantity: toRelease,
        });
        releasedOnUpdate = {
          itemId: itemForValidation._id,
          quantity: toRelease,
        };
      }
      updates.reservedQuantity = 0;
    }

    if (normalizeDealStage(nextStage) === "won") {
      const item = await resolveDealItem(itemIdForWonValidation);
      const wonValidationError = validateWonDealAgainstItem({
        item,
        quantity: Object.prototype.hasOwnProperty.call(updates, "quantity") ? updates.quantity : req.deal.quantity,
        billingCycle: Object.prototype.hasOwnProperty.call(updates, "billingCycle")
          ? updates.billingCycle
          : req.deal.billingCycle,
        reservedQuantity: Object.prototype.hasOwnProperty.call(updates, "reservedQuantity")
          ? updates.reservedQuantity
          : req.deal.reservedQuantity,
      });
      if (wonValidationError) {
        return res.status(400).json({ message: wonValidationError });
      }

      updates.paymentStatus = "pending";
    } else if (Object.prototype.hasOwnProperty.call(req.body, "stage") && normalizeDealStage(nextStage) !== "won") {
      updates.paymentStatus = "not_required";
    }

    const requestedPaymentStatus = String(req.body?.paymentStatus || "").trim().toLowerCase();
    if (requestedPaymentStatus) {
      if (!["not_required", "pending", "paid"].includes(requestedPaymentStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      if (requestedPaymentStatus === "paid") {
        if (normalizeDealStage(nextStage) !== "won") {
          return res.status(400).json({ message: "Payment can be marked paid only for Won deals" });
        }

        if (itemForValidation?.type !== "service") {
          const qtyToConfirm = Number(
            Object.prototype.hasOwnProperty.call(updates, "reservedQuantity")
              ? updates.reservedQuantity
              : req.deal.reservedQuantity
          ) || 0;
          if (qtyToConfirm <= 0) {
            return res.status(400).json({ message: "No reserved stock found for this deal" });
          }

          await confirmReservedStockToSoldForDeal({
            itemId: itemForValidation._id,
            quantity: qtyToConfirm,
          });
          confirmedOnUpdate = {
            itemId: itemForValidation._id,
            quantity: qtyToConfirm,
          };
          updates.reservedQuantity = 0;
        }

        updates.paymentStatus = "paid";
      }
    }

    let updatedDeal;
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

    if (!updatedDeal) {
      if (reservedOnUpdate?.itemId && reservedOnUpdate.quantity > 0) {
        await rollbackReservedProductStockForDeal(reservedOnUpdate);
      }
      return res.status(404).json({ message: "Deal not found" });
    }

    reservedOnUpdate = null;

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
    const knownInventoryError = String(err?.message || "");
    if (confirmedOnUpdate?.itemId && confirmedOnUpdate.quantity > 0) {
      try {
        await rollbackReservedStockConfirmForDeal(confirmedOnUpdate);
      } catch (rollbackErr) {
        console.error("Failed to rollback confirmed stock after deal update error:", rollbackErr);
      }
    }
    if (releasedOnUpdate?.itemId && releasedOnUpdate.quantity > 0) {
      try {
        await reserveProductStockForDeal(releasedOnUpdate);
      } catch (rollbackErr) {
        console.error("Failed to rollback released stock after deal update error:", rollbackErr);
      }
    }
    if (reservedOnUpdate?.itemId && reservedOnUpdate.quantity > 0) {
      try {
        await rollbackReservedProductStockForDeal(reservedOnUpdate);
      } catch (rollbackErr) {
        console.error("Failed to rollback reserved stock after deal update error:", rollbackErr);
      }
    }
    if (/insufficient stock|quantity is required|selected product not found|reserved stock is insufficient/i.test(knownInventoryError)) {
      return res.status(400).json({ message: knownInventoryError });
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
    const normalizedPreviousStage = normalizeDealStage(previousStage);
    if (normalizedPreviousStage === "won" && String(deal.paymentStatus || "").trim().toLowerCase() === "pending") {
      const item = await resolveDealItem(deal.product);
      if (item && item.type !== "service") {
        await releaseReservedProductStockForDeal({
          itemId: item._id,
          quantity: Number(deal.reservedQuantity || deal.quantity) || 0,
        });
      }
    }
    if (String(deal.stage || "").toLowerCase() !== "lost") {
      await Deal.findByIdAndUpdate(
        deal._id,
        {
          $set: {
            stage: "lost",
            status: "Inactive",
            paymentStatus: "not_required",
            reservedQuantity: 0,
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
  let inventoryRollback = null;
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Double-check authorization
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    if (
      normalizeDealStage(req.deal.stage) === "won" &&
      ["pending", "paid", ""].includes(String(req.deal.paymentStatus || "").trim().toLowerCase())
    ) {
      const item = await resolveDealItem(req.deal.product);
      if (item && item.type !== "service") {
        const quantity = Number(req.deal.reservedQuantity || req.deal.quantity || 0);
        if (quantity > 0) {
          const paymentStatus = String(req.deal.paymentStatus || "").trim().toLowerCase();
          if (paymentStatus === "pending") {
            await releaseReservedProductStockForDeal({ itemId: item._id, quantity });
            inventoryRollback = { mode: "release", itemId: item._id, quantity };
          } else {
            await rollbackPaidProductSaleToStock({ itemId: item._id, quantity });
            inventoryRollback = { mode: "paid", itemId: item._id, quantity };
          }
        }
      }
    }

    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) {
      if (inventoryRollback?.itemId && inventoryRollback.quantity > 0) {
        if (inventoryRollback.mode === "release") {
          await Item.findByIdAndUpdate(inventoryRollback.itemId, {
            $inc: { stock: -inventoryRollback.quantity, reservedStock: inventoryRollback.quantity },
          });
        } else {
          await Item.findByIdAndUpdate(inventoryRollback.itemId, {
            $inc: { stock: -inventoryRollback.quantity, soldStock: inventoryRollback.quantity },
          });
        }
      }
      return res.status(404).json({ message: "Deal not found" });
    }
    await Contact.deleteMany({ sourceDealId: deal._id });
    await syncCustomerStatusFromLatestDeal(deal.customerId);
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    if (inventoryRollback?.itemId && inventoryRollback.quantity > 0) {
      try {
        if (inventoryRollback.mode === "release") {
          await Item.findByIdAndUpdate(inventoryRollback.itemId, {
            $inc: { stock: -inventoryRollback.quantity, reservedStock: inventoryRollback.quantity },
          });
        } else {
          await Item.findByIdAndUpdate(inventoryRollback.itemId, {
            $inc: { stock: -inventoryRollback.quantity, soldStock: inventoryRollback.quantity },
          });
        }
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
      .populate("customerId", "name company email phone state gstin")
      .populate("product", "name sku category price cost type status stock serviceType billingCycle gst_percent hsn_sac")
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

    const accessFilter = await buildRoleScopedDealFilter(req.user);
    const historyFilter = {
      _id: { $ne: deal._id },
      $or: historyCriteria,
    };

    const proposalFilter = buildCreatedProposalFilter();
    const historyQuery = Object.keys(accessFilter).length
      ? { $and: [historyFilter, accessFilter, proposalFilter] }
      : { $and: [historyFilter, proposalFilter] };

    const history = historyCriteria.length
      ? await Deal.find(historyQuery)
          .select("name company contact amount stage status updatedAt createdAt")
          .sort({ updatedAt: -1 })
          .limit(8)
          .lean()
      : [];

    const sellerTaxProfile = await getSellerTaxProfile();
    const taxSummary = computeTaxSummary({
      item: deal.product,
      quantity: deal.quantity,
      customerState: deal.customerState || deal.customerId?.state || deal.address?.state || "",
      sellerState: deal.sellerState || sellerTaxProfile.sellerState,
      sellerGstin: deal.sellerGstin || sellerTaxProfile.sellerGstin,
      customerGstin: deal.customerGstin || deal.customerId?.gstin || "",
    });

    const lineItems = taxSummary
      ? [
          {
            productName: deal.product?.name || deal.name || "-",
            price: Number(deal.product?.price ?? deal.product?.cost ?? 0),
            quantity: Number(deal.quantity || 1),
            gstPercent: taxSummary.gstPercent,
            taxableAmount: taxSummary.taxableAmount,
            cgst: taxSummary.cgst,
            sgst: taxSummary.sgst,
            igst: taxSummary.igst,
            totalAmount: taxSummary.grandTotal,
            hsnSac: taxSummary.hsnSac,
          },
        ]
      : [];

    const notifications = await Notification.find({
      dealId: deal._id,
      recipients: req.user._id,
    })
      .select("message isRead createdAt fromStage toStage changedByName")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      deal,
      history,
      notifications,
      taxSummary,
      lineItems,
      warnings: Array.isArray(taxSummary?.warnings) ? taxSummary.warnings : [],
      invoice: {
        sellerState: taxSummary?.sellerState || sellerTaxProfile.sellerState,
        sellerGstin: taxSummary?.sellerGstin || sellerTaxProfile.sellerGstin,
        customerState: taxSummary?.customerState || deal.customerId?.state || "",
        customerGstin: taxSummary?.customerGstin || deal.customerId?.gstin || "",
        placeOfSupply: taxSummary?.placeOfSupply || "",
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-draft", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const parsedDiscount = Number(req.body?.discountPercent);
    const safeDiscount = Number.isFinite(parsedDiscount)
      ? Math.min(100, Math.max(0, parsedDiscount))
      : 0;

    const update = {
      "proposalDraft.title": String(req.body?.title || "").trim(),
      "proposalDraft.introduction": String(req.body?.introduction || "").trim(),
      "proposalDraft.problem": String(req.body?.problem || "").trim(),
      "proposalDraft.solution": String(req.body?.solution || "").trim(),
      "proposalDraft.scope": String(req.body?.scope || "").trim(),
      "proposalDraft.pricingNotes": String(req.body?.pricingNotes || "").trim(),
      "proposalDraft.terms": String(req.body?.terms || "").trim(),
      "proposalDraft.discountPercent": safeDiscount,
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
    const requesterRole = String(req.user?.role || "").toUpperCase();
    if (requesterRole !== "EMPLOYEE") {
      return res.status(403).json({ message: "Only employees can send proposal approval requests." });
    }

    const deal = await Deal.findById(req.params.id).populate("assignedTo", "name username role reportsTo");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const previousStage = String(deal.stage || "");
    const normalizedStage = normalizeDealStage(previousStage);
    if (["won", "lost"].includes(normalizedStage)) {
      return res.status(400).json({
        message: "Proposal cannot be sent to manager from a closed deal.",
      });
    }

    const autoMovedToNegotiate = normalizedStage !== "negotiate";

    const recipients = await getProposalApprovalRecipients({ requester: req.user, deal });
    if (!recipients.length) {
      return res.status(400).json({ message: "No assigned manager found for approval notification." });
    }

    const requesterName = getUserDisplayName(req.user);
    const now = new Date();
    const updatePayload = {
      $set: {
        "proposalDraft.status": "pending_approval",
        "proposalDraft.approvalRequestedAt": now,
        "proposalDraft.approvalRespondedAt": null,
        "proposalDraft.approvedBy": null,
        "proposalDraft.approvalComment": "",
      },
    };

    if (autoMovedToNegotiate) {
      updatePayload.$set.stage = "negotiate";
      updatePayload.$set.status = "Active";
      updatePayload.$set.reason = "";
      updatePayload.$push = {
        timeline: {
          $each: [
            {
              fromStage: previousStage,
              toStage: "negotiate",
              changedBy: req.user._id,
              changedAt: now,
              userName: requesterName,
            },
          ],
          $position: 0,
        },
      };
    }

    const updatedDeal = await Deal.findByIdAndUpdate(deal._id, updatePayload, {
      new: true,
      runValidators: true,
    });
    if (!updatedDeal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    deal.stage = updatedDeal.stage;

    await Notification.insertMany(
      recipients.map((recipient) => ({
        dealId: deal._id,
        message: autoMovedToNegotiate
          ? `Proposal approval requested for deal "${deal.name}" by ${requesterName}. Deal moved to Negotiate. Please schedule and own the negotiation meeting.`
          : `Proposal approval requested for deal "${deal.name}" by ${requesterName}. Please schedule and own the negotiation meeting.`,
        fromStage: previousStage,
        toStage: "proposal_approval_requested",
        changedBy: req.user._id,
        changedByName: requesterName,
        recipients: [recipient],
        isRead: false,
      }))
    );

    if (autoMovedToNegotiate) {
      const notifyIds = new Set(recipients.map((id) => String(id)));
      if (deal.assignedTo?._id) {
        notifyIds.add(String(deal.assignedTo._id));
      }
      const admins = await User.find({ role: { $regex: /^admin$/i } }).select("_id").lean();
      admins.forEach((admin) => notifyIds.add(String(admin._id)));

      const stageMoveMessage =
        `Deal "${deal.name}" auto-moved to Negotiate after proposal was sent to manager by ${requesterName}.`;

      await Notification.insertMany(
        Array.from(notifyIds)
          .filter(Boolean)
          .map((recipient) => ({
            dealId: deal._id,
            message: stageMoveMessage,
            fromStage: previousStage,
            toStage: "negotiate",
            changedBy: req.user._id,
            changedByName: requesterName,
            recipients: [recipient],
            isRead: false,
          }))
      );
    }

    const managerOwnerId = recipients[0];
    if (managerOwnerId) {
      await Activity.create({
        type: "task",
        activityType: "task",
        title: `Schedule negotiation meeting for ${deal.name}`,
        description: `Proposal sent by ${requesterName}. Manager is responsible to schedule the negotiation meeting and next action plan.`,
        owner: managerOwnerId,
        createdBy: req.user._id,
        status: "Pending",
        priority: "High",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        relatedTo: {
          recordType: "Deal",
          recordId: deal._id,
          recordName: deal.name || "Deal",
        },
      });
    }

    res.json({
      message: autoMovedToNegotiate
        ? "Proposal sent to manager for approval. Deal moved to Negotiate and manager task created."
        : "Proposal sent to manager for approval. Manager task created.",
      status: deal.proposalDraft.status,
      previousStage,
      stage: deal.stage,
      managerResponsible: true,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-approval", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "MANAGER") {
      return res.status(403).json({ message: "Only managers can review proposals." });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!["approve", "edit", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be approve, edit, or reject" });
    }

    const comment = String(req.body?.comment || "").trim();
    const deal = await Deal.findById(req.params.id).populate("assignedTo", "name username");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (normalizeDealStage(deal.stage) !== "negotiate") {
      return res.status(400).json({
        message: "Proposal review is enabled only when the deal is in Negotiate stage.",
      });
    }

    deal.proposalDraft = deal.proposalDraft || {};
    deal.proposalDraft.status =
      action === "approve" ? "approved" : action === "edit" ? "changes_requested" : "rejected";
    deal.proposalDraft.approvalRespondedAt = new Date();
    deal.proposalDraft.approvedBy = req.user._id;
    deal.proposalDraft.approvalComment = comment;
    await deal.save();

    if (deal.assignedTo?._id) {
      const reviewerName = getUserDisplayName(req.user);
      const toStage =
        action === "approve"
          ? "proposal_approved"
          : action === "edit"
            ? "proposal_changes_requested"
            : "proposal_rejected";
      const message =
        action === "approve"
          ? `Proposal approved for deal "${deal.name}" by ${reviewerName}`
          : action === "edit"
            ? `Proposal requires edits for deal "${deal.name}" by ${reviewerName}`
            : `Proposal rejected for deal "${deal.name}" by ${reviewerName}`;

      await Notification.create({
        dealId: deal._id,
        message,
        fromStage: String(deal.stage || ""),
        toStage,
        changedBy: req.user._id,
        changedByName: reviewerName,
        recipients: [deal.assignedTo._id],
        isRead: false,
      });
    }

    const actionLabel = action === "approve" ? "approved" : action === "edit" ? "sent for edits" : "rejected";
    res.json({ message: `Proposal ${actionLabel} successfully.`, status: deal.proposalDraft.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/won-approval-request", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const requesterRole = String(req.user?.role || "").toUpperCase();
    if (!["EMPLOYEE", "MANAGER"].includes(requesterRole)) {
      return res.status(403).json({ message: "Only employees or managers can request won transition review." });
    }

    const deal = await Deal.findById(req.params.id).populate("assignedTo", "_id name username role reportsTo");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (normalizeDealStage(deal.stage) !== "negotiate") {
      return res.status(400).json({ message: "Won approval request is allowed only from Negotiate stage." });
    }

    const recipients =
      requesterRole === "MANAGER"
        ? [req.user._id]
        : await getProposalApprovalRecipients({ requester: req.user, deal });
    if (!recipients.length) {
      return res.status(400).json({ message: "No assigned manager found for won approval request." });
    }

    const requesterName = getUserDisplayName(req.user);
    const contextNote = String(req.body?.contextNote || "").trim();
    await Notification.insertMany(
      recipients.map((recipient) => ({
        dealId: deal._id,
        message: contextNote
          ? `Won approval requested for deal "${deal.name}" by ${requesterName}. Context: ${contextNote}`
          : `Won approval requested for deal "${deal.name}" by ${requesterName}`,
        fromStage: String(deal.stage || ""),
        toStage: "won_approval_requested",
        changedBy: req.user._id,
        changedByName: requesterName,
        recipients: [recipient],
        isRead: false,
      }))
    );

    res.json({
      message:
        requesterRole === "MANAGER"
          ? "Won review form is ready. Open details and approve or edit."
          : "Won approval request sent to manager.",
      stage: deal.stage,
      pendingWonApproval: true,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/won-approval", verifyToken, permitDealAccess(), async (req, res) => {
  let reservedOnWonApproval = null;
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "MANAGER") {
      return res.status(403).json({ message: "Only managers can approve won transition." });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!["approve", "edit"].includes(action)) {
      return res.status(400).json({ message: "action must be approve or edit" });
    }

    const comment = String(req.body?.comment || "").trim();
    const deal = await Deal.findById(req.params.id).populate("assignedTo", "_id name username");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const previousStage = String(deal.stage || "");
    const normalized = normalizeDealStage(previousStage);
    if (["lost"].includes(normalized)) {
      return res.status(400).json({ message: "Won approval is not allowed for Closed Lost deals." });
    }

    if (action === "approve") {
      deal.proposalDraft = deal.proposalDraft || {};
      deal.proposalDraft.status = "approved";
      deal.proposalDraft.savedToQuotationAt = new Date();
      deal.proposalDraft.savedToQuotationBy = req.user._id;
    }

    if (action === "approve" && normalized !== "won") {
      const item = await resolveDealItem(deal.product);
      const wonValidationError = validateWonDealAgainstItem({
        item,
        quantity: deal.quantity,
        billingCycle: deal.billingCycle,
        reservedQuantity: deal.reservedQuantity,
      });
      if (wonValidationError) {
        return res.status(400).json({ message: wonValidationError });
      }

      deal.stage = "won";
      deal.status = "Active";
      deal.paymentStatus = "pending";
      deal.reason = "";
      deal.timeline = Array.isArray(deal.timeline) ? deal.timeline : [];
      deal.timeline.unshift({
        fromStage: previousStage,
        toStage: "won",
        changedBy: req.user._id,
        changedAt: new Date(),
        userName: getUserDisplayName(req.user),
      });
    }

    if (action === "approve") {
      await deal.save();
      reservedOnWonApproval = null;
      await syncDealContact(deal);
      await syncCustomerFromDeal(deal);
      await syncCustomerStatusFromLatestDeal(deal.customerId);
    }

    if (deal.assignedTo?._id) {
      const reviewerName = getUserDisplayName(req.user);
      const toStage = action === "approve" ? "won_approved" : "won_changes_requested";
      const message =
        action === "approve"
          ? `Deal "${deal.name}" is Won and quotation is received by ${reviewerName}${comment ? `. Note: ${comment}` : ""}`
          : `Won transition requires edits for deal "${deal.name}" by ${reviewerName}${comment ? `. Note: ${comment}` : ""}`;

      await Notification.create({
        dealId: deal._id,
        message,
        fromStage: previousStage,
        toStage,
        changedBy: req.user._id,
        changedByName: reviewerName,
        recipients: [deal.assignedTo._id],
        isRead: false,
      });
    }

    res.json({
      message:
        action === "approve"
          ? "Deal approved, quotation saved, and employee notified."
          : "Changes requested sent to employee.",
      stage: deal.stage,
    });
  } catch (err) {
    const knownInventoryError = String(err?.message || "");
    if (reservedOnWonApproval?.itemId && reservedOnWonApproval.quantity > 0) {
      try {
        await rollbackReservedProductStockForDeal(reservedOnWonApproval);
      } catch (rollbackErr) {
        console.error("Failed to rollback reserved stock after won approval error:", rollbackErr);
      }
    }
    if (/insufficient stock|quantity is required|selected product not found|reserved stock is insufficient/i.test(knownInventoryError)) {
      return res.status(400).json({ message: knownInventoryError });
    }
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-save-quotation", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "EMPLOYEE") {
      return res.status(403).json({ message: "Only employees can save proposals to quotation." });
    }

    const deal = await Deal.findById(req.params.id).populate("assignedTo", "_id name username");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const proposalStatus = String(deal?.proposalDraft?.status || "").trim();
    if (!["approved", "changes_requested"].includes(proposalStatus)) {
      return res.status(400).json({
        message: "Proposal must be approved or marked for edits before saving to quotation.",
      });
    }

    deal.proposalDraft = deal.proposalDraft || {};
    deal.proposalDraft.savedToQuotationAt = new Date();
    deal.proposalDraft.savedToQuotationBy = req.user._id;
    await deal.save();

    res.json({
      message: "Proposal saved to quotation successfully.",
      status: deal.proposalDraft.status,
      savedToQuotationAt: deal.proposalDraft.savedToQuotationAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/proposal-send-client", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "EMPLOYEE") {
      return res.status(403).json({ message: "Only employees can send proposals to client." });
    }

    const deal = await Deal.findById(req.params.id)
      .populate("customerId", "name company email phone state gstin")
      .populate("product", "name price cost gst_percent hsn_sac");
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const recipientEmail = String(deal?.email || deal?.customerId?.email || "").trim();
    if (!recipientEmail) {
      return res.status(400).json({ message: "Customer email is required before sending proposal." });
    }

    const sellerTaxProfile = await getSellerTaxProfile();
    const taxSummary = computeTaxSummary({
      item: deal.product,
      quantity: deal.quantity,
      customerState: deal.customerState || deal.customerId?.state || deal.address?.state || "",
      sellerState: deal.sellerState || sellerTaxProfile.sellerState,
      sellerGstin: deal.sellerGstin || sellerTaxProfile.sellerGstin,
      customerGstin: deal.customerGstin || deal.customerId?.gstin || "",
    });

    const lineItems = taxSummary
      ? [
          {
            productName: deal.product?.name || deal.name || "-",
            price: Number(deal.product?.price ?? deal.product?.cost ?? 0),
            quantity: Number(deal.quantity || 1),
            gstPercent: taxSummary.gstPercent,
            taxableAmount: taxSummary.taxableAmount,
            cgst: taxSummary.cgst,
            sgst: taxSummary.sgst,
            igst: taxSummary.igst,
            totalAmount: taxSummary.grandTotal,
            hsnSac: taxSummary.hsnSac,
          },
        ]
      : [];

    const proposalNumber = `PROP-${String(deal._id).slice(-6).toUpperCase()}`;
    const proposalAmount = Number(taxSummary?.grandTotal ?? deal?.amount ?? 0);
    const safeSubject = String(deal?.proposalDraft?.title || deal?.name || "Proposal").trim() || "Proposal";

    const proposalPdfBuffer = await generateProposalPdfBuffer({
      proposalNumber,
      issueDate: new Date(),
      dealName: deal.name,
      subject: safeSubject,
      contactName: deal.contact || deal.customerId?.name || "Customer",
      company: deal.company || deal.customerId?.company || "",
      email: recipientEmail,
      phone: deal.phone || deal.customerId?.phone || "",
      status: "Sent To Client",
      introduction: deal?.proposalDraft?.introduction || "Please find our proposal attached.",
      problem: deal?.proposalDraft?.problem || "Business requirements as discussed.",
      solution: deal?.proposalDraft?.solution || deal?.proposalDraft?.pricingNotes || "Recommended approach and estimated pricing.",
      terms: deal?.proposalDraft?.terms || "Standard terms and conditions apply.",
      totalAmount: proposalAmount,
      lineItems,
    });

    const proposalEmailResult = await sendLeadProposalEmail({
      to: recipientEmail,
      leadName: deal.contact || deal.customerId?.name || "Customer",
      company: deal.company || deal.customerId?.company || "",
      proposal: {
        subject: safeSubject,
        amount: proposalAmount,
        currency: "INR",
        validUntil: null,
        message: deal?.proposalDraft?.solution || deal?.proposalDraft?.pricingNotes || "Please review the attached proposal.",
        terms: deal?.proposalDraft?.terms || "",
      },
      customMessage: "This is the estimated price and further discussion on this will be done in nxt meeting.",
      pdfBuffer: proposalPdfBuffer,
      pdfFileName: `${proposalNumber}.pdf`,
    });

    const previousStage = String(deal.stage || "");
    const normalizedStage = normalizeDealStage(previousStage);
    const autoMovedToNegotiate = normalizedStage === "proposal_price_quote";
    if (autoMovedToNegotiate) {
      deal.stage = "negotiate";
      deal.status = "Active";
      deal.reason = "";
      deal.timeline = Array.isArray(deal.timeline) ? deal.timeline : [];
      deal.timeline.unshift({
        fromStage: previousStage,
        toStage: "negotiate",
        changedBy: req.user._id,
        changedAt: new Date(),
        userName: getUserDisplayName(req.user),
      });
    }

    deal.proposalDraft.status = "sent_to_client";
    deal.proposalDraft.clientSentAt = new Date();
    deal.proposalDraft.clientSentBy = req.user._id;
    await deal.save();

    res.json({
      message: autoMovedToNegotiate
        ? "Proposal sent to client. Deal moved to Negotiate automatically."
        : "Proposal sent to client.",
      status: deal.proposalDraft.status,
      stage: deal.stage,
      emailPreviewUrl: proposalEmailResult?.preview || null,
    });
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

router.get("/notifications/assignees", verifyToken, async (req, res) => {
  try {
    const assignableUsers = await getNotificationAssignableUsers(req.user);
    const cleaned = assignableUsers
      .filter((user) => String(user?._id || "") !== String(req.user?._id || ""))
      .map((user) => ({
        _id: user._id,
        name: user.name || "",
        username: user.username || "",
        email: user.email || "",
        role: String(user.role || "").toUpperCase(),
        employee_id: user.employee_id || "",
      }));

    res.json(cleaned);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/notifications/bulk", verifyToken, async (req, res) => {
  try {
    const ids = parseNotificationIds(req.body?.ids || []);
    if (!ids.length) {
      return res.status(400).json({ message: "No valid notification IDs provided" });
    }

    const ownedNotifications = await Notification.find({
      _id: { $in: ids },
      recipients: req.user._id,
    })
      .select("_id")
      .lean();

    const ownedIds = ownedNotifications.map((entry) => entry._id);
    if (!ownedIds.length) {
      return res.status(404).json({ message: "No matching notifications found for this user" });
    }

    await Notification.updateMany(
      { _id: { $in: ownedIds } },
      { $pull: { recipients: req.user._id } }
    );

    const hardDelete = await Notification.deleteMany({
      _id: { $in: ownedIds },
      recipients: { $size: 0 },
    });

    res.json({
      message: `${ownedIds.length} notifications removed from inbox`,
      removedFromInboxCount: ownedIds.length,
      permanentlyDeletedCount: hardDelete.deletedCount || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/notifications/bulk/assign", verifyToken, async (req, res) => {
  try {
    const requesterRole = String(req.user?.role || "").toUpperCase();
    if (!["ADMIN", "MANAGER"].includes(requesterRole)) {
      return res.status(403).json({ message: "Only admin or manager can assign notifications" });
    }

    const ids = parseNotificationIds(req.body?.ids || []);
    const assigneeId = String(req.body?.assigneeId || "").trim();

    if (!ids.length) {
      return res.status(400).json({ message: "No valid notification IDs provided" });
    }
    if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
      return res.status(400).json({ message: "Valid assignee is required" });
    }
    if (String(req.user._id) === assigneeId) {
      return res.status(400).json({ message: "Select a different assignee" });
    }

    const assignableUsers = await getNotificationAssignableUsers(req.user);
    const allowed = assignableUsers.some((user) => String(user?._id || "") === assigneeId);
    if (!allowed) {
      return res.status(403).json({ message: "Assignee is outside your allowed scope" });
    }

    const ownedNotifications = await Notification.find({
      _id: { $in: ids },
      recipients: req.user._id,
    })
      .select("_id")
      .lean();

    const ownedIds = ownedNotifications.map((entry) => entry._id);
    if (!ownedIds.length) {
      return res.status(404).json({ message: "No matching notifications found for this user" });
    }

    await Notification.updateMany(
      { _id: { $in: ownedIds } },
      {
        $addToSet: { recipients: assigneeId },
        $pull: { recipients: req.user._id },
      }
    );

    res.json({
      message: `${ownedIds.length} notifications assigned successfully`,
      assignedCount: ownedIds.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
