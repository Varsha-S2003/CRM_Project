const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Customer = require("../models/customer");
const Deal = require("../models/deal");
const Product = require("../models/product");
const Activity = require("../models/activity");
const User = require("../models/user");
const { applyLeadScoring } = require("../utils/leadScoring");
const { sendLeadProposalEmail } = require("../utils/mailer");

const normalizeText = (value) => String(value || "").trim();
const normalizeOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildLeadName = (payload) => {
  const fullName = [payload.firstName, payload.lastName]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || normalizeText(payload.name);
};

const normalizeLeadPayload = (payload = {}) => {
  const normalized = {
    salutation: normalizeText(payload.salutation),
    firstName: normalizeText(payload.firstName),
    lastName: normalizeText(payload.lastName),
    name: buildLeadName(payload),
    title: normalizeText(payload.title),
    company: normalizeText(payload.company),
    email: normalizeText(payload.email),
    secondaryEmail: normalizeText(payload.secondaryEmail),
    phone: normalizeText(payload.phone),
    mobile: normalizeText(payload.mobile),
    website: normalizeText(payload.website),
    industry: normalizeText(payload.industry),
    annualRevenue: normalizeOptionalNumber(payload.annualRevenue),
    employeeCount: normalizeOptionalNumber(payload.employeeCount),
    source: normalizeText(payload.source),
    score: normalizeOptionalNumber(payload.score) ?? 0,
    emailOpened: normalizeOptionalNumber(payload.emailOpened) ?? 0,
    websiteVisits: normalizeOptionalNumber(payload.websiteVisits) ?? 0,
    formSubmissions: normalizeOptionalNumber(payload.formSubmissions) ?? 0,
    lastActivityDate: payload.lastActivityDate ? new Date(payload.lastActivityDate) : null,
    status: normalizeText(payload.status).toLowerCase() || "new",
    notes: normalizeText(payload.notes),
    address: {
      street: normalizeText(payload.address?.street || payload.street),
      city: normalizeText(payload.address?.city || payload.city),
      state: normalizeText(payload.address?.state || payload.state),
      postalCode: normalizeText(payload.address?.postalCode || payload.postalCode),
      country: normalizeText(payload.address?.country || payload.country),
    },
  };

  if (!Object.values(normalized.address).some(Boolean)) delete normalized.address;
  if (Number.isNaN(normalized.lastActivityDate?.getTime?.())) normalized.lastActivityDate = null;

  return normalized;
};

const buildConversionName = (lead) => {
  const fullName = [lead.firstName, lead.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || String(lead.name || "").trim() || "Unnamed Lead";
};

const normalizeEmailForStorage = (value) => {
  const normalized = String(value || "").trim();
  return normalized || undefined;
};

const normalizePhoneForMatch = (value) => String(value || "").replace(/\D+/g, "").trim();
const buildPhoneFlexibleRegex = (digits) => {
  if (!digits) return null;
  return `^\\D*${digits.split("").join("\\D*")}\\D*$`;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getDuplicateKeys = (payload = {}) => {
  const email = normalizeText(payload.email).toLowerCase();
  const phone = normalizePhoneForMatch(payload.phone || payload.mobile);
  const name = buildLeadName(payload);
  const company = normalizeText(payload.company);
  const nameCompany = name && company ? `${name.toLowerCase()}::${company.toLowerCase()}` : "";

  return { email, phone, name, company, nameCompany };
};

const buildDuplicateConditions = (payload = {}) => {
  const { email, name, company } = getDuplicateKeys(payload);
  const conditions = [];

  if (email) {
    conditions.push({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
  }

  if (name && company) {
    conditions.push({
      $and: [
        { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
        { company: { $regex: `^${escapeRegex(company)}$`, $options: "i" } },
      ],
    });
  }

  return conditions;
};

const findDuplicateLead = async (payload = {}, { excludeLeadId } = {}) => {
  const conditions = buildDuplicateConditions(payload);
  if (conditions.length === 0) return null;

  const query = { $or: conditions };
  if (excludeLeadId) {
    query._id = { $ne: excludeLeadId };
  }

  return Lead.findOne(query).select("_id name company email status");
};

const getDuplicateReason = (payload = {}, duplicateLead = null) => {
  if (!duplicateLead) return "duplicate";

  const candidate = getDuplicateKeys(payload);
  const existing = getDuplicateKeys(duplicateLead);

  if (candidate.email && existing.email && candidate.email === existing.email) {
    return "email";
  }

  if (candidate.nameCompany && existing.nameCompany && candidate.nameCompany === existing.nameCompany) {
    return "name_company";
  }

  return "duplicate";
};

const hasMeaningfulValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return normalizeText(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const getDuplicateMessage = (reason) => {
  if (reason === "email") return "Duplicate lead detected: same email found";
  if (reason === "name_company") return "Duplicate lead detected: same name and company found";
  return "Duplicate lead detected";
};

const firstMeaningful = (...values) => values.find((value) => hasMeaningfulValue(value));

const normalizeAddress = (address = {}) => {
  const normalized = {
    street: normalizeText(address.street),
    city: normalizeText(address.city),
    state: normalizeText(address.state),
    postalCode: normalizeText(address.postalCode),
    country: normalizeText(address.country),
  };

  return Object.values(normalized).some(Boolean) ? normalized : undefined;
};

const buildMergedLeadPayload = (primaryLead, secondaryLeads, overrides = {}) => {
  const allLeads = [primaryLead, ...secondaryLeads];

  const mergedAddress = normalizeAddress(
    {
      street: firstMeaningful(...allLeads.map((lead) => lead.address?.street)),
      city: firstMeaningful(...allLeads.map((lead) => lead.address?.city)),
      state: firstMeaningful(...allLeads.map((lead) => lead.address?.state)),
      postalCode: firstMeaningful(...allLeads.map((lead) => lead.address?.postalCode)),
      country: firstMeaningful(...allLeads.map((lead) => lead.address?.country)),
    }
  );

  const mergedPayload = {
    salutation: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.salutation)) || ""),
    firstName: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.firstName)) || ""),
    lastName: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.lastName)) || ""),
    title: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.title)) || ""),
    company: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.company)) || ""),
    email: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.email)) || ""),
    secondaryEmail: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.secondaryEmail)) || ""),
    phone: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.phone)) || ""),
    mobile: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.mobile)) || ""),
    website: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.website)) || ""),
    industry: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.industry)) || ""),
    annualRevenue: normalizeOptionalNumber(firstMeaningful(...allLeads.map((lead) => lead.annualRevenue))),
    employeeCount: normalizeOptionalNumber(firstMeaningful(...allLeads.map((lead) => lead.employeeCount))),
    source: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.source)) || ""),
    score: allLeads.reduce((sum, lead) => sum + (Number(lead.score) || 0), 0),
    emailOpened: allLeads.reduce((sum, lead) => sum + (Number(lead.emailOpened) || 0), 0),
    websiteVisits: allLeads.reduce((sum, lead) => sum + (Number(lead.websiteVisits) || 0), 0),
    formSubmissions: allLeads.reduce((sum, lead) => sum + (Number(lead.formSubmissions) || 0), 0),
    lastActivityDate: firstMeaningful(
      ...allLeads
        .map((lead) => lead.lastActivityDate)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    ) || null,
    notes: normalizeText(firstMeaningful(...allLeads.map((lead) => lead.notes)) || ""),
    assignedTo: firstMeaningful(...allLeads.map((lead) => lead.assignedTo)),
    address: mergedAddress,
    customFields: {
      ...Object.assign({}, ...secondaryLeads.map((lead) => lead.customFields || {})),
      ...(primaryLead.customFields || {}),
    },
    isConverted: Boolean(allLeads.some((lead) => lead.isConverted)),
    convertedCustomerId: firstMeaningful(...allLeads.map((lead) => lead.convertedCustomerId)) || null,
    convertedContactId: firstMeaningful(...allLeads.map((lead) => lead.convertedContactId)) || null,
    convertedDealId: firstMeaningful(...allLeads.map((lead) => lead.convertedDealId)) || null,
  };

  const safeOverrideFields = [
    "salutation",
    "firstName",
    "lastName",
    "title",
    "company",
    "email",
    "secondaryEmail",
    "phone",
    "mobile",
    "website",
    "industry",
    "annualRevenue",
    "employeeCount",
    "source",
    "notes",
    "status",
    "assignedTo",
    "customFields",
    "address",
  ];

  safeOverrideFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(overrides, field)) {
      if (field === "address") {
        mergedPayload.address = normalizeAddress(overrides.address || {});
      } else if (field === "customFields") {
        mergedPayload.customFields = overrides.customFields && typeof overrides.customFields === "object"
          ? overrides.customFields
          : mergedPayload.customFields;
      } else if (field === "annualRevenue" || field === "employeeCount") {
        mergedPayload[field] = normalizeOptionalNumber(overrides[field]);
      } else {
        mergedPayload[field] = overrides[field];
      }
    }
  });

  mergedPayload.name = buildLeadName(mergedPayload);
  return mergedPayload;
};

