const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "Elogixa CRM" },
    companyState: { type: String, default: "" },
    companyGstin: { type: String, default: "" },
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
    pipeline: {
      dealStages: {
        type: [String],
        default: [
          "Qualification",
          "Need Analysis",
          "Value Proposition",
          "Proposal",
          "Negotiation",
          "Closed Won",
          "Closed Lost"
        ]
      },
      defaultProbability: { type: Number, default: 10 },
      staleDealDays: { type: Number, default: 14 },
      requireLostReason: { type: Boolean, default: true }
    },
    leadManagement: {
      leadSources: {
        type: [String],
        default: ["Website", "Referral", "Email Campaign", "Social Media", "Cold Call"]
      },
      autoAssignLeads: { type: Boolean, default: true },
      followUpSlaHours: { type: Number, default: 24 },
      duplicateLeadRule: {
        type: String,
        enum: ["email", "phone", "email_or_phone"],
        default: "email_or_phone"
      }
    },
    invoiceDefaults: {
      currency: { type: String, default: "INR" },
      paymentTermsDays: { type: Number, default: 15 },
      gstPercent: { type: Number, default: 18 },
      invoicePrefix: { type: String, default: "INV" },
      notes: { type: String, default: "Thank you for your business." },
      terms: { type: String, default: "Payment is due by the invoice due date." }
    },
    notificationDefaults: {
      leadAssigned: { type: Boolean, default: true },
      dealWon: { type: Boolean, default: true },
      invoiceOverdue: { type: Boolean, default: true },
      lowInventory: { type: Boolean, default: true },
      dailyDigest: { type: Boolean, default: false }
    },
    userAccess: {
      defaultRole: {
        type: String,
        enum: ["EMPLOYEE", "MANAGER"],
        default: "EMPLOYEE"
      },
      allowManagersCreateUsers: { type: Boolean, default: false },
      requireManagerForEmployee: { type: Boolean, default: true }
    },
    customization: {
      customLeadFields: { type: [String], default: ["Budget", "Decision Maker"] },
      customCustomerFields: { type: [String], default: ["GSTIN", "Customer Type"] },
      defaultTheme: { type: String, default: "light" },
      defaultDensity: { type: String, default: "comfortable" }
    },
    integrations: {
      emailConnected: { type: Boolean, default: false },
      calendarConnected: { type: Boolean, default: false },
      googleCalendarUrl: { type: String, default: "" },
      microsoftCalendarUrl: { type: String, default: "" },
      webhookUrl: { type: String, default: "" },
      thirdPartyApps: { type: [String], default: ["Google Workspace", "Microsoft 365"] }
    },
    systemConfiguration: {
      workflowRules: {
        type: [String],
        default: ["Assign new leads", "Create follow-up task after lead contact"]
      },
      automationEnabled: { type: Boolean, default: true },
      autoBackupEnabled: { type: Boolean, default: true },
      dataRetentionDays: { type: Number, default: 365 },
      allowDataExport: { type: Boolean, default: true }
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
    frontendUrl: { type: String, default: "http://localhost:3000" },
    backendUrl: { type: String, default: "http://localhost:5000" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);
