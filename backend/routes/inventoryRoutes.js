const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const Inventory = require("../models/inventory");
const Product = require("../models/product");

// GET /api/inventory -- all inventory transactions
router.get("/", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), async (req, res) => {
  try {
    const { search } = req.query;
    let inventory;
    
    if (search) {
      // Check if search is a date (format: YYYY-MM-DD)
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(search);
      
      // First get all inventory records
      inventory = await Inventory.find()
        .populate("product", "name sku")
        .sort({ createdAt: -1 });
      
      // Filter by search criteria
      inventory = inventory.filter(record => {
        const productName = record.product?.name?.toLowerCase() || "";
        const productSku = record.product?.sku?.toLowerCase() || "";
        const recordDate = record.date ? new Date(record.date).toISOString().split("T")[0] : "";
        
        return productName.includes(search.toLowerCase()) ||
               productSku.toLowerCase().includes(search.toLowerCase()) ||
               (isDate && recordDate === search);
      });
    } else {
      inventory = await Inventory.find()
        .populate("product", "name sku")
        .sort({ createdAt: -1 });
    }
    
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory -- add inventory (increase stock)
router.post("/", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const { product, quantity, date } = req.body;
    
    if (!product || !quantity) {
      return res.status(400).json({ message: "Product and quantity are required" });
    }
    
    if (quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }
    
    // Find the product
    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Create inventory record
    const inventory = await Inventory.create({
      product,
      quantity,
      date: date || Date.now()
    });
    
    // Increase product stock
    productDoc.stock += quantity;
    await productDoc.save();
    
    // Populate product details for response
    await inventory.populate("product", "name sku");
    
    res.status(201).json(inventory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/inventory/:id -- update inventory
router.put("/:id", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const { product, quantity, date } = req.body;
    
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory record not found" });
    }
    
    // Get the old product and quantity
    const oldProductId = inventory.product;
    const oldQuantity = inventory.quantity;
    
    // Update inventory record
    if (product) inventory.product = product;
    if (quantity) inventory.quantity = quantity;
    if (date) inventory.date = date;
    
    await inventory.save();
    
    // Adjust product stock accordingly
    // First, restore the old product stock
    if (oldProductId) {
      const oldProduct = await Product.findById(oldProductId);
      if (oldProduct) {
        oldProduct.stock = Math.max(0, oldProduct.stock - oldQuantity);
        await oldProduct.save();
      }
    }
    
    // Then, add to the new (or same) product stock
    const newProductId = product || oldProductId;
    const newQuantity = quantity || oldQuantity;
    if (newProductId) {
      const newProduct = await Product.findById(newProductId);
      if (newProduct) {
        newProduct.stock += newQuantity;
        await newProduct.save();
      }
    }
    
    // Populate product details for response
    await inventory.populate("product", "name sku");
    
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/inventory/:id -- delete inventory (decrease stock)
router.delete("/:id", verifyToken, permit("ADMIN"), async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory record not found" });
    }
    
    // Find and update the product stock
    const product = await Product.findById(inventory.product);
    if (product) {
      // Decrease product stock (ensure it doesn't go below 0)
      product.stock = Math.max(0, product.stock - inventory.quantity);
      await product.save();
    }
    
    // Delete the inventory record
    await Inventory.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Inventory record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