// Lead stage movement blueprint rules
const STATUS_VALUES = ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"];

const TRANSITION_RULES = {
  new: {
    contacted: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAny: ["email", "phone", "mobile"],
      requireApproval: false,
    },
  },
  contacted: {
    qualified: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["company", "source"],
      requireApproval: false,
    },
    new: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
    },
    lost: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
      reasonRequired: true,
    },
  },
  qualified: {
    proposal_sent: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["company", "industry", "source"],
      requireApproval: false,
    },
    contacted: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
    },
    lost: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
      reasonRequired: true,
    },
  },
  proposal: {
    proposal_sent: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requireApproval: false,
    },
    converted: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["company"],
      requireApproval: false,
    },
    qualified: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
    },
    lost: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
      reasonRequired: true,
    },
  },
  proposal_sent: {
    converted: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["company"],
      requireApproval: false,
    },
    qualified: {
      allowedRoles: ["ADMIN", "MANAGER"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
    },
    lost: {
      allowedRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
      requiredAll: ["notes"],
      requireApproval: true,
      approverRole: "MANAGER",
      reasonRequired: true,
    },
  },
  converted: {},
  lost: {},
};

const ROLE_ORDER = {
  EMPLOYEE: 1,
  MANAGER: 2,
  ADMIN: 3,
};

const normalizeRole = (role) => String(role || "").toUpperCase();

const hasRoleLevel = (role, minimumRole) => {
  const userLevel = ROLE_ORDER[normalizeRole(role)] || 0;
  const requiredLevel = ROLE_ORDER[normalizeRole(minimumRole)] || Number.MAX_SAFE_INTEGER;
  return userLevel >= requiredLevel;
};

const getValueByPath = (obj, path) => {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const hasRequiredValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return normalizeText(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const getTransitionRule = (fromStatus, toStatus) => {
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  return TRANSITION_RULES[from]?.[to] || null;
};

const getLeadNextAction = (status, role, options = {}) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "MANAGER") {
    if (options.canAssign) {
      return { type: "assign", label: "Assign to Employee" };
    }
    if (options.assignedToName) {
      return { type: "tracking", label: `Assigned to ${options.assignedToName}` };
    }
    return { type: "assign", label: "Assign to Employee" };
  }

  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "new") {
    return { type: "call", label: "Call Lead" };
  }
  if (["contacted", "qualified", "proposal", "proposal_sent"].includes(normalizedStatus)) {
    return { type: "meeting", label: "Schedule Meeting" };
  }
  return { type: "none", label: "No Immediate Action" };
};

const validateTransitionChecklist = (lead, rule = {}) => {
  const missing = [];
  const requiredAll = Array.isArray(rule.requiredAll) ? rule.requiredAll : [];
  const requiredAny = Array.isArray(rule.requiredAny) ? rule.requiredAny : [];

  requiredAll.forEach((fieldPath) => {
    const value = getValueByPath(lead, fieldPath);
    if (!hasRequiredValue(value)) {
      missing.push(fieldPath);
    }
  });

  if (requiredAny.length > 0) {
    const hasAny = requiredAny.some((fieldPath) => hasRequiredValue(getValueByPath(lead, fieldPath)));
    if (!hasAny) {
      missing.push(`one_of:${requiredAny.join("|")}`);
    }
  }

  return missing;
};

const appendTransitionHistory = (lead, entry = {}) => {
  lead.transitionHistory = Array.isArray(lead.transitionHistory) ? lead.transitionHistory : [];
  lead.transitionHistory.push({
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    performedBy: entry.performedBy || null,
    performedAt: new Date(),
    reason: normalizeText(entry.reason || ""),
    approvalRequired: Boolean(entry.approvalRequired),
    approvalState: entry.approvalState || "none",
  });
};

const setStageTimestamp = (lead, status) => {
  const normalizedStatus = String(status || "").toLowerCase();
  lead.stageTimestamps = lead.stageTimestamps || {};

  if (normalizedStatus === "contacted") lead.stageTimestamps.contactedAt = new Date();
  if (normalizedStatus === "qualified") lead.stageTimestamps.qualifiedAt = new Date();
  if (normalizedStatus === "proposal") lead.stageTimestamps.proposalAt = new Date();
  if (normalizedStatus === "proposal_sent") lead.stageTimestamps.proposalSentAt = new Date();
  if (normalizedStatus === "converted") lead.stageTimestamps.convertedAt = new Date();
  if (normalizedStatus === "lost") lead.stageTimestamps.lostAt = new Date();
};

const PROPOSAL_REJECTION_REASONS = [
  "Too Expensive",
  "Not Interested",
  "Competitor Chosen",
  "No Response",
];

const resolveDefaultProductId = async (session) => {
  const defaultProduct = await Product.findOne({}).select("_id").session(session);
  return defaultProduct?._id || null;
};


