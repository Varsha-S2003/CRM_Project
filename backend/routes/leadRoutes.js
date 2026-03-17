const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Deal = require("../models/deal");

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
    rating: normalizeText(payload.rating).toLowerCase(),
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

  if (!normalized.rating) delete normalized.rating;
  if (!Object.values(normalized.address).some(Boolean)) delete normalized.address;

  return normalized;
};

// GET /api/leads/all -- all leads (admin or manager)
router.get("/all", verifyToken, permit("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
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
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/my -- leads assigned to the requesting employee
router.get("/my", verifyToken, permit("EMPLOYEE"), async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo } = req.query;
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
    
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
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

// POST /api/leads -- create a new lead (any authenticated user)
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const payload = normalizeLeadPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: "Lead name required" });

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
      .filter((lead) => lead.name);

    if (normalizedLeads.length === 0) {
      return res.status(400).json({ message: "No valid leads found in import" });
    }

    const createdLeads = await Lead.insertMany(normalizedLeads);
    res.status(201).json({
      message: `${createdLeads.length} leads imported successfully`,
      count: createdLeads.length,
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

    // Simple status update
    const { status } = req.body;
    if (status) {
      lead.status = status;
      await lead.save();
    }
    
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/convert
router.post("/:id/convert", verifyToken, async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const { createDeal = true, dealName, dealAmount = 0, handleDupe = "create" } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    if (lead.isConverted) return res.status(400).json({ message: "Lead already converted" });

    // Duplicate contact check by email
    let existingContact = null;
    if (lead.email) {
      existingContact = await Contact.findOne({ email: lead.email });
    }

    let contact;
    if (existingContact && handleDupe === "link") {
      contact = existingContact;
    } else {
      const contactData = {
        sourceLeadId: lead._id,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone || lead.mobile,
        source: lead.source || "Lead Conversion",
        convertedAt: new Date(),
      };
      contact = await Contact.create(contactData);
    }

    // Optional deal creation
    let dealId = null;
    if (createDeal) {
      const dealData = {
        sourceLeadId: lead._id,
        name: dealName || `${lead.name || "Lead"} - Deal`,
        company: lead.company,
        amount: dealAmount,
        contact: contact.name,
        email: contact.email,
        phone: contact.phone,
        stage: "qualification",
      };
      const newDeal = await Deal.create(dealData);
      dealId = newDeal._id;
    }

    // Update lead
    lead.status = "converted";
    lead.isConverted = true;
    lead.convertedContactId = contact._id;
    lead.convertedDealId = dealId;
    await lead.save();

    res.json({
      message: "Lead converted successfully",
      lead: lead,
      contact: contact._id,
      deal: dealId || null,
    });
  } catch (err) {
    next(err);
  }
});

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

module.exports = router;
