const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Import User model
const User = require("./models/user");

// ✅ Import routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// employee endpoint for admin to create employee accounts
const employeeRoutes = require("./routes/employeeRoutes");
app.use("/api/employees", employeeRoutes);

// leads endpoint for managing leads
const leadRoutes = require("./routes/leadRoutes");
app.use("/api/leads", leadRoutes);

const dealRoutes = require("./routes/dealRoutes");
app.use("/api/deals", dealRoutes);

const contactRoutes = require("./routes/contactRoutes");
app.use("/api/contacts", contactRoutes);

const customerRoutes = require("./routes/customerRoutes");
app.use("/api/customers", customerRoutes);

const activityRoutes = require("./routes/activityRoutes");
app.use("/api/activities", activityRoutes);

const callRoutes = require("./routes/callRoutes");
app.use("/api/calls", callRoutes);

// stats used by admin dashboard
const statsRoutes = require("./routes/statsRoutes");
app.use("/api/stats", statsRoutes);

// products endpoint for managing products
const productRoutes = require("./routes/productRoutes");
app.use("/api/products", productRoutes);

// unified items endpoint for products + services
const itemRoutes = require("./routes/itemRoutes");
app.use("/api/items", itemRoutes);

// inventory endpoint for managing inventory
const inventoryRoutes = require("./routes/inventoryRoutes");
app.use("/api/inventory", inventoryRoutes);

const settingsRoutes = require("./routes/settingsRoutes");
app.use("/api/settings", settingsRoutes);

const vendorRoutes = require("./routes/vendorRoutes");
app.use("/api/vendors", vendorRoutes);

const billRoutes = require("./routes/billRoutes");
app.use("/api/bills", billRoutes);

const invoiceRoutes = require("./routes/invoiceRoutes");
app.use("/api/invoices", invoiceRoutes);

const paymentRoutes = require("./routes/paymentRoutes");
app.use("/api/payments", paymentRoutes);

// MongoDB Atlas connection with DNS/SRV fallback handling
async function initializeDatabase() {
  const primaryUri = process.env.MONGO_URI;
  const fallbackUri = process.env.MONGO_URI_FALLBACK;

  if (!primaryUri) {
    throw new Error("MONGO_URI is missing in environment.");
  }

  // Optional: override DNS resolvers on restrictive networks.
  if (process.env.MONGO_DNS_SERVERS) {
    const dnsServers = process.env.MONGO_DNS_SERVERS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (dnsServers.length > 0) {
      dns.setServers(dnsServers);
      console.log(`Using custom DNS servers for MongoDB lookup: ${dnsServers.join(", ")}`);
    }
  }

  try {
    await mongoose.connect(primaryUri);
  } catch (err) {
    const isSrvLookupError = err && (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") && err.syscall === "querySrv";

    if (isSrvLookupError && fallbackUri) {
      console.warn("Primary SRV connection failed. Retrying with MONGO_URI_FALLBACK...");
      await mongoose.connect(fallbackUri);
    } else {
      throw err;
    }
  }

  console.log("MongoDB Atlas Connected");
  try {
    const { dedupeItems } = require("./utils/dedupeItems");
    const mergedItems = await dedupeItems();
    if (mergedItems.length > 0) {
      console.log(`Collapsed ${mergedItems.length} duplicate item groups on startup`);
    }
  } catch (e) {
    console.error("Failed to dedupe items:", e.message);
  }
  // make sure we have a settings document; admins may not have visited the settings page yet
  try {
    const AppSettings = require("./models/appSettings");
    let s = await AppSettings.findOne();
    if (!s) {
      await AppSettings.create({});
      console.log("Created default AppSettings document");
    }
  } catch (e) {
    console.error("Failed to initialize app settings:", e.message);
  }

  try {
    const { startDailyDigestJob } = require("./utils/dailyDigest");
    startDailyDigestJob();
    console.log("Daily digest notification job initialized");
  } catch (e) {
    console.error("Failed to initialize daily digest job:", e.message);
  }
}

initializeDatabase().catch((err) => console.log(err));

// test route
app.get("/", (req, res) => {
  res.send("Server working");
});


// 🔥 TEMPORARY ROUTE TO CREATE ADMIN (NO POSTMAN NEEDED)
app.get("/create-admin", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: "admin@elogixa.com" });
    if (existingUser) {
      return res.json({ message: "Admin already exists", user: existingUser });
    }

    const hashedPassword = await bcrypt.hash("123456", 10);

    const admin = await User.create({
      username: "admin",
      email: "admin@elogixa.com",
      password: hashedPassword,
      role: "ADMIN"
    });

    res.json({ message: "Admin created successfully", admin });

  } catch (error) {
    res.status(500).json(error.message);
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

// 🔥 SEED ROUTE - Create sample users for testing
app.get("/seed-users", async (req, res) => {
  try {
    const results = [];
    
    // Create Admin
    let admin = await User.findOne({ email: "admin@elogixa.com" });
    if (!admin) {
      const hashedPassword = await bcrypt.hash("123456", 10);
      admin = await User.create({
        username: "admin",
        email: "admin@elogixa.com",
        password: hashedPassword,
        role: "ADMIN"
      });
      results.push("Admin created: admin@elogixa.com / 123456");
    } else {
      results.push("Admin already exists: admin@elogixa.com");
    }
    
    // Create Manager
    let manager = await User.findOne({ email: "manager@elogixa.com" });
    if (!manager) {
      const hashedPassword = await bcrypt.hash("123456", 10);
      manager = await User.create({
        username: "manager",
        email: "manager@elogixa.com",
        password: hashedPassword,
        role: "MANAGER"
      });
      results.push(`Manager created: manager@elogixa.com / 123456 (ID: ${manager.employee_id})`);
    } else {
      results.push(`Manager already exists: manager@elogixa.com (ID: ${manager.employee_id})`);
    }
    
    // Create Employee
    let employee = await User.findOne({ email: "employee@elogixa.com" });
    if (!employee) {
      const hashedPassword = await bcrypt.hash("123456", 10);
      employee = await User.create({
        username: "employee",
        email: "employee@elogixa.com",
        password: hashedPassword,
        role: "EMPLOYEE"
      });
      results.push(`Employee created: employee@elogixa.com / 123456 (ID: ${employee.employee_id})`);
    } else {
      results.push(`Employee already exists: employee@elogixa.com (ID: ${employee.employee_id})`);
    }
    
    res.json({ message: "Seeding complete!", results });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
