const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const bcrypt = require("bcryptjs");
const User = require("../models/user");

// utility endpoint for front-end validation: check if username/email already exists
router.get("/check-username", verifyToken, isAdmin, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "username query parameter required" });
    const exists = await User.findOne({ username: username.trim() });
    res.json({ available: !exists });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/check-email", verifyToken, isAdmin, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "email query parameter required" });
    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    res.json({ available: !exists });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/employees  -- only admin can add employee
// this actually creates a User with role "EMPLOYEE" or "MANAGER". password will be hashed.
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, username, email, phone, department, designation, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email and password are required" });
    }

    // Ensure email not already taken
    const emailExists = await User.findOne({ email });
    if (emailExists) return res.status(400).json({ message: "Email already in use" });

    // Ensure username not already taken
    const usernameExists = await User.findOne({ username });
    if (usernameExists) return res.status(400).json({ message: "Username already in use" });

    const hashed = await bcrypt.hash(password, 10);
    
    // Role defaults to EMPLOYEE if not specified
    const userRole = role && ["ADMIN", "MANAGER", "EMPLOYEE"].includes(role) ? role : "EMPLOYEE";

    // Generate employee_id (EMP-001, EMP-002, etc.)
    const lastEmployee = await User.findOne({ employee_id: { $regex: /^EMP-/ } })
      .sort({ employee_id: -1 });
    
    let newEmpNumber = 1;
    if (lastEmployee && lastEmployee.employee_id) {
      const lastNum = parseInt(lastEmployee.employee_id.replace('EMP-', ''));
      newEmpNumber = lastNum + 1;
    }
    const employee_id = `EMP-${String(newEmpNumber).padStart(3, '0')}`;

    const employee = await User.create({ 
      name: name || "",
      username, 
      email, 
      phone: phone || "",
      department: department || "",
      designation: designation || "",
      password: hashed, 
      role: userRole,
      employee_id: employee_id
    });

    // Return basic info including employee_id
    res.status(201).json({ 
      id: employee._id, 
      username: employee.username,
      email: employee.email, 
      name: employee.name,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      role: employee.role,
      employee_id: employee.employee_id
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/employees -- get all employees (admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const employees = await User.find({ role: { $ne: "ADMIN" } })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/employees/:id -- delete an employee (admin only)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const employee = await User.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
