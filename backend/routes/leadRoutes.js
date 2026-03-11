const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Lead = require("../models/lead");

// GET /api/leads/all -- all leads (admin or manager)
// optional filters via query string
router.get("/all", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
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
    res.status(500).json({ message: err.message });
  }
});

// GET /api/leads/my -- leads assigned to the requesting employee
router.get("/my", verifyToken, permit("EMPLOYEE"), async (req, res) => {
  try {
    const { search, dateFrom, dateTo } = req.query;
    const filter = { assignedTo: req.user._id };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
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
    res.status(500).json({ message: err.message });
  }
});

// POST /api/leads/assign -- assign a lead to a user (admin or manager)
router.post("/assign", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
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
    res.status(500).json({ message: err.message });
  }
});

// POST /api/leads -- create a new lead (any authenticated user)
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, company, email, phone, source, status, notes } = req.body;
    if (!name) return res.status(400).json({ message: "Name required" });
    
    const lead = await Lead.create({ 
      name, 
      company, 
      email, 
      phone, 
      source,
      status: status || "new",
      notes 
    });
    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/leads/:id -- update lead status or details
// employees may only update leads assigned to them; managers/admin can update any
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const role = req.user.role ? req.user.role.toUpperCase() : "";
    if (role === "EMPLOYEE" && !lead.assignedTo?.equals(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    Object.assign(lead, req.body);
    await lead.save();
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/leads/:id -- delete a lead (admin only)
router.delete("/:id", verifyToken, permit("ADMIN"), async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json({ message: "Lead deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

