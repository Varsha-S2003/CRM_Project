const mongoose = require("mongoose");

const EMPLOYEE_ID_PREFIX_BY_ROLE = {
  EMPLOYEE: "EMP",
  MANAGER: "MGR",
};

const userSettingsSchema = new mongoose.Schema(
  {
    preferences: {
      theme: { type: String, default: "light" },
      density: { type: String, default: "comfortable" },
      language: { type: String, default: "English" },
      timezone: { type: String, default: "Asia/Kolkata" },
      emailNotifications: { type: Boolean, default: true },
      desktopNotifications: { type: Boolean, default: false },
      smsNotifications: { type: Boolean, default: false },
      appNotifications: { type: Boolean, default: true },
      profileVisibleToTeam: { type: Boolean, default: true },
      activityVisibleToManagers: { type: Boolean, default: true },
      shareEmailWithTeam: { type: Boolean, default: false }
    },
    managerSettings: {
      leadVisibility: { type: String, default: "team" },
      dealApprovalLimit: { type: Number, default: 50000 },
      weeklyDigest: { type: Boolean, default: true },
      performanceNotifications: { type: Boolean, default: true }
    },
    employeeSettings: {
      dashboardLayout: { type: String, default: "focus" },
      leadReminders: { type: Boolean, default: true },
      taskNotifications: { type: Boolean, default: true },
      dailySummary: { type: Boolean, default: false }
    },
    adminSettings: {
      onboardingEmails: { type: Boolean, default: true },
      auditAlerts: { type: Boolean, default: true },
      approvalMode: { type: String, default: "balanced" }
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: false
  },
  department: {
    type: String,
    required: false
  },
  designation: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ["ADMIN", "MANAGER", "EMPLOYEE"],
    default: "EMPLOYEE"
  },
  employee_id: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  reportsTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null  // Top-level managers report to null
  },
  settings: {
    type: userSettingsSchema,
    default: () => ({})
  }
}, { timestamps: true });

// Auto-generate employee_id for employee/manager users when caller did not provide one.
// when using an async pre hook, Mongoose does not provide a callback, so
// don't declare or call `next`. just await the work and return.
userSchema.pre('save', async function() {
  if (this.isNew && !this.employee_id) {
    const prefix = EMPLOYEE_ID_PREFIX_BY_ROLE[String(this.role || "").toUpperCase()];
    if (prefix) {
      const lastCreatedUserForPrefix = await this.constructor.findOne({
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

      this.employee_id = `${prefix}${String(nextNumber).padStart(3, "0")}`;
    }
  }
  // Ensure reportsTo doesn't create self-reference or admin hierarchy
  if (this.reportsTo && String(this.reportsTo) === String(this._id)) {
    this.reportsTo = null;
  }
  if (this.role === 'ADMIN') {
    this.reportsTo = null;
  }
});

module.exports = mongoose.model("User", userSchema);

