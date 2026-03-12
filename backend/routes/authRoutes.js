const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/mailer");
const AppSettings = require("../models/appSettings");

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

// POST /api/auth/login - Login with email or username
router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    const loginField = email || username;
    if (!loginField || !password) {
      return res.status(400).json({ message: "Please provide email/username and password" });
    }

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
    const email = req.body.email?.trim().toLowerCase();
    
    if (!email) {
      return res.status(400).json({ message: "Please provide your email address" });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists - show success anyway
      return res.json({
        message: "If an account exists with this email, a reset link has been sent."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedResetToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // fetch frontend base url from settings (allows changing without editing .env)
    const settings = await AppSettings.findOne();
    const frontendBaseUrl =
      settings?.frontendUrl || process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendBaseUrl.replace(/\/$/, "")}/reset-password?token=${resetToken}`;

    // Send password reset email
    try {
      const { preview } = await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        name: user.name || user.username
      });
      
      const response = { message: "Password reset link has been sent to your email address." };
      // in development show preview URL so tester can click directly
      if (preview && !isProductionEnv()) {
        response.previewUrl = preview;
      }
      res.json(response);
    } catch (emailError) {
      console.error("Email error:", emailError.message);
      
      // Clear the reset token if email fails
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      
      // include the internal message in development for easier debugging
      const generic = "Failed to send reset email. Please check email configuration.";
      res.status(500).json({ 
        message: !isProductionEnv() ? `${generic} (${emailError.message})` : generic 
      });
    }
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

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "This reset link is invalid or has expired" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    
    res.json({ message: "Password changed successfully. Please login with your new password." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
