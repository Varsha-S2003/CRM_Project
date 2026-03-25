const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Product = require("../models/product");

const SERVICE_CATEGORIES = ["license", "storage", "subscription"];

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseOptionalDate = (value) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getValidatedTypePayload = (body) => {
  const errors = [];
  const payload = {};

  const type = body.type === "service" ? "service" : "product";
  payload.type = type;
  payload.vendor = (body.vendor || "").trim();

  const lowStockThreshold = parseOptionalNumber(body.lowStockThreshold);
  if (Number.isNaN(lowStockThreshold) || (lowStockThreshold !== undefined && lowStockThreshold < 0)) {
    errors.push("Low stock threshold must be a non-negative number");
  } else if (lowStockThreshold !== undefined) {
    payload.lowStockThreshold = lowStockThreshold;
  }

  if (type === "product") {
    return { errors, payload };
  }

  const { serviceCategory } = body;
  if (!SERVICE_CATEGORIES.includes(serviceCategory)) {
    errors.push("Valid service category is required for services");
    return { errors, payload };
  }

  payload.serviceCategory = serviceCategory;

  if (serviceCategory === "license") {
    const totalLicenses = parseOptionalNumber(body.totalLicenses);
    const usedLicenses = parseOptionalNumber(body.usedLicenses ?? 0);
    const licenseAlertThreshold = parseOptionalNumber(body.licenseAlertThreshold ?? 5);
    const expiryDate = parseOptionalDate(body.expiryDate);

    if (totalLicenses === undefined || Number.isNaN(totalLicenses) || totalLicenses < 0) {
      errors.push("totalLicenses is required and must be a non-negative number");
    }
    if (Number.isNaN(usedLicenses) || usedLicenses < 0) {
      errors.push("usedLicenses must be a non-negative number");
    }
    if (Number.isNaN(licenseAlertThreshold) || licenseAlertThreshold < 0) {
      errors.push("licenseAlertThreshold must be a non-negative number");
    }
    if (expiryDate === null) {
      errors.push("expiryDate must be a valid date");
    }
    if (
      totalLicenses !== undefined &&
      !Number.isNaN(totalLicenses) &&
      !Number.isNaN(usedLicenses) &&
      usedLicenses > totalLicenses
    ) {
      errors.push("usedLicenses cannot be greater than totalLicenses");
    }

    payload.totalLicenses = totalLicenses;
    payload.usedLicenses = usedLicenses;
    payload.licenseAlertThreshold = licenseAlertThreshold;
    payload.expiryDate = expiryDate;
  }

  if (serviceCategory === "storage") {
    const totalCapacity = parseOptionalNumber(body.totalCapacity);
    const usedCapacity = parseOptionalNumber(body.usedCapacity ?? 0);

    if (totalCapacity === undefined || Number.isNaN(totalCapacity) || totalCapacity <= 0) {
      errors.push("totalCapacity is required and must be greater than 0");
    }
    if (Number.isNaN(usedCapacity) || usedCapacity < 0) {
      errors.push("usedCapacity must be a non-negative number");
    }
    if (
      totalCapacity !== undefined &&
      !Number.isNaN(totalCapacity) &&
      !Number.isNaN(usedCapacity) &&
      usedCapacity > totalCapacity
    ) {
      errors.push("usedCapacity cannot be greater than totalCapacity");
    }

    payload.totalCapacity = totalCapacity;
    payload.usedCapacity = usedCapacity;
    payload.capacityUnit = body.capacityUnit === "TB" ? "TB" : "GB";
  }

  if (serviceCategory === "subscription") {
    const startDate = parseOptionalDate(body.startDate);
    const endDate = parseOptionalDate(body.endDate);

    if (!["monthly", "yearly"].includes(body.billingCycle)) {
      errors.push("billingCycle is required and must be monthly or yearly");
    }
    if (startDate === null) {
      errors.push("startDate must be a valid date");
    }
    if (endDate === null) {
      errors.push("endDate must be a valid date");
    }
    if (startDate && endDate && startDate > endDate) {
      errors.push("startDate cannot be later than endDate");
    }

    payload.billingCycle = body.billingCycle;
    payload.startDate = startDate;
    payload.endDate = endDate;
    payload.expiryDate = endDate;
    payload.autoRenew = Boolean(body.autoRenew);
  }

  return { errors, payload };
};

