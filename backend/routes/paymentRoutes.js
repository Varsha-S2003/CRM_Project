const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { addPayment, getPayments } = require("../controllers/paymentController");

const router = express.Router();

router.post("/", verifyToken, addPayment);
router.get("/", verifyToken, getPayments);

module.exports = router;
