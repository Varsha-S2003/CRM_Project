const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "Elogixa CRM" },
    supportEmail: { type: String, default: "support@elogixa.com" },
    branding: {
      primaryColor: { type: String, default: "#4f46e5" },
      accentColor: { type: String, default: "#22c55e" },
      compactSidebar: { type: Boolean, default: false }
    },
    security: {
      mfaRequired: { type: Boolean, default: false },
      sessionTimeoutMinutes: { type: Number, default: 480 },
      passwordRotationDays: { type: Number, default: 90 },
      ipWhitelist: [{ type: String }]
    },
    automation: {
      leadAutoAssign: { type: Boolean, default: true },
      dealApprovalRequired: { type: Boolean, default: true },
      inventoryAlerts: { type: Boolean, default: true }
    },
    // email settings stored in the database so we don't have to touch .env
    email: {
      service: { type: String, default: "" },
      host: { type: String, default: "" },
      port: { type: Number, default: 587 },
      secure: { type: Boolean, default: false },
      auth: {
        user: { type: String, default: "" },
        pass: { type: String, default: "" }
      }
    },
    // base URL of the front‑end application (used when generating reset links)
    frontendUrl: { type: String, default: "http://localhost:3000" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);
