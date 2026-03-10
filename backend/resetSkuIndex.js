// Script to drop and recreate the SKU index properly
const mongoose = require("mongoose");

async function resetSkuIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/crm");
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("products");

    // Drop existing SKU index
    console.log("Dropping existing SKU index...");
    await collection.dropIndex("SKU_1").catch(() => {});
    
    // Create new sparse unique index
    console.log("Creating new sparse unique index...");
    await collection.createIndex(
      { sku: 1 }, 
      { 
        unique: true, 
        sparse: true,
        background: true
      }
    );

    console.log("SKU index reset successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

resetSkuIndex();