// GET /api/leads/all -- all leads (admin or manager) with pagination/sort
router.get("/all", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const { status, search, dateFrom, dateTo, sort = 'createdAt', order = '-1', limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { secondaryEmail: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }
    // Date filtering
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    const leads = await Lead.find(filter).sort({ [sort]: parseInt(order) }).limit(parseInt(limit)).skip(parseInt(skip));
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/my -- leads assigned to the requesting employee with pagination/sort
router.get("/my", verifyToken, permit("EMPLOYEE"), async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo, sort = 'createdAt', order = '-1', limit = 100, skip = 0 } = req.query;
    const filter = { assignedTo: req.user._id };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { secondaryEmail: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }
    
    // Date filtering
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    const leads = await Lead.find(filter).sort({ [sort]: parseInt(order) }).limit(parseInt(limit)).skip(parseInt(skip));
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/assign -- assign a lead to a user (admin or manager)
router.post("/assign", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const { leadId, userId } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: "leadId is required" });
    }

    const actorRole = normalizeRole(req.user.role);
    const normalizedUserId = String(userId || "").trim();
    const lead = await Lead.findById(leadId);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (actorRole === "MANAGER") {
      const assignedToManager = lead.assignedTo && String(lead.assignedTo) === String(req.user._id);
      const assignedByManager = lead.assignedBy && String(lead.assignedBy) === String(req.user._id);
      if (!assignedToManager && !assignedByManager) {
        return res.status(403).json({
          message: "Managers can only manage leads assigned to them or assigned by them",
        });
      }
    }

    if (!normalizedUserId) {
      lead.assignedTo = null;
      lead.assignedBy = null;
      lead.assignedByRole = null;
      lead.assignedAt = null;
      await lead.save();
      return res.json(lead);
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedUserId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const assignee = await User.findById(normalizedUserId).select("_id role username name email employee_id");
    if (!assignee) {
      return res.status(404).json({ message: "Assignee user not found" });
    }

    const assigneeRole = normalizeRole(assignee.role);

    if (actorRole === "ADMIN" && assigneeRole !== "MANAGER") {
      return res.status(403).json({
        message: "Admin can assign leads only to managers",
      });
    }

    if (actorRole === "MANAGER" && assigneeRole !== "EMPLOYEE") {
      return res.status(403).json({
        message: "Manager can assign leads only to employees",
      });
    }

    lead.assignedTo = assignee._id;
    lead.assignedBy = req.user._id;
    lead.assignedByRole = actorRole;
    lead.assignedAt = new Date();

    await lead.save();
    await lead.populate("assignedTo", "username name role employee_id");
    await lead.populate("assignedBy", "username name role employee_id");

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/assignment-dashboard -- role-based assignment visibility for manager and employee dashboards
router.get("/assignment-dashboard", verifyToken, permit("MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const role = normalizeRole(req.user.role);

    let filter = { assignedTo: req.user._id };
    if (role === "MANAGER") {
      filter = {
        $or: [
        {
          $and: [
            { assignedTo: req.user._id },
            { $or: [{ assignedByRole: "ADMIN" }, { assignedByRole: { $exists: false } }] },
          ],
        },
        {
          $and: [
            { assignedBy: req.user._id },
            { assignedByRole: "MANAGER" },
          ],
        },
      ],
      };
    }
    if (role === "EMPLOYEE") {
      filter.$or = [{ assignedByRole: "MANAGER" }, { assignedByRole: { $exists: false } }];
    }

    const leads = await Lead.find(filter)
      .select("name firstName lastName company email phone mobile status assignedTo assignedBy assignedByRole assignedAt updatedAt")
      .populate("assignedBy", "username name role employee_id")
      .populate("assignedTo", "username name role employee_id")
      .sort({ assignedAt: -1, updatedAt: -1 })
      .limit(100);

    const leadIds = leads.map((lead) => lead._id);
    const completedActionByLead = new Map();

    if (leadIds.length > 0) {
      const completedActivities = await Activity.find({
        status: "Completed",
        activityType: { $in: ["call", "meeting"] },
        $or: [
          { leadId: { $in: leadIds } },
          {
            "relatedTo.recordType": "Lead",
            "relatedTo.recordId": { $in: leadIds },
          },
        ],
      })
        .select("leadId activityType completedAt updatedAt createdAt relatedTo")
        .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 });

      completedActivities.forEach((activity) => {
        const leadId = String(activity.leadId || activity.relatedTo?.recordId || "");
        if (!leadId) return;

        const type = String(activity.activityType || "").toLowerCase();
        if (!type) return;

        const completedAt = activity.completedAt || activity.updatedAt || activity.createdAt || new Date(0);
        const current = completedActionByLead.get(leadId) || {};
        const currentTime = current[type] || new Date(0);

        if (completedAt > currentTime) {
          completedActionByLead.set(leadId, {
            ...current,
            [type]: completedAt,
          });
        }
      });
    }

    const items = leads.map((lead) => {
      const canAssign = role === "MANAGER" && String(lead.assignedTo?._id || lead.assignedTo || "") === String(req.user._id);
      const canUnassign =
        role === "MANAGER" &&
        String(lead.assignedBy?._id || lead.assignedBy || "") === String(req.user._id) &&
        String(lead.assignedTo?._id || lead.assignedTo || "") !== String(req.user._id);

      const assignedToName = lead.assignedTo
        ? (lead.assignedTo.name || lead.assignedTo.username || "")
        : "";

      let nextAction = getLeadNextAction(lead.status, role, { canAssign, assignedToName });

      if (role === "EMPLOYEE" && ["call", "meeting"].includes(nextAction.type)) {
        const completedMap = completedActionByLead.get(String(lead._id)) || {};
        const actionCompletedAt = completedMap[nextAction.type] || null;
        const assignedAt = lead.assignedAt || lead.updatedAt || new Date(0);

        if (actionCompletedAt && actionCompletedAt >= assignedAt) {
          nextAction = { type: "none", label: "Action Completed" };
        }
      }

      return {
        _id: lead._id,
        name: lead.name,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        mobile: lead.mobile,
        status: lead.status,
        assignedAt: lead.assignedAt || lead.updatedAt,
        assignedByRole: lead.assignedByRole || null,
        canAssign,
        canUnassign,
        assignedBy: lead.assignedBy
          ? {
              _id: lead.assignedBy._id,
              username: lead.assignedBy.username,
              name: lead.assignedBy.name,
              role: lead.assignedBy.role,
              employee_id: lead.assignedBy.employee_id,
            }
          : null,
        assignedTo: lead.assignedTo
          ? {
              _id: lead.assignedTo._id,
              username: lead.assignedTo.username,
              name: lead.assignedTo.name,
              role: lead.assignedTo.role,
              employee_id: lead.assignedTo.employee_id,
            }
          : null,
        nextAction,
      };
    });

    const summary = {
      totalAssignedLeads: items.length,
      assignActions: items.filter((item) => item.nextAction.type === "assign").length,
      callActions: items.filter((item) => item.nextAction.type === "call").length,
      meetingActions: items.filter((item) => item.nextAction.type === "meeting").length,
      noImmediateAction: items.filter((item) => item.nextAction.type === "none").length,
    };

    res.json({ role, summary, items });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/merge -- merge duplicate leads into one primary lead
router.post("/merge", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { primaryLeadId, mergeLeadIds, overrides = {}, deleteMerged = true } = req.body || {};

    if (!primaryLeadId || !Array.isArray(mergeLeadIds) || mergeLeadIds.length === 0) {
      return res.status(400).json({ message: "primaryLeadId and mergeLeadIds are required" });
    }

    const uniqueMergeIds = [...new Set(mergeLeadIds.map((id) => String(id || "").trim()).filter(Boolean))];
    const secondaryIds = uniqueMergeIds.filter((id) => id !== String(primaryLeadId));

    if (secondaryIds.length === 0) {
      return res.status(400).json({ message: "mergeLeadIds must contain at least one lead other than primaryLeadId" });
    }

    const allIds = [String(primaryLeadId), ...secondaryIds];
    const invalidId = allIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) {
      return res.status(400).json({ message: `Invalid lead id: ${invalidId}` });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const leads = await Lead.find({ _id: { $in: allIds } }).session(session);
      if (leads.length !== allIds.length) {
        throw Object.assign(new Error("One or more leads not found"), { statusCode: 404 });
      }

      const primaryLead = leads.find((lead) => String(lead._id) === String(primaryLeadId));
      const secondaryLeads = leads.filter((lead) => String(lead._id) !== String(primaryLeadId));

      const mergedPayload = buildMergedLeadPayload(primaryLead, secondaryLeads, overrides);
      if (!mergedPayload.name) {
        throw Object.assign(new Error("Merged lead must have a name"), { statusCode: 400 });
      }

      const duplicateLead = await findDuplicateLead(mergedPayload, { excludeLeadId: primaryLead._id });
      if (duplicateLead && !secondaryLeads.some((lead) => String(lead._id) === String(duplicateLead._id))) {
        throw Object.assign(new Error("Merge would create duplicate with another lead"), { statusCode: 409 });
      }

      primaryLead.salutation = normalizeText(mergedPayload.salutation);
      primaryLead.firstName = normalizeText(mergedPayload.firstName);
      primaryLead.lastName = normalizeText(mergedPayload.lastName);
      primaryLead.name = normalizeText(mergedPayload.name);
      primaryLead.title = normalizeText(mergedPayload.title);
      primaryLead.company = normalizeText(mergedPayload.company);
      primaryLead.email = normalizeText(mergedPayload.email);
      primaryLead.secondaryEmail = normalizeText(mergedPayload.secondaryEmail);
      primaryLead.phone = normalizeText(mergedPayload.phone);
      primaryLead.mobile = normalizeText(mergedPayload.mobile);
      primaryLead.website = normalizeText(mergedPayload.website);
      primaryLead.industry = normalizeText(mergedPayload.industry);
      primaryLead.annualRevenue = normalizeOptionalNumber(mergedPayload.annualRevenue);
      primaryLead.employeeCount = normalizeOptionalNumber(mergedPayload.employeeCount);
      primaryLead.source = normalizeText(mergedPayload.source);
      primaryLead.score = normalizeOptionalNumber(mergedPayload.score) ?? 0;
      primaryLead.emailOpened = normalizeOptionalNumber(mergedPayload.emailOpened) ?? 0;
      primaryLead.websiteVisits = normalizeOptionalNumber(mergedPayload.websiteVisits) ?? 0;
      primaryLead.formSubmissions = normalizeOptionalNumber(mergedPayload.formSubmissions) ?? 0;
      primaryLead.lastActivityDate = mergedPayload.lastActivityDate || null;

      if (Object.prototype.hasOwnProperty.call(overrides, "status")) {
        const status = normalizeText(overrides.status).toLowerCase();
        if (!["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"].includes(status)) {
          throw Object.assign(new Error("Invalid status override"), { statusCode: 400 });
        }
        primaryLead.status = status;
      } else if (mergedPayload.isConverted) {
        primaryLead.status = "converted";
      }

      primaryLead.notes = normalizeText(mergedPayload.notes);
      primaryLead.address = mergedPayload.address;
      primaryLead.customFields = mergedPayload.customFields || {};
      primaryLead.assignedTo = mergedPayload.assignedTo || primaryLead.assignedTo;
      primaryLead.isConverted = mergedPayload.isConverted;
      primaryLead.convertedCustomerId = mergedPayload.convertedCustomerId;
      primaryLead.convertedContactId = mergedPayload.convertedContactId;
      primaryLead.convertedDealId = mergedPayload.convertedDealId;

      applyLeadScoring(primaryLead);

      await primaryLead.save({ session });

      const secondaryObjectIds = secondaryLeads.map((lead) => lead._id);

      const [
        customersResult,
        contactsResult,
        dealsResult,
        activitiesResult,
      ] = await Promise.all([
        Customer.updateMany(
          { leadId: { $in: secondaryObjectIds } },
          { $set: { leadId: primaryLead._id } },
          { session }
        ),
        Contact.updateMany(
          { sourceLeadId: { $in: secondaryObjectIds } },
          { $set: { sourceLeadId: primaryLead._id } },
          { session }
        ),
        Deal.updateMany(
          { sourceLeadId: { $in: secondaryObjectIds } },
          { $set: { sourceLeadId: primaryLead._id } },
          { session }
        ),
        Activity.updateMany(
          {
            "relatedTo.recordType": "Lead",
            "relatedTo.recordId": { $in: secondaryObjectIds },
          },
          {
            $set: {
              "relatedTo.recordId": primaryLead._id,
              "relatedTo.recordName": primaryLead.name,
            },
          },
          { session }
        ),
      ]);

      if (deleteMerged) {
        await Lead.deleteMany({ _id: { $in: secondaryObjectIds } }).session(session);
      } else {
        await Lead.updateMany(
          { _id: { $in: secondaryObjectIds } },
          { $set: { status: "lost", isConverted: true } },
          { session }
        );
      }

      responsePayload = {
        message: "Leads merged successfully",
        primaryLead,
        mergedLeadIds: secondaryObjectIds,
        reLinked: {
          customers: customersResult.modifiedCount || 0,
          contacts: contactsResult.modifiedCount || 0,
          deals: dealsResult.modifiedCount || 0,
          activities: activitiesResult.modifiedCount || 0,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return next(err);
  } finally {
    await session.endSession();
  }
});

// POST /api/leads -- create a new lead (any authenticated user)
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const payload = normalizeLeadPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: "Lead name required" });

    // New incoming leads always start in New stage.
    payload.status = "new";
    applyLeadScoring(payload);

    const duplicateLead = await findDuplicateLead(payload);
    if (duplicateLead) {
      const reason = getDuplicateReason(payload, duplicateLead);
      const duplicateMessage = getDuplicateMessage(reason);

      return res.status(409).json({
        message: duplicateMessage,
        reason,
        duplicateLead,
      });
    }

    const lead = await Lead.create(payload);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/bulk -- create multiple leads from CSV import
