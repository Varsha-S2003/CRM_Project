const mongoose = require("mongoose");
const Vendor = require("../models/vendor");
const Bill = require("../models/bill");
const Payment = require("../models/payment");
const VendorActivity = require("../models/vendorActivity");
const { computeVendorFinancials, refreshBillStatus } = require("../utils/vendorFinance");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;

const normalizeListField = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const sanitizeVendorPayload = (body = {}) => {
  const payload = {
    vendorName: String(body.vendorName || "").trim(),
    companyName: String(body.companyName || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    phone: String(body.phone || "").trim(),
    gstNumber: String(body.gstNumber || "").trim().toUpperCase(),
    address: String(body.address || "").trim(),
    city: String(body.city || "").trim(),
    state: String(body.state || "").trim(),
    productsProvided: normalizeListField(body.productsProvided ?? body.products),
    servicesProvided: normalizeListField(body.servicesProvided ?? body.services),
    status: String(body.status || "Active").trim(),
  };

  if (!payload.gstNumber) delete payload.gstNumber;
  return payload;
};

const validateVendorPayload = (payload, { requireName = true } = {}) => {
  const errors = [];

  if (requireName && !payload.vendorName) {
    errors.push("vendorName is required");
  }

  if (payload.email && !EMAIL_REGEX.test(payload.email)) {
    errors.push("Invalid email format");
  }

  if (payload.gstNumber && !GST_REGEX.test(payload.gstNumber)) {
    errors.push("Invalid GST format");
  }

  if (!["Active", "Inactive"].includes(payload.status)) {
    errors.push("status must be Active or Inactive");
  }

  return errors;
};

const parseCsvLine = (line) => {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const trackVendorActivity = async ({ vendorId, action, entityType, entityId, message, metadata = {} }) => {
  try {
    await VendorActivity.create({
      vendorId,
      action,
      entityType,
      entityId,
      message,
      metadata,
    });
  } catch (error) {
    console.error("Failed to persist vendor activity:", error.message);
  }
};

const createVendor = async (req, res) => {
  try {
    const payload = sanitizeVendorPayload(req.body);
    const errors = validateVendorPayload(payload);

    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }

    const duplicate = await Vendor.findOne({
      $or: [
        ...(payload.email ? [{ email: payload.email }] : []),
        ...(payload.gstNumber ? [{ gstNumber: payload.gstNumber }] : []),
      ],
    });

    if (duplicate) {
      const updatedVendor = await Vendor.findByIdAndUpdate(duplicate._id, payload, { new: true, runValidators: true });
      await trackVendorActivity({
        vendorId: updatedVendor._id,
        action: "VENDOR_UPDATED",
        entityType: "Vendor",
        entityId: updatedVendor._id,
        message: "Vendor record merged due to duplicate email or GST",
        metadata: { mode: "duplicate_merge" },
      });
      return res.status(200).json({
        message: "Vendor existed by email/GST and was updated",
        merged: true,
        vendor: updatedVendor,
      });
    }

    const vendor = await Vendor.create(payload);
    await trackVendorActivity({
      vendorId: vendor._id,
      action: "VENDOR_CREATED",
      entityType: "Vendor",
      entityId: vendor._id,
      message: `Vendor ${vendor.vendorName} created`,
      metadata: { createdBy: req.user?._id || null },
    });

    return res.status(201).json({ message: "Vendor created", vendor, merged: false });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Vendor email or GST already exists" });
    }
    return res.status(500).json({ message: error.message || "Failed to create vendor" });
  }
};

const getVendors = async (req, res) => {
  try {
    const { search = "", status = "all", page = 1, limit = 10 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 10));

    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { vendorName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { gstNumber: { $regex: search, $options: "i" } },
        { productsProvided: { $regex: search, $options: "i" } },
        { servicesProvided: { $regex: search, $options: "i" } },
      ];
    }

    const [vendors, total] = await Promise.all([
      Vendor.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
      Vendor.countDocuments(filter),
    ]);

    const financialMap = await computeVendorFinancials(vendors.map((vendor) => vendor._id));
    const rows = vendors.map((vendor) => {
      const financials = financialMap.get(String(vendor._id)) || {
        totalBills: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        overdueBills: 0,
      };

      return {
        ...vendor.toObject(),
        payable: financials.totalOutstanding,
        financials,
      };
    });

    return res.json({
      data: rows,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch vendors" });
  }
};

