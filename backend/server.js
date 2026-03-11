const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

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

const activityRoutes = require("./routes/activityRoutes");
app.use("/api/activities", activityRoutes);

// stats used by admin dashboard
const statsRoutes = require("./routes/statsRoutes");
app.use("/api/stats", statsRoutes);

// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Atlas Connected"))
.catch(err => console.log(err));

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