router.post("/bulk", verifyToken, async (req, res, next) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: "Leads array required" });
    }

    const normalizedLeads = leads
      .map((lead) => normalizeLeadPayload(lead))
      .filter((lead) => lead.name)
      .map((lead) => applyLeadScoring(lead));

    if (normalizedLeads.length === 0) {
      return res.status(400).json({ message: "No valid leads found in import" });
    }

    const seenEmails = new Set();
    const seenNameCompany = new Set();
    const leadsToCreate = [];
    const skipped = [];

    for (let index = 0; index < normalizedLeads.length; index += 1) {
      const lead = normalizedLeads[index];
      const keys = getDuplicateKeys(lead);

      if (keys.email && seenEmails.has(keys.email)) {
        skipped.push({
          row: index + 1,
          reason: "duplicate_email_in_file",
          lead,
        });
        continue;
      }

      if (keys.nameCompany && seenNameCompany.has(keys.nameCompany)) {
        skipped.push({
          row: index + 1,
          reason: "duplicate_name_company_in_file",
          lead,
        });
        continue;
      }

      const duplicateLead = await findDuplicateLead(lead);
      if (duplicateLead) {
        skipped.push({
          row: index + 1,
          reason: getDuplicateReason(lead, duplicateLead),
          duplicateLead,
          lead,
        });
        continue;
      }

      if (keys.email) seenEmails.add(keys.email);
      if (keys.nameCompany) seenNameCompany.add(keys.nameCompany);
      leadsToCreate.push(lead);
    }

    const createdLeads = leadsToCreate.length ? await Lead.insertMany(leadsToCreate) : [];
    res.status(201).json({
      message: `${createdLeads.length} leads imported successfully${skipped.length ? `, ${skipped.length} skipped as duplicates` : ""}`,
      count: createdLeads.length,
      skippedCount: skipped.length,
      skipped,
      leads: createdLeads,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/leads/:id -- update lead status or details
router.put("/:id", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    // Employee-specific check (permit allows but we still validate assignment)
    if (req.user.role.toUpperCase() === "EMPLOYEE") {
      if (!lead.assignedTo || !lead.assignedTo.equals(req.user._id)) {
        return res.status(403).json({ message: "Forbidden - not assigned to you" });
      }
    }

    let shouldSave = false;

    const textFields = [
      "salutation",
      "firstName",
      "lastName",
      "name",
      "title",
      "company",
      "email",
      "secondaryEmail",
      "phone",
      "mobile",
      "website",
      "industry",
      "source",
      "notes",
    ];

    textFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        lead[field] = normalizeText(req.body[field]);
        shouldSave = true;
      }
    });

    if (Object.prototype.hasOwnProperty.call(req.body, "annualRevenue")) {
      lead.annualRevenue = normalizeOptionalNumber(req.body.annualRevenue);
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "employeeCount")) {
      lead.employeeCount = normalizeOptionalNumber(req.body.employeeCount);
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "emailOpened")) {
      lead.emailOpened = Math.max(0, normalizeOptionalNumber(req.body.emailOpened) ?? 0);
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "websiteVisits")) {
      lead.websiteVisits = Math.max(0, normalizeOptionalNumber(req.body.websiteVisits) ?? 0);
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "formSubmissions")) {
      lead.formSubmissions = Math.max(0, normalizeOptionalNumber(req.body.formSubmissions) ?? 0);
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "lastActivityDate")) {
      const activityDate = req.body.lastActivityDate ? new Date(req.body.lastActivityDate) : null;
      if (activityDate && Number.isNaN(activityDate.getTime())) {
        return res.status(400).json({ message: "Invalid lastActivityDate" });
      }
      lead.lastActivityDate = activityDate;
      shouldSave = true;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "customFields")) {
      lead.customFields = req.body.customFields && typeof req.body.customFields === "object"
        ? req.body.customFields
        : {};
      shouldSave = true;
    }

    const hasAddressUpdate =
      Object.prototype.hasOwnProperty.call(req.body, "address") ||
      ["street", "city", "state", "postalCode", "country"].some((field) =>
        Object.prototype.hasOwnProperty.call(req.body, field)
      );

    if (hasAddressUpdate) {
      const incomingAddress = req.body.address && typeof req.body.address === "object" ? req.body.address : {};
      const nextAddress = {
        street: normalizeText(
          Object.prototype.hasOwnProperty.call(incomingAddress, "street")
            ? incomingAddress.street
            : req.body.street
        ),
        city: normalizeText(
          Object.prototype.hasOwnProperty.call(incomingAddress, "city")
            ? incomingAddress.city
            : req.body.city
        ),
        state: normalizeText(
          Object.prototype.hasOwnProperty.call(incomingAddress, "state")
            ? incomingAddress.state
            : req.body.state
        ),
        postalCode: normalizeText(
          Object.prototype.hasOwnProperty.call(incomingAddress, "postalCode")
            ? incomingAddress.postalCode
            : req.body.postalCode
        ),
        country: normalizeText(
          Object.prototype.hasOwnProperty.call(incomingAddress, "country")
            ? incomingAddress.country
            : req.body.country
        ),
      };

      lead.address = Object.values(nextAddress).some(Boolean) ? nextAddress : undefined;
      shouldSave = true;
    }

    // Keep display name in sync when first/last name is edited.
    if (
      Object.prototype.hasOwnProperty.call(req.body, "firstName") ||
      Object.prototype.hasOwnProperty.call(req.body, "lastName") ||
      Object.prototype.hasOwnProperty.call(req.body, "name")
    ) {
      lead.name = buildLeadName(lead);
      shouldSave = true;
    }

    const dedupeFieldsTouched =
      Object.prototype.hasOwnProperty.call(req.body, "email") ||
      Object.prototype.hasOwnProperty.call(req.body, "firstName") ||
      Object.prototype.hasOwnProperty.call(req.body, "lastName") ||
      Object.prototype.hasOwnProperty.call(req.body, "name") ||
      Object.prototype.hasOwnProperty.call(req.body, "company");

    if (dedupeFieldsTouched) {
      const duplicateLead = await findDuplicateLead(
        {
          email: lead.email,
          firstName: lead.firstName,
          lastName: lead.lastName,
          name: lead.name,
          company: lead.company,
        },
        { excludeLeadId: lead._id }
      );

      if (duplicateLead) {
        const reason = getDuplicateReason(lead, duplicateLead);
        const duplicateMessage = getDuplicateMessage(reason);

        return res.status(409).json({
          message: duplicateMessage,
          reason,
          duplicateLead,
        });
      }
    }

    // Blueprint stage movement validation
    const { status: newStatus } = req.body;
    if (newStatus !== undefined) {
      const currentStatus = lead.status?.toLowerCase() || "new";
      const normalizedNewStatus = String(newStatus || "").toLowerCase().trim();
      const userRole = normalizeRole(req.user.role);
      const transitionReason = normalizeText(req.body.transitionReason || req.body.reason);
      const approveTransition = req.body.approveTransition === true;

      if (!STATUS_VALUES.includes(normalizedNewStatus)) {
        return res.status(400).json({
          message: `Invalid status: "${normalizedNewStatus}". Must be one of: ${STATUS_VALUES.join(", ")}`,
        });
      }

      if (currentStatus === normalizedNewStatus) {
        if (shouldSave) {
          applyLeadScoring(lead);
          await lead.save();
        }
        return res.json(lead);
      }

      const rule = getTransitionRule(currentStatus, normalizedNewStatus);
      if (!rule) {
        return res.status(400).json({
          message: `Invalid stage transition: "${currentStatus}" -> "${normalizedNewStatus}" not allowed`,
        });
      }

      if (Array.isArray(rule.allowedRoles) && !rule.allowedRoles.includes(userRole)) {
        return res.status(403).json({
          message: `Role ${userRole} cannot move lead from ${currentStatus} to ${normalizedNewStatus}`,
        });
      }

      const missingFields = validateTransitionChecklist(lead, rule);
      if (missingFields.length > 0) {
        return res.status(400).json({
          message: "Cannot move lead. Required lifecycle checklist is incomplete.",
          missingFields,
        });
      }

      if (rule.reasonRequired && !transitionReason) {
        return res.status(400).json({
          message: "Transition reason is required for this stage change.",
        });
      }

      if (rule.requireApproval) {
        const approverRole = rule.approverRole || "MANAGER";
        const canApproveNow = hasRoleLevel(userRole, approverRole) && (approveTransition || userRole === "ADMIN");

        if (!canApproveNow) {
          lead.pendingTransitionApproval = {
            fromStatus: currentStatus,
            toStatus: normalizedNewStatus,
            requestedBy: req.user._id,
            requestedAt: new Date(),
            reason: transitionReason,
            requiredRole: approverRole,
          };
          appendTransitionHistory(lead, {
            fromStatus: currentStatus,
            toStatus: normalizedNewStatus,
            performedBy: req.user._id,
            reason: transitionReason,
            approvalRequired: true,
            approvalState: "requested",
          });

          if (shouldSave) {
            applyLeadScoring(lead);
          }

          await lead.save();
          return res.status(202).json({
            message: "Transition request created and waiting for approval",
            pendingTransitionApproval: lead.pendingTransitionApproval,
            lead,
          });
        }
      }

      // Converting from status update must run full lead->customer->deal workflow.
      if (normalizedNewStatus === "converted") {
        appendTransitionHistory(lead, {
          fromStatus: currentStatus,
          toStatus: normalizedNewStatus,
          performedBy: req.user._id,
          reason: transitionReason,
          approvalRequired: Boolean(rule.requireApproval),
          approvalState: rule.requireApproval ? "approved" : "none",
        });
        lead.pendingTransitionApproval = undefined;
        await lead.save();
        req.body.transitionReason = transitionReason;
        return convertLeadToCustomerDeal(req, res, next);
      }

      lead.status = normalizedNewStatus;
      if (["converted", "lost"].includes(normalizedNewStatus)) {
        lead.isConverted = true;
      }
      setStageTimestamp(lead, normalizedNewStatus);
      lead.pendingTransitionApproval = undefined;

      appendTransitionHistory(lead, {
        fromStatus: currentStatus,
        toStatus: normalizedNewStatus,
        performedBy: req.user._id,
        reason: transitionReason,
        approvalRequired: Boolean(rule.requireApproval),
        approvalState: rule.requireApproval ? "approved" : "none",
      });

      shouldSave = true;
    }

    if (shouldSave) {
      applyLeadScoring(lead);
      await lead.save();
    }
    
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

