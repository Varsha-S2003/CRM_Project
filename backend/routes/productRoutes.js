const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Product = require("../models/product");

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
    
    if (!name || !category || !price) {
      return res.status(400).json({ message: "Name, category and price are required" });
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
      price,
      description: description || "",
      stock: 0
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
    let { name, sku, category, price, description } = req.body;
    
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
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
    if (price !== undefined) product.price = price;
    if (description !== undefined) product.description = description;
    
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

