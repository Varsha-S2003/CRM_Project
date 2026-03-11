const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const Contact = require("../models/contact");

router.get("/", verifyToken, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ convertedAt: -1, createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { sourceLeadId, sourceDealId, name, company, email, phone, source, convertedAt } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name required" });
    }

    let contact = null;
    if (sourceLeadId) {
      contact = await Contact.findOne({ sourceLeadId });
    }
    if (!contact && sourceDealId) {
      contact = await Contact.findOne({ sourceDealId });
    }

    if (contact) {
      Object.assign(contact, {
        name,
        company,
        email,
        phone,
        source,
        convertedAt: convertedAt || contact.convertedAt,
      });
      await contact.save();
      return res.json(contact);
    }

    contact = await Contact.create({
      sourceLeadId: sourceLeadId || null,
      sourceDealId: sourceDealId || null,
      name,
      company,
      email,
      phone,
      source,
      convertedAt: convertedAt || new Date(),
    });

    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