const loadLeadForTracking = async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    res.status(404).json({ message: "Lead not found" });
    return null;
  }

  if (req.user.role?.toUpperCase() === "EMPLOYEE") {
    if (!lead.assignedTo || !lead.assignedTo.equals(req.user._id)) {
      res.status(403).json({ message: "Forbidden - not assigned to you" });
      return null;
    }
  }

  return lead;
};

router.post("/:id/events/email-open", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await loadLeadForTracking(req, res);
    if (!lead) return;

    lead.emailOpened = (Number(lead.emailOpened) || 0) + 1;
    lead.lastActivityDate = new Date();
    applyLeadScoring(lead);
    await lead.save();
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/events/website-visit", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await loadLeadForTracking(req, res);
    if (!lead) return;

    lead.websiteVisits = (Number(lead.websiteVisits) || 0) + 1;
    lead.lastActivityDate = new Date();
    applyLeadScoring(lead);
    await lead.save();
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/events/form-submission", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await loadLeadForTracking(req, res);
    if (!lead) return;

    lead.formSubmissions = (Number(lead.formSubmissions) || 0) + 1;
    lead.lastActivityDate = new Date();
    applyLeadScoring(lead);
    await lead.save();
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/proposal", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const userRole = normalizeRole(req.user.role);
    if (userRole === "EMPLOYEE") {
      if (!lead.assignedTo || String(lead.assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Forbidden - not assigned to you" });
      }
    }

    const currentStatus = String(lead.status || "new").toLowerCase();
    if (!["qualified", "proposal", "proposal_sent"].includes(currentStatus)) {
      return res.status(400).json({ message: "Lead must be in Qualified or Proposal stage before creating proposal" });
    }

    if (["qualified", "proposal"].includes(currentStatus)) {
      const nextStatus = "proposal_sent";
      const rule = getTransitionRule(currentStatus, nextStatus);
      if (!rule) {
        return res.status(400).json({ message: "Cannot move lead to proposal sent stage" });
      }

      if (Array.isArray(rule.allowedRoles) && !rule.allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: "You are not allowed to move this lead to Proposal Sent" });
      }

      const shouldEnforceChecklist = userRole !== "EMPLOYEE";
      if (shouldEnforceChecklist) {
        const missingFields = validateTransitionChecklist(lead, rule);
        if (missingFields.length > 0) {
          return res.status(400).json({
            message: "Cannot move lead. Required lifecycle checklist is incomplete.",
            missingFields,
          });
        }
      }

      lead.status = nextStatus;
      setStageTimestamp(lead, nextStatus);
      appendTransitionHistory(lead, {
        fromStatus: currentStatus,
        toStatus: nextStatus,
        performedBy: req.user._id,
        reason: userRole === "EMPLOYEE"
          ? "Proposal created by employee (checklist override)"
          : "Proposal sent",
        approvalRequired: false,
        approvalState: "none",
      });
    }

    const proposalSubject = normalizeText(req.body?.subject) || `Proposal for ${normalizeText(lead.company) || normalizeText(lead.name) || "Customer"}`;
    const proposalMessage = normalizeText(req.body?.message);
    const proposalTerms = normalizeText(req.body?.terms);
    const proposalCurrency = normalizeText(req.body?.currency || "INR").toUpperCase();
    const proposalAmount = req.body?.amount === "" || req.body?.amount === undefined || req.body?.amount === null
      ? null
      : Number(req.body.amount);
    const proposalValidUntil = req.body?.validUntil ? new Date(req.body.validUntil) : null;

    if (proposalAmount !== null && !Number.isFinite(proposalAmount)) {
      return res.status(400).json({ message: "Proposal amount must be a valid number" });
    }

    if (proposalValidUntil && Number.isNaN(proposalValidUntil.getTime())) {
      return res.status(400).json({ message: "Invalid proposal validUntil date" });
    }

    const shouldSendEmail = req.body?.sendEmail !== false;
    const proposalEmail = normalizeText(req.body?.email || lead.email || lead.secondaryEmail);

    if (shouldSendEmail && !proposalEmail) {
      return res.status(400).json({ message: "Customer email is required to send proposal" });
    }

    lead.latestProposal = {
      subject: proposalSubject,
      amount: proposalAmount,
      currency: proposalCurrency || "INR",
      validUntil: proposalValidUntil,
      message: proposalMessage,
      terms: proposalTerms,
      sentTo: shouldSendEmail ? proposalEmail : "",
      sentAt: new Date(),
      sentBy: req.user._id,
      createdAt: new Date(),
    };

    let emailPreviewUrl = null;
    if (shouldSendEmail) {
      const emailResult = await sendLeadProposalEmail({
        to: proposalEmail,
        leadName: normalizeText(lead.name),
        company: normalizeText(lead.company),
        proposal: {
          subject: proposalSubject,
          amount: proposalAmount,
          currency: proposalCurrency,
          validUntil: proposalValidUntil,
          message: proposalMessage,
          terms: proposalTerms,
        },
      });

      emailPreviewUrl = emailResult?.preview || null;
      lead.latestProposal.sentAt = new Date();
      lead.latestProposal.sentTo = proposalEmail;
      lead.latestProposal.sentBy = req.user._id;
    }

    applyLeadScoring(lead);
    await lead.save();

    return res.json({
      message: shouldSendEmail ? "Proposal created and sent to customer" : "Proposal created",
      emailPreviewUrl,
      proposal: lead.latestProposal,
      lead,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/proposal/accept", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const requestedValue = req.body?.value;
    const normalizedValue =
      requestedValue === undefined || requestedValue === null || requestedValue === ""
        ? null
        : Number(requestedValue);

    if (normalizedValue !== null && !Number.isFinite(normalizedValue)) {
      return res.status(400).json({ message: "Deal value must be a valid number" });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const lead = await Lead.findById(req.params.id).session(session);
      if (!lead) {
        throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
      }

      const userRole = normalizeRole(req.user.role);
      if (userRole === "EMPLOYEE") {
        if (!lead.assignedTo || String(lead.assignedTo) !== String(req.user._id)) {
          throw Object.assign(new Error("Forbidden - not assigned to you"), { statusCode: 403 });
        }
      }

      if (lead.isConverted || String(lead.status || "").toLowerCase() === "converted") {
        throw Object.assign(new Error("Lead already converted"), { statusCode: 400 });
      }

      const currentStatus = String(lead.status || "new").toLowerCase();
      if (currentStatus !== "proposal_sent") {
        throw Object.assign(new Error("Proposal must be in Proposal Sent stage before acceptance"), { statusCode: 400 });
      }

      if (!lead.latestProposal?.createdAt) {
        throw Object.assign(new Error("No proposal found for this lead"), { statusCode: 400 });
      }

      const conversionName = buildConversionName(lead);
      const conversionEmail = normalizeEmailForStorage(lead.email);
      const dealValue = normalizedValue !== null ? normalizedValue : (Number(lead.latestProposal?.amount) || 0);
      const defaultProductId = await resolveDefaultProductId(session);

      if (!defaultProductId) {
        throw Object.assign(new Error("No product found. Please create at least one product before accepting proposal."), {
          statusCode: 400,
        });
      }

      const customer = await Customer.create(
        [
          {
            name: conversionName,
            email: conversionEmail,
            phone: lead.phone || lead.mobile,
            company: lead.company,
            leadId: lead._id,
            status: "Active",
            reason: "",
          },
        ],
        { session }
      ).then((docs) => docs[0]);

      const deal = await Deal.create(
        [
          {
            customerId: customer._id,
            sourceLeadId: lead._id,
            product: defaultProductId,
            name: `${conversionName} - Proposal Accepted`,
            company: lead.company,
            contact: customer.name,
            email: customer.email,
            phone: customer.phone,
            stage: "Closed Won",
            status: "Active",
            reason: "",
            value: dealValue,
            amount: dealValue,
            assignedTo: lead.assignedTo || req.user._id,
          },
        ],
        { session }
      ).then((docs) => docs[0]);

      let contact = await Contact.findOne({ sourceLeadId: lead._id }).session(session);
      if (!contact && customer.email) {
        contact = await Contact.findOne({ email: customer.email }).session(session);
      }

      if (contact) {
        contact.sourceLeadId = lead._id;
        contact.sourceDealId = deal._id;
        contact.name = customer.name;
        contact.company = customer.company;
        contact.email = customer.email;
        contact.phone = customer.phone;
        contact.source = lead.source || "Lead Conversion";
        await contact.save({ session });
      } else {
        contact = await Contact.create(
          [
            {
              sourceLeadId: lead._id,
              sourceDealId: deal._id,
              name: customer.name,
              company: customer.company,
              email: normalizeEmailForStorage(customer.email),
              phone: customer.phone,
              source: lead.source || "Lead Conversion",
              convertedAt: new Date(),
            },
          ],
          { session }
        ).then((docs) => docs[0]);
      }

      const previousStatus = String(lead.status || "proposal_sent").toLowerCase();
      lead.status = "converted";
      lead.isConverted = true;
      lead.convertedCustomerId = customer._id;
      lead.convertedContactId = contact?._id || null;
      lead.convertedDealId = deal._id;
      setStageTimestamp(lead, "converted");
      lead.pendingTransitionApproval = undefined;

      appendTransitionHistory(lead, {
        fromStatus: previousStatus,
        toStatus: "converted",
        performedBy: req.user?._id || null,
        reason: normalizeText(req.body?.transitionReason || "Proposal accepted by customer"),
        approvalRequired: false,
        approvalState: "none",
      });

      applyLeadScoring(lead);
      await lead.save({ session });

      responsePayload = {
        message: "Proposal accepted. Lead converted with customer, contact, and closed-won deal.",
        lead,
        customer,
        contact,
        deal,
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate data conflict while accepting proposal. Please verify email/contact uniqueness and try again.",
      });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return next(err);
  } finally {
    await session.endSession();
  }
});