// GET /api/products -- all products
router.get("/", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    
    if (search) {
      // Check if search is a date (format: YYYY-MM-DD)
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(search);
      
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
      
      // Add date search if it's a valid date format
      if (isDate) {
        const searchDate = new Date(search);
        const nextDay = new Date(search);
        nextDay.setDate(nextDay.getDate() + 1);
        
        filter.$or.push({
          createdAt: {
            $gte: searchDate,
            $lt: nextDay
          }
        });
      }
    }
    
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id -- get single product
router.get("/:id", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products -- create product
router.post("/", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    const { errors, payload: typePayload } = getValidatedTypePayload(req.body);
    
    if (!name || !category || price === undefined || price === null || price === "") {
      return res.status(400).json({ message: "Name, category and price are required" });
    }
    if (Number.isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }
    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }
    
    const prefix = category.substring(0, 3).toUpperCase();
    
    // Find all products in this category with valid SKUs
    const productsInCategory = await Product.find({ 
      category,
      sku: { $ne: null, $exists: true, $ne: "" }
    }).sort({ sku: -1 });
    
    // Extract the highest number from existing SKUs
    let highestNum = 100;
    if (productsInCategory.length > 0) {
      const existingSku = productsInCategory[0].sku;
      const match = existingSku.match(/(\d+)$/);
      if (match) {
        highestNum = parseInt(match[1], 10);
      }
    }
    
    // Generate new SKU with the next number
    const sku = `${prefix}-${highestNum + 1}`;
    
    const product = await Product.create({
      name,
      sku,
      category,
      price: Number(price),
      description: description || "",
      stock: 0,
      ...typePayload
    });
    
    res.status(201).json(product);
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({ message: "SKU conflict. Please try again." });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products/fix-skus - Fix products with null SKUs
router.post("/fix-skus", verifyToken, permit("ADMIN"), async (req, res) => {
  try {
    // Find all products with null or missing SKU
    const productsWithNullSku = await Product.find({ 
      $or: [
        { sku: null },
        { sku: { $exists: false } },
        { sku: "" }
      ]
    });

    console.log(`Found ${productsWithNullSku.length} products with null/missing SKU`);

    // Get unique categories
    const categories = [...new Set(productsWithNullSku.map(p => p.category))];
    
    for (const category of categories) {
      // Count existing products in this category with valid SKUs
      const count = await Product.countDocuments({ 
        category,
        sku: { $ne: null, $exists: true, $ne: "" }
      });
      
      // Get products in this category without SKU
      const productsInCategory = await Product.find({ 
        category,
        $or: [
          { sku: null },
          { sku: { $exists: false } },
          { sku: "" }
        ]
      });

      let counter = count;
      for (const product of productsInCategory) {
        const prefix = category.substring(0, 3).toUpperCase();
        const sku = `${prefix}-${100 + counter + 1}`;
        product.sku = sku;
        await product.save();
        console.log(`Updated ${product.name} with SKU: ${sku}`);
        counter++;
      }
    }

    res.json({ message: `Fixed ${productsWithNullSku.length} products` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id -- update product
router.put("/:id", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    let { name, sku, category, price, description, type, vendor, lowStockThreshold } = req.body;
    
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const incomingType = type || product.type || "product";
    const { errors, payload: typePayload } = getValidatedTypePayload({
      ...product.toObject(),
      ...req.body,
      type: incomingType
    });
    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }
    
    // Check if SKU is being changed and if it already exists
    if (sku && sku !== product.sku) {
      sku = sku.trim();
      const skuExists = await Product.findOne({ sku });
      if (skuExists) {
        return res.status(400).json({ message: "SKU already exists" });
      }
    }
    
    // Update fields
    if (name) product.name = name;
    if (sku) product.sku = sku.trim();
    if (category) product.category = category;
    if (price !== undefined) {
      if (Number.isNaN(Number(price)) || Number(price) < 0) {
        return res.status(400).json({ message: "Price must be a non-negative number" });
      }
      product.price = Number(price);
    }
    if (description !== undefined) product.description = description;
    if (type !== undefined) product.type = typePayload.type;
    if (vendor !== undefined) product.vendor = (vendor || "").trim();
    if (lowStockThreshold !== undefined) product.lowStockThreshold = typePayload.lowStockThreshold;

    // Service/Product specific fields
    Object.keys(typePayload).forEach((key) => {
      if (["type", "vendor", "lowStockThreshold"].includes(key)) return;
      product[key] = typePayload[key];
    });
    
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id -- delete product (admin only)
router.delete("/:id", verifyToken, permit("ADMIN"), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

