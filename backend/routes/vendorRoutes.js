const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  softDeleteVendor,
  exportVendorsCsv,
  importVendorsCsv,
} = require("../controllers/vendorController");

const router = express.Router();

router.post("/", verifyToken, createVendor);
router.get("/", verifyToken, getVendors);
router.get("/export/csv", verifyToken, exportVendorsCsv);
router.post("/import/csv", verifyToken, importVendorsCsv);
router.get("/:id", verifyToken, getVendorById);
router.put("/:id", verifyToken, updateVendor);
router.delete("/:id", verifyToken, softDeleteVendor);

module.exports = router;