router.post("/:id/proposal/reject", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const userRole = normalizeRole(req.user.role);
    if (userRole === "EMPLOYEE") {
      if (!lead.assignedTo || String(lead.assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Forbidden - not assigned to you" });
      }
    }

    const currentStatus = String(lead.status || "new").toLowerCase();
    if (currentStatus !== "proposal_sent") {
      return res.status(400).json({ message: "Proposal must be in Proposal Sent stage before rejection" });
    }

    const rejectionReason = normalizeText(req.body?.reason);
    if (!rejectionReason) {
      return res.status(400).json({
        message: "Rejection reason is required",
        allowedReasons: PROPOSAL_REJECTION_REASONS,
      });
    }

    if (!PROPOSAL_REJECTION_REASONS.includes(rejectionReason)) {
      return res.status(400).json({
        message: "Invalid rejection reason",
        allowedReasons: PROPOSAL_REJECTION_REASONS,
      });
    }

    const previousStatus = currentStatus;
    lead.status = "lost";
    lead.isConverted = true;
    lead.pendingTransitionApproval = undefined;
    lead.notes = [normalizeText(lead.notes), `Proposal rejected: ${rejectionReason}`]
      .filter(Boolean)
      .join("\n");
    setStageTimestamp(lead, "lost");

    appendTransitionHistory(lead, {
      fromStatus: previousStatus,
      toStatus: "lost",
      performedBy: req.user._id,
      reason: rejectionReason,
      approvalRequired: false,
      approvalState: "none",
    });

    applyLeadScoring(lead);
    await lead.save();

    return res.json({
      message: "Proposal rejected and lead moved to Lost",
      lead,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/transition-approval", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const pending = lead.pendingTransitionApproval;
    if (!pending?.toStatus || !pending?.fromStatus) {
      return res.status(400).json({ message: "No pending transition approval found for this lead" });
    }

    const approve = req.body?.approve !== false;
    const approvalComment = normalizeText(req.body?.reason || "");
    const approverRole = normalizeRole(req.user.role);

    if (!hasRoleLevel(approverRole, pending.requiredRole || "MANAGER")) {
      return res.status(403).json({
        message: `Only ${pending.requiredRole || "MANAGER"} or above can approve this transition`,
      });
    }

    if (!approve) {
      appendTransitionHistory(lead, {
        fromStatus: pending.fromStatus,
        toStatus: pending.toStatus,
        performedBy: req.user._id,
        reason: approvalComment,
        approvalRequired: true,
        approvalState: "rejected",
      });
      lead.pendingTransitionApproval = undefined;
      await lead.save();
      return res.json({ message: "Transition request rejected", lead });
    }

    if (String(lead.status || "").toLowerCase() !== String(pending.fromStatus || "").toLowerCase()) {
      return res.status(409).json({
        message: "Lead status changed after request. Please create a new transition request.",
      });
    }

    const rule = getTransitionRule(pending.fromStatus, pending.toStatus);
    if (!rule) {
      return res.status(400).json({ message: "The pending transition is no longer valid" });
    }

    const missingFields = validateTransitionChecklist(lead, rule);
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Cannot approve transition. Required lifecycle checklist is incomplete.",
        missingFields,
      });
    }

    if (pending.toStatus === "converted") {
      lead.pendingTransitionApproval = undefined;
      appendTransitionHistory(lead, {
        fromStatus: pending.fromStatus,
        toStatus: pending.toStatus,
        performedBy: req.user._id,
        reason: approvalComment || pending.reason,
        approvalRequired: true,
        approvalState: "approved",
      });
      await lead.save();
      req.body.transitionReason = approvalComment || pending.reason || "";
      req.body.approveTransition = true;
      return convertLeadToCustomerDeal(req, res, next);
    }

    lead.status = pending.toStatus;
    if (["converted", "lost"].includes(String(pending.toStatus || "").toLowerCase())) {
      lead.isConverted = true;
    }
    setStageTimestamp(lead, pending.toStatus);
    lead.pendingTransitionApproval = undefined;

    appendTransitionHistory(lead, {
      fromStatus: pending.fromStatus,
      toStatus: pending.toStatus,
      performedBy: req.user._id,
      reason: approvalComment || pending.reason,
      approvalRequired: true,
      approvalState: "approved",
    });

    applyLeadScoring(lead);
    await lead.save();

    return res.json({ message: "Transition request approved", lead });
  } catch (err) {
    next(err);
  }
});


