const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const { permit } = require("../middleware/authorize");
const bcrypt = require("bcryptjs");
const User = require("../models/user");

const USERNAME_REGEX = /^(?!\.)(?!.*\.$)[a-z]+(?:\.[a-z]+)*(?:\d+)?$/;
const USERNAME_PREFIX_BY_ROLE = {
  EMPLOYEE: "emp.",
  MANAGER: "mgr.",
  ADMIN: "adm.",
};
const EMPLOYEE_ID_PREFIX_BY_ROLE = {
  EMPLOYEE: "EMP",
  MANAGER: "MGR",
  ADMIN: "ADM",
};

const getUniqueUsername = async (baseUsername) => {
  let candidate = baseUsername;
  let counter = 2;

  while (await User.findOne({ username: candidate })) {
    candidate = `${baseUsername}${counter}`;
    counter += 1;
  }

  return candidate;
};

const getNextEmployeeId = async (role) => {
  const prefix = EMPLOYEE_ID_PREFIX_BY_ROLE[String(role || "").toUpperCase()];
  if (!prefix) return null;

  const lastCreatedUserForPrefix = await User.findOne({
    employee_id: { $regex: `^${prefix}\\d+$` },
  })
    .sort({ createdAt: -1 })
    .select("employee_id");

  let nextNumber = 1;
  if (lastCreatedUserForPrefix && lastCreatedUserForPrefix.employee_id) {
    const numericPart = lastCreatedUserForPrefix.employee_id.replace(prefix, "");
    const parsedNumber = parseInt(numericPart, 10);
    if (!Number.isNaN(parsedNumber)) {
      nextNumber = parsedNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
};

// utility endpoint for front-end validation: check if username/email already exists
router.get("/check-username", verifyToken, isAdmin, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "username query parameter required" });

    const normalizedUsername = String(username).trim().toLowerCase();
    const exists = await User.findOne({ username: normalizedUsername });
    if (!exists) {
      return res.json({ available: true });
    }

    const suggestedUsername = await getUniqueUsername(normalizedUsername);
    res.json({ available: false, suggestedUsername });
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
    const { name, username, email, phone, department, designation, password, role, reportsTo, managerId } = req.body;

    const normalizedRole = String(role || "").trim().toUpperCase();
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const normalizedDepartment = String(department || "").trim();

    if (!normalizedName || !normalizedUsername || !normalizedEmail || !password || !normalizedRole || !normalizedDepartment) {
      return res.status(400).json({ message: "Full name, username, email, department, role and password are required" });
    }

    if (!["ADMIN", "MANAGER", "EMPLOYEE"].includes(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    if (normalizedUsername.length < 5 || normalizedUsername.length > 20) {
      return res.status(400).json({ message: "Username must be 5 to 20 characters long" });
    }

    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return res.status(400).json({ message: "Username must contain lowercase letters and dots only, with optional number suffix" });
    }

    const expectedPrefix = USERNAME_PREFIX_BY_ROLE[normalizedRole];
    if (expectedPrefix && !normalizedUsername.startsWith(expectedPrefix)) {
      return res.status(400).json({ message: `Username must start with '${expectedPrefix}' for role ${normalizedRole}` });
    }

    // Ensure email not already taken
    const emailExists = await User.findOne({ email: normalizedEmail });
    if (emailExists) return res.status(400).json({ message: "Email already in use" });

    // Auto-adjust duplicate username by appending number suffix: emp.veda -> emp.veda2
    const uniqueUsername = await getUniqueUsername(normalizedUsername);

    const hashed = await bcrypt.hash(password, 10);

    const userRole = normalizedRole;
    const requestedManagerId = String(reportsTo || managerId || "").trim();
    let resolvedReportsTo = null;

    if (requestedManagerId) {
      const managerUser = await User.findOne({
        _id: requestedManagerId,
        role: { $regex: "^MANAGER$", $options: "i" },
      }).select("_id");

      if (!managerUser) {
        return res.status(400).json({ message: "Selected manager is invalid." });
      }
      resolvedReportsTo = managerUser._id;
    }

    if (userRole === "EMPLOYEE" && !resolvedReportsTo) {
      return res.status(400).json({ message: "Manager assignment is required for employee role." });
    }

    if (userRole !== "EMPLOYEE") {
      resolvedReportsTo = null;
    }

    const employee_id = await getNextEmployeeId(userRole);

    const employee = await User.create({ 
      name: normalizedName,
      username: uniqueUsername,
      email: normalizedEmail,
      phone: String(phone || "").trim(),
      department: normalizedDepartment,
      designation: String(designation || "").trim(),
      password: hashed, 
      role: userRole,
      employee_id: employee_id,
      reportsTo: resolvedReportsTo,
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
      employee_id: employee.employee_id,
      reportsTo: employee.reportsTo || null,
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

// PUT /api/employees/:id -- update an employee (admin only)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, department, designation, role, reportsTo, managerId } = req.body;

    const normalizedRole = String(role || "").trim().toUpperCase();
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedDepartment = String(department || "").trim();

    if (!normalizedName || !normalizedEmail || !normalizedDepartment || !normalizedRole) {
      return res.status(400).json({ message: "Full name, email, department and role are required" });
    }

    if (!["MANAGER", "EMPLOYEE"].includes(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    const employee = await User.findById(id);
    if (!employee || String(employee.role || "").toUpperCase() === "ADMIN") {
      return res.status(404).json({ message: "Employee not found" });
    }

    const emailExists = await User.findOne({ email: normalizedEmail, _id: { $ne: id } }).select("_id");
    if (emailExists) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const requestedManagerId = String(reportsTo || managerId || "").trim();
    let resolvedReportsTo = null;

    if (normalizedRole === "EMPLOYEE") {
      if (!requestedManagerId) {
        return res.status(400).json({ message: "Manager assignment is required for employee role." });
      }

      if (requestedManagerId === String(id)) {
        return res.status(400).json({ message: "Employee cannot report to themselves." });
      }

      const managerUser = await User.findOne({
        _id: requestedManagerId,
        role: { $regex: "^MANAGER$", $options: "i" },
      }).select("_id");

      if (!managerUser) {
        return res.status(400).json({ message: "Selected manager is invalid." });
      }

      resolvedReportsTo = managerUser._id;
    }

    employee.name = normalizedName;
    employee.email = normalizedEmail;
    employee.phone = String(phone || "").trim();
    employee.department = normalizedDepartment;
    employee.designation = String(designation || "").trim();
    employee.role = normalizedRole;
    employee.reportsTo = resolvedReportsTo;

    await employee.save();

    res.json({
      id: employee._id,
      username: employee.username,
      email: employee.email,
      name: employee.name,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      role: employee.role,
      employee_id: employee.employee_id,
      reportsTo: employee.reportsTo || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/employees/assignable -- users a role can assign leads to
router.get("/assignable", verifyToken, permit("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const requesterRole = String(req.user.role || "").toUpperCase();
    const roleFilter = requesterRole === "ADMIN"
      ? { role: { $regex: "^MANAGER$", $options: "i" } }
      : { role: { $regex: "^EMPLOYEE$", $options: "i" } };

    const users = await User.find(roleFilter)
      .select("name username email role employee_id reportsTo")
      .sort({ createdAt: -1 });

    const cleanedUsers = users
      .filter((user) => Boolean(user._id) && Boolean(user.username || user.name || user.email))
      .map((user) => ({
        _id: user._id,
        name: user.name || "",
        username: user.username || "",
        email: user.email || "",
        role: String(user.role || "").toUpperCase(),
        employee_id: user.employee_id || "",
        reportsTo: user.reportsTo || null,
      }));

    res.json(cleanedUsers);
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
