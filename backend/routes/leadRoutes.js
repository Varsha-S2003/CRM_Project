const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Customer = require("../models/customer");
const Deal = require("../models/deal");
const Activity = require("../models/activity");
const { applyLeadScoring } = require("../utils/leadScoring");

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
  const { email, phone, name, company } = getDuplicateKeys(payload);
  const conditions = [];

  if (email) {
    conditions.push({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
  }

  if (phone) {
    const phonePattern = buildPhoneFlexibleRegex(phone);
    conditions.push({
      $or: [
        { phone: { $regex: phonePattern } },
        { mobile: { $regex: phonePattern } },
      ],
    });
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

  if (candidate.phone && existing.phone && candidate.phone === existing.phone) {
    return "phone";
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
  if (reason === "phone") return "Duplicate lead detected: same phone found";
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

// Lead stage movement validation
const allowedTransitions = {
  new: ["contacted"],
  contacted: ["qualified", "new", "lost"],
  qualified: ["proposal", "contacted", "lost"],
  proposal: ["converted", "qualified", "lost"],
  converted: [],
  lost: []
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
    if (!leadId || !userId) {
      return res.status(400).json({ message: "leadId and userId required" });
    }
    const lead = await Lead.findByIdAndUpdate(
      leadId,
      { assignedTo: userId },
      { new: true }
    );
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
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
        if (!["new", "contacted", "qualified", "proposal", "converted", "lost"].includes(status)) {
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

      if (keys.phone && seenEmails.has(`phone:${keys.phone}`)) {
        skipped.push({
          row: index + 1,
          reason: "duplicate_phone_in_file",
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
      if (keys.phone) seenEmails.add(`phone:${keys.phone}`);
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
      Object.prototype.hasOwnProperty.call(req.body, "phone") ||
      Object.prototype.hasOwnProperty.call(req.body, "mobile") ||
      Object.prototype.hasOwnProperty.call(req.body, "firstName") ||
      Object.prototype.hasOwnProperty.call(req.body, "lastName") ||
      Object.prototype.hasOwnProperty.call(req.body, "name") ||
      Object.prototype.hasOwnProperty.call(req.body, "company");

    if (dedupeFieldsTouched) {
      const duplicateLead = await findDuplicateLead(
        {
          email: lead.email,
          phone: lead.phone,
          mobile: lead.mobile,
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

    // Strict stage movement validation
    const { status: newStatus } = req.body;
    if (newStatus !== undefined) {
      const currentStatus = lead.status?.toLowerCase() || 'new';
      const normalizedNewStatus = newStatus.toString().toLowerCase().trim();
      
      // Validate enum
      const validStatuses = ["new", "contacted", "qualified", "proposal", "converted", "lost"];
      if (!validStatuses.includes(normalizedNewStatus)) {
        return res.status(400).json({ 
          message: `Invalid status: "${normalizedNewStatus}". Must be one of: ${validStatuses.join(", ")}` 
        });
      }
      
      // Skip if same
      if (currentStatus === normalizedNewStatus) {
        if (shouldSave) {
          applyLeadScoring(lead);
          await lead.save();
        }
        res.json(lead);
        return;
      }
      
      // Strict transition validation
      if (!allowedTransitions[currentStatus]?.includes(normalizedNewStatus)) {
        return res.status(400).json({ 
          message: `Invalid stage transition: "${currentStatus}" → "${normalizedNewStatus}" not allowed`
        });
      }

      // Converting from status update must run full lead->customer->deal workflow.
      if (normalizedNewStatus === "converted") {
        if (shouldSave) {
          await lead.save();
        }
        return convertLeadToCustomerDeal(req, res, next);
      }
      
      // Update
      lead.status = normalizedNewStatus;
      if (["converted", "lost"].includes(normalizedNewStatus)) {
        lead.isConverted = true;
      }
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

      if (lead.isConverted || String(lead.status || "").toLowerCase() === "converted") {
        throw Object.assign(new Error("Lead already converted"), { statusCode: 400 });
      }

      const conversionName = buildConversionName(lead);
      const conversionEmail = normalizeEmailForStorage(lead.email);

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

      lead.status = "converted";
      lead.isConverted = true;
      lead.convertedCustomerId = customer._id;
      lead.convertedContactId = contact?._id || null;
      lead.convertedDealId = deal._id;
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