const convertLeadToCustomerDeal = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const leadId = req.params.id;
    const requestedValue = req.body?.value;
    const normalizedValue =
      requestedValue === undefined || requestedValue === null || requestedValue === ""
        ? null
        : Number(requestedValue);

    if (normalizedValue !== null && !Number.isFinite(normalizedValue)) {
      return res.status(400).json({ message: "Deal value must be a valid number" });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const lead = await Lead.findById(leadId).session(session);
      if (!lead) {
        throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
      }

      if (normalizeRole(req.user.role) === "EMPLOYEE") {
        if (!lead.assignedTo || String(lead.assignedTo) !== String(req.user._id)) {
          throw Object.assign(new Error("Forbidden - not assigned to you"), { statusCode: 403 });
        }
      }

      if (lead.isConverted || String(lead.status || "").toLowerCase() === "converted") {
        throw Object.assign(new Error("Lead already converted"), { statusCode: 400 });
      }

      const conversionName = buildConversionName(lead);
      const conversionEmail = normalizeEmailForStorage(lead.email);
      const defaultProductId = await resolveDefaultProductId(session);

      if (!defaultProductId) {
        throw Object.assign(new Error("No product found. Please create at least one product before converting lead."), {
          statusCode: 400,
        });
      }

      const customer = await Customer.create(
        [
          {
            name: conversionName,
            email: conversionEmail,
            phone: lead.phone || lead.mobile,
            company: lead.company,
            leadId: lead._id,
            status: "Active",
            reason: "",
          },
        ],
        { session }
      ).then((docs) => docs[0]);

      const deal = await Deal.create(
        [
          {
            customerId: customer._id,
            sourceLeadId: lead._id,
            product: defaultProductId,
            name: `${conversionName} - Deal`,
            company: lead.company,
            contact: customer.name,
            email: customer.email,
            phone: customer.phone,
            stage: "Qualification",
            status: "Active",
            reason: "",
            value: normalizedValue,
            amount: normalizedValue || 0,
            assignedTo: lead.assignedTo || req.user._id,
          },
        ],
        { session }
      ).then((docs) => docs[0]);

      // Keep legacy contacts list in sync with customer conversion.
      let contact = await Contact.findOne({ sourceLeadId: lead._id }).session(session);
      if (!contact && customer.email) {
        contact = await Contact.findOne({ email: customer.email }).session(session);
      }

      if (contact) {
        contact.sourceLeadId = lead._id;
        contact.sourceDealId = deal._id;
        contact.name = customer.name;
        contact.company = customer.company;
        contact.email = customer.email;
        contact.phone = customer.phone;
        contact.source = lead.source || "Lead Conversion";
        await contact.save({ session });
      } else if (customer.email) {
        contact = await Contact.create(
          [
            {
              sourceLeadId: lead._id,
              sourceDealId: deal._id,
              name: customer.name,
              company: customer.company,
              email: normalizeEmailForStorage(customer.email),
              phone: customer.phone,
              source: lead.source || "Lead Conversion",
              convertedAt: new Date(),
            },
          ],
          { session }
        ).then((docs) => docs[0]);
      }

      const previousStatus = String(lead.status || "new").toLowerCase();

      lead.status = "converted";
      lead.isConverted = true;
      lead.convertedCustomerId = customer._id;
      lead.convertedContactId = contact?._id || null;
      lead.convertedDealId = deal._id;
      setStageTimestamp(lead, "converted");
      lead.pendingTransitionApproval = undefined;

      appendTransitionHistory(lead, {
        fromStatus: previousStatus,
        toStatus: "converted",
        performedBy: req.user?._id || null,
        reason: normalizeText(req.body?.transitionReason || ""),
        approvalRequired: false,
        approvalState: "none",
      });

      await lead.save({ session });

      responsePayload = {
        message: "Lead converted successfully",
        lead,
        customer,
        deal,
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate data conflict while converting lead. Please verify email/contact uniqueness and try again.",
      });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error("Lead conversion error:", err);
    return next(err);
  } finally {
    await session.endSession();
  }
};

