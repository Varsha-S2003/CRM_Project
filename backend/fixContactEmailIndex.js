const mongoose = require("mongoose");
require("dotenv").config();

async function fixContactEmailIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/crm");
    console.log("Connected to MongoDB");

    const collection = mongoose.connection.db.collection("contacts");

    console.log("Dropping existing contacts email index if present...");
    await collection.dropIndex("email_1").catch(() => {});

    console.log("Creating sparse non-unique email index...");
    await collection.createIndex(
      { email: 1 },
      {
        sparse: true,
        background: true,
      }
    );

    console.log("contacts.email index fixed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error fixing contacts email index:", error.message);
    process.exit(1);
  }
}

fixContactEmailIndex();
