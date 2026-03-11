const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const Deal = require("../models/deal");
const Contact = require("../models/contact");

const syncDealContact = async (deal) => {
  const contactPayload = {
    sourceDealId: deal._id,
    name: deal.contact || deal.name,
    company: deal.company || "",
    email: deal.email || "",
    phone: deal.phone || "",
    source: "Deal",
    convertedAt: deal.createdAt || new Date(),
  };

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

router.get("/", verifyToken, async (req, res) => {
  try {
    const deals = await Deal.find().sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { sourceLeadId, name, company, amount, contact, email, phone, stage } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name required" });
    }

    let deal = null;
    if (sourceLeadId) {
      deal = await Deal.findOne({ sourceLeadId });
    }

    if (deal) {
      return res.json(deal);
    }

    deal = await Deal.create({
      sourceLeadId: sourceLeadId || null,
      name,
      company,
      amount: Number(amount) || 0,
      contact,
      email,
      phone,
      stage: stage || "qualification",
    });

    await syncDealContact(deal);

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
      .map((deal) => ({
        name: String(deal.name || "").trim(),
        company: String(deal.company || "").trim(),
        amount: Number(deal.amount) || 0,
        contact: String(deal.contact || "").trim(),
        email: String(deal.email || "").trim(),
        phone: String(deal.phone || "").trim(),
        stage: deal.stage || "qualification",
      }))
      .filter((deal) => deal.name);

    if (normalizedDeals.length === 0) {
      return res.status(400).json({ message: "No valid deals found in import" });
    }

    const createdDeals = await Deal.insertMany(normalizedDeals);
    await Promise.all(createdDeals.map((deal) => syncDealContact(deal)));

    res.status(201).json({
      message: `${createdDeals.length} deals imported successfully`,
      count: createdDeals.length,
      deals: createdDeals,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, "amount")) {
      updates.amount = Number(updates.amount) || 0;
    }

    const deal = await Deal.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    await syncDealContact(deal);

    res.json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    await Contact.deleteMany({ sourceDealId: deal._id });
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
