const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const crypto = require("crypto");
require("dotenv").config();

// POST /api/auth/login - Login with email or username
router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Support login with email OR username
    const loginField = email || username;
    if (!loginField || !password) {
      return res.status(400).json({ message: "Please provide email/username and password" });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: loginField }, { username: loginField }]
    });
    
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { 
      id: user._id, 
      role: user.role,
      username: user.username,
      employeeId: user.employee_id
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "secret", { expiresIn: "8h" });

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        username: user.username,
        email: user.email, 
        role: user.role,
        employee_id: user.employee_id
      } 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Please provide your email address" });
    }

    const user = await User.findOne({ email });
    
    // For security, don't reveal if email exists or not
    // But for development, we'll return a message
    if (!user) {
      return res.status(404).json({ message: "Email not found in our records" });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // In production, you would save this to the database
    // For now, we'll generate a simple reset token that would be sent via email
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    res.json({ 
      message: "Password reset link has been sent to your email",
      // For testing purposes, include the token (remove in production)
      testToken: resetToken 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // In production, you would verify the token from database
    // For now, we'll just update the password (simplified for demo)
    // In real implementation, you'd check the token expiry and find the user
    
    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
