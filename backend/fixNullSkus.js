// Script to fix products with null SKUs
const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("./models/product");

async function fixNullSkus() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/crm");
    console.log("Connected to MongoDB");

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

    console.log("Done fixing null SKUs!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

fixNullSkus();

