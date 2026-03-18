const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const Customer = require("../models/customer");

router.get("/", verifyToken, async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate("leadId", "name email phone status source")
      .sort({ createdAt: -1 });

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