// PUT /api/leads/:id/convert
router.put("/:id/convert", verifyToken, convertLeadToCustomerDeal);

// Backward compatibility with existing clients.
router.post("/:id/convert", verifyToken, convertLeadToCustomerDeal);

// DELETE /api/leads/:id -- delete a lead (admin only)
router.delete("/:id", verifyToken, permit("ADMIN"), async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json({ message: "Lead deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// Advanced filter endpoint for saved views
const View = require("../models/view");

// Helper to build MongoDB query from filter structure
const buildAdvancedFilter = (filters, user) => {
  if (!filters || !filters.conditions || filters.conditions.length === 0) {
    return {};
  }

  const processCondition = (condition) => {
    let query = {};
    
    // Handle standard fields
    switch (condition.field) {
      case 'owner':
        query.assignedTo = user._id;
        break;
      case 'status':
        if (condition.operator === 'equals') {
          query.status = condition.value;
        } else if (condition.operator === 'in') {
          query.status = { $in: Array.isArray(condition.value) ? condition.value : [condition.value] };
        }
        break;
      case 'source':
        if (condition.operator === 'equals') {
          query.source = condition.value;
        } else if (condition.operator === 'contains') {
          query.source = { $regex: condition.value, $options: 'i' };
        }
        break;
      case 'createdAt':
      case 'updatedAt':
        const dateField = condition.field;
        query[dateField] = {};
        if (condition.operator === 'after') {
          query[dateField].$gte = new Date(condition.value);
        } else if (condition.operator === 'before') {
          const endDate = new Date(condition.value);
          endDate.setHours(23, 59, 59, 999);
          query[dateField].$lte = endDate;
        } else if (condition.operator === 'between') {
          query[dateField].$gte = new Date(condition.from);
          const endDate2 = new Date(condition.to);
          endDate2.setHours(23, 59, 59, 999);
          query[dateField].$lte = endDate2;
        }
        break;
      default:
        // Custom fields or other string fields
        if (condition.operator === 'equals') {
          query[condition.field] = condition.value;
        } else if (condition.operator === 'contains') {
          query[condition.field] = { $regex: condition.value, $options: 'i' };
        } else if (condition.field.startsWith('customFields.')) {
          const cfField = condition.field.replace('customFields.', '');
          query['customFields.' + cfField] = condition.operator === 'equals' ? condition.value : { $regex: condition.value, $options: 'i' };
        }
    }
    
    return query;
  };

  if (filters.logic === 'OR') {
    const orConditions = filters.conditions.map(processCondition);
    return { $or: orConditions };
  } else {
    // Default AND
    const andConditions = filters.conditions.map(processCondition);
    return { $and: andConditions };
  }
};

// POST /api/leads/filter - Advanced filtering for saved views
router.post("/filter", verifyToken, async (req, res, next) => {
  try {
    const { filters, sort = { createdAt: -1 }, limit = 100, skip = 0, viewMode = 'all' } = req.body;
    
    let baseFilter = {};
    
    // Role-based base filter
    if (viewMode === 'my' || req.user.role.toUpperCase() === 'EMPLOYEE') {
      baseFilter.assignedTo = req.user._id;
    }
    
    // Merge advanced filters
    if (filters) {
      const advancedFilter = buildAdvancedFilter(filters, req.user);
      baseFilter = { ...baseFilter, ...advancedFilter };
    }
    
    const leads = await Lead.find(baseFilter)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean();
    
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// Add pagination/sort support to existing endpoints
router.get("/all", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const { status, search, dateFrom, dateTo, sort = 'createdAt', order = '-1', limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { secondaryEmail: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }
    // Date filtering
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    const leads = await Lead.find(filter).sort({ [sort]: parseInt(order) }).limit(parseInt(limit)).skip(parseInt(skip));
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

router.get("/my", verifyToken, permit("EMPLOYEE"), async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo, sort = 'createdAt', order = '-1', limit = 100, skip = 0 } = req.query;
    const filter = { assignedTo: req.user._id };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { secondaryEmail: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }
    
    // Date filtering
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    const leads = await Lead.find(filter).sort({ [sort]: parseInt(order) }).limit(parseInt(limit)).skip(parseInt(skip));
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// Views API for saved views system
router.get("/views", verifyToken, async (req, res, next) => {
  try {
    const reqUserId = req.user._id;
    
    const views = await View.find({
      $and: [
        {
          $or: [
            { userId: reqUserId, visibility: 'private' },
            { visibility: 'shared' }
          ]
        },
        {
          $or: [
            { module: 'lead' },
            { module: { $exists: false } }
          ]
        }
      ]
    }).sort({ createdAt: -1 }).lean();
    
    res.json(views);
  } catch (err) {
    next(err);
  }
});

router.post("/views", verifyToken, async (req, res, next) => {
  try {
    const viewData = {
      ...req.body,
      userId: req.user._id,
      module: 'lead'
    };
    
    // Validation
    if (!viewData.name) {
      return res.status(400).json({ message: 'View name required' });
    }
    if (!['private', 'shared'].includes(viewData.visibility)) {
      viewData.visibility = 'private';
    }
    
    const view = await View.create(viewData);
    res.status(201).json(view);
  } catch (err) {
    next(err);
  }
});

router.put("/views/:id", verifyToken, async (req, res, next) => {
  try {
    const view = await View.findOne({
      _id: req.params.id,
      userId: req.user._id,
      $or: [{ module: 'lead' }, { module: { $exists: false } }]
    });
    if (!view) {
      return res.status(404).json({ message: 'View not found or access denied' });
    }
    
    const updateData = { ...req.body, module: 'lead' };
    Object.assign(view, updateData);
    await view.save();
    
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.delete("/views/:id", verifyToken, async (req, res, next) => {
  try {
    const view = await View.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user._id,
      $or: [{ module: 'lead' }, { module: { $exists: false } }]
    });
    
    if (!view) {
      return res.status(404).json({ message: 'View not found or access denied' });
    }
    
    res.json({ message: 'View deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Seed default views on first login (run once per user)
router.post("/views/seed-defaults", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    const defaultViews = [
      {
        name: 'All Leads',
        filters: {},
        columns: ['name', 'company', 'email', 'phone', 'status', 'source'],
        sort: { createdAt: -1 },
        module: 'lead',
        visibility: 'shared'
      },
      {
        name: 'My Leads',
        filters: { conditions: [{ field: 'owner', operator: 'equals', value: true }], logic: 'AND' },
        columns: ['name', 'company', 'status', 'source'],
        sort: { updatedAt: -1 },
        module: 'lead',
        visibility: 'private'
      },
      {
        name: 'Recently Added',
        filters: { 
          conditions: [{ field: 'createdAt', operator: 'after', value: new Date(Date.now() - 7*24*60*60*1000).toISOString() }], 
          logic: 'AND' 
        },
        columns: ['name', 'email', 'status', 'createdAt'],
        sort: { createdAt: -1 },
        module: 'lead',
        visibility: 'shared'
      }
    ];

    const existingViews = await View.find({
      userId,
      $or: [{ module: 'lead' }, { module: { $exists: false } }]
    });
    if (existingViews.length === 0) {
      const seededViews = await View.insertMany(
        defaultViews.map(v => ({ ...v, userId }))
      );
      res.json({ message: 'Default views seeded', views: seededViews });
    } else {
      res.json({ message: 'Default views already exist', count: existingViews.length });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
