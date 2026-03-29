const mongoose = require("mongoose");

const buildLeadName = (lead) => {
  const parts = [lead.firstName, lead.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.join(" ").trim() || String(lead.name || "").trim();
};

const leadSchema = new mongoose.Schema(
  {
    salutation: { type: String, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    name: { type: String, trim: true },
    title: { type: String, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true },
    secondaryEmail: { type: String, trim: true },
    phone: { type: String, trim: true },
    mobile: { type: String, trim: true },
    website: { type: String, trim: true },
    itemType: {
      type: String,
      enum: ["product", "service", ""],
      default: "",
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      default: null,
    },
    industry: { type: String, trim: true },
    annualRevenue: { type: Number, min: 0, default: null },
    employeeCount: { type: Number, min: 0, default: null },
    source: { type: String, trim: true },
    score: { type: Number, default: 0 },
    emailOpened: { type: Number, default: 0 },
    websiteVisits: { type: Number, default: 0 },
    formSubmissions: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: null },
    lastActivityDate: { type: Date, default: null },
    rating: {
      type: String,
      enum: ["hot", "warm", "cold", ""],
      default: "cold",
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"],
      default: "new",
    },
    notes: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedByRole: {
      type: String,
      enum: ["ADMIN", "MANAGER", "EMPLOYEE"],
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    isConverted: { type: Boolean, default: false },
    convertedCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    convertedContactId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Contact",
      default: null 
    },
    convertedDealId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Deal",
      default: null 
    },
    transitionHistory: [
      {
        fromStatus: {
          type: String,
          enum: ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"],
        },
        toStatus: {
          type: String,
          enum: ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"],
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        performedAt: {
          type: Date,
          default: Date.now,
        },
        reason: { type: String, trim: true },
        approvalRequired: { type: Boolean, default: false },
        approvalState: {
          type: String,
          enum: ["none", "requested", "approved", "rejected"],
          default: "none",
        },
      },
    ],
    pendingTransitionApproval: {
      fromStatus: {
        type: String,
        enum: ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"],
      },
      toStatus: {
        type: String,
        enum: ["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"],
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      reason: { type: String, trim: true },
      requiredRole: {
        type: String,
        enum: ["MANAGER", "ADMIN"],
        default: "MANAGER",
      },
    },
    stageTimestamps: {
      contactedAt: { type: Date, default: null },
      qualifiedAt: { type: Date, default: null },
      proposalAt: { type: Date, default: null },
      proposalSentAt: { type: Date, default: null },
      convertedAt: { type: Date, default: null },
      lostAt: { type: Date, default: null },
    },
    latestProposal: {
      subject: { type: String, trim: true, default: "" },
      amount: { type: Number, min: 0, default: null },
      currency: { type: String, trim: true, default: "INR" },
      validUntil: { type: Date, default: null },
      message: { type: String, trim: true, default: "" },
      terms: { type: String, trim: true, default: "" },
      sentTo: { type: String, trim: true, default: "" },
      sentAt: { type: Date, default: null },
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      createdAt: { type: Date, default: null },
    },
  },

  { timestamps: true }
);

leadSchema.index({ name: 1, status: 1 });
leadSchema.index({ email: 1 }, { sparse: true });
leadSchema.index({ 'customFields': 1 }, { sparse: true });
leadSchema.index({ assignedTo: 1, assignedByRole: 1, status: 1 });

module.exports = mongoose.model("Lead", leadSchema);