const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;

    const billFilter = { vendorId: id };
    const paymentFilter = { vendorId: id };

    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      billFilter.createdAt = { ...(billFilter.createdAt || {}), $gte: fromDate };
      paymentFilter.paymentDate = { ...(paymentFilter.paymentDate || {}), $gte: fromDate };
    }

    if (toDate && !Number.isNaN(toDate.getTime())) {
      billFilter.createdAt = { ...(billFilter.createdAt || {}), $lte: toDate };
      paymentFilter.paymentDate = { ...(paymentFilter.paymentDate || {}), $lte: toDate };
    }

    const [bills, payments, activities] = await Promise.all([
      Bill.find(billFilter).sort({ createdAt: -1 }),
      Payment.find(paymentFilter).populate("billId", "billNumber amount status dueDate").sort({ paymentDate: -1 }),
      VendorActivity.find({ vendorId: id }).sort({ createdAt: -1 }).limit(50),
    ]);

    for (const bill of bills) {
      await refreshBillStatus(bill);
    }

    const refreshedBills = await Bill.find({ _id: { $in: bills.map((bill) => bill._id) } }).sort({ createdAt: -1 });
    const financialMap = await computeVendorFinancials([id]);
    const summary = financialMap.get(String(id)) || {
      totalBills: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueBills: 0,
    };

    return res.json({
      vendor,
      bills: refreshedBills,
      payments,
      activities,
      summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch vendor" });
  }
};

const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const payload = sanitizeVendorPayload(req.body);
    const errors = validateVendorPayload(payload, { requireName: false });
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }

    const vendor = await Vendor.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    await trackVendorActivity({
      vendorId: vendor._id,
      action: "VENDOR_UPDATED",
      entityType: "Vendor",
      entityId: vendor._id,
      message: `Vendor ${vendor.vendorName} updated`,
      metadata: { updatedBy: req.user?._id || null },
    });

    return res.json({ message: "Vendor updated", vendor });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Vendor email or GST already exists" });
    }
    return res.status(500).json({ message: error.message || "Failed to update vendor" });
  }
};

const softDeleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { status: "Inactive" },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    await trackVendorActivity({
      vendorId: vendor._id,
      action: "VENDOR_UPDATED",
      entityType: "Vendor",
      entityId: vendor._id,
      message: `Vendor ${vendor.vendorName} marked inactive`,
      metadata: { deletedBy: req.user?._id || null, mode: "soft_delete" },
    });

    return res.json({ message: "Vendor set to inactive", vendor });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to delete vendor" });
  }
};

const exportVendorsCsv = async (_req, res) => {
  try {
    const vendors = await Vendor.find({}).sort({ createdAt: -1 }).lean();
    const headers = [
      "vendorName",
      "companyName",
      "email",
      "phone",
      "gstNumber",
      "address",
      "city",
      "state",
      "productsProvided",
      "servicesProvided",
      "status",
    ];

    const escapeCell = (value) => {
      const str = String(value ?? "");
      if (/[,"\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [headers.join(",")];
    vendors.forEach((vendor) => {
      lines.push(
        headers
          .map((key) => {
            const value = Array.isArray(vendor[key]) ? vendor[key].join("; ") : vendor[key];
            return escapeCell(value || "");
          })
          .join(",")
      );
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
    return res.send(lines.join("\n"));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to export vendors" });
  }
};

const importVendorsCsv = async (req, res) => {
  try {
    const csvText = String(req.body?.csv || "");
    if (!csvText.trim()) {
      return res.status(400).json({ message: "csv is required in body" });
    }

    const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ message: "CSV must include header and at least one row" });
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const requiredHeaders = ["vendorName", "email"];

    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length) {
      return res.status(400).json({ message: `Missing required CSV headers: ${missing.join(", ")}` });
    }

    let created = 0;
    let merged = 0;

    for (let index = 1; index < lines.length; index += 1) {
      const cells = parseCsvLine(lines[index]);
      const row = {};
      headers.forEach((header, headerIndex) => {
        row[header] = cells[headerIndex] || "";
      });

      const payload = sanitizeVendorPayload(row);
      const errors = validateVendorPayload(payload);
      if (errors.length) {
        continue;
      }

      const duplicate = await Vendor.findOne({
        $or: [
          ...(payload.email ? [{ email: payload.email }] : []),
          ...(payload.gstNumber ? [{ gstNumber: payload.gstNumber }] : []),
        ],
      });

      if (duplicate) {
        await Vendor.findByIdAndUpdate(duplicate._id, payload, { new: true, runValidators: true });
        merged += 1;
      } else {
        await Vendor.create(payload);
        created += 1;
      }
    }

    return res.json({ message: "CSV import completed", created, merged });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to import vendors" });
  }
};

module.exports = {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  softDeleteVendor,
  exportVendorsCsv,
  importVendorsCsv,
  trackVendorActivity,
};
