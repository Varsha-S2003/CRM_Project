const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  createBill,
  getBills,
  updateBillStatus,
  getOverdueNotifications,
} = require("../controllers/billController");

const router = express.Router();

router.post("/", verifyToken, createBill);
router.get("/", verifyToken, getBills);
router.get("/overdue/notifications", verifyToken, getOverdueNotifications);
router.put("/:id", verifyToken, updateBillStatus);

module.exports = router;
