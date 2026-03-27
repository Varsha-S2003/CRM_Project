const mongoose = require("mongoose");

const normalizeStageKey = (stage) => {
  const value = String(stage || "").trim().toLowerCase().replace(/\s+/g, "_");
  const map = {
    closed_won: "won",
    closed_lost: "lost",
    proposal: "proposal_price_quote",
    negotiation: "negotiate",
    proposal_price_quote: "proposal_price_quote",
  };
  return map[value] || value;
};

const deriveStatusFromStage = (stage) =>
  normalizeStageKey(stage) === "lost" ? "Inactive" : "Active";

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
};

const dealSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    sourceLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },
    salutation: { type: String, trim: true, default: "" },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    value: { type: Number, default: null },
    amount: { type: Number, default: 0 },
    contact: { type: String, trim: true },
    email: { type: String, trim: true },
    secondaryEmail: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true },
    mobile: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    industry: { type: String, trim: true, default: "" },
    employeeCount: { type: Number, min: 0, default: null },
    address: {
      street: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      postalCode: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "" },
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: null,
    },
    billingCycle: {
      type: String,
      enum: ["", "monthly", "6_months", "yearly"],
      default: "",
      trim: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    nextBillingDate: {
      type: Date,
      default: null,
    },
    closingDate: {
      type: Date,
      default: null,
      index: true,
    },
    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    expectedRevenue: {
      type: Number,
      min: 0,
      default: null,
    },
    nextStep: {
      type: String,
      trim: true,
      default: "",
    },
    dealType: {
      type: String,
      enum: ["", "New Business", "Existing Business", "Renewal", "Upsell", "Other"],
      default: "",
      trim: true,
    },
    leadSource: {
      type: String,
      trim: true,
      default: "",
    },
    campaignSource: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    waitingForRestock: {
      type: Boolean,
      default: false,
      index: true,
    },
    stage: {
      type: String,
      enum: [
        "Qualification",
        "Need Analysis",
        "Value Proposition",
        "Proposal",
        "Negotiation",
        "Closed Won",
        "Closed Lost",
        "qualification",
        "need_analysis",
        "value_proposition",
        "proposal_price_quote",
        "negotiate",
        "won",
        "lost",
      ],
      default: "Qualification",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    assignedTo: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    timeline: [{
      fromStage: String,
      toStage: String,
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      changedAt: { type: Date, default: Date.now },
      userName: String  // Denormalized for fast UI
    }],
  },
  {
    timestamps: true,
    collection: "deals",
  }
);

// dealSchema.index({ assignedTo: 1 }); // Already has index: true
dealSchema.index({ stage: 1 });
dealSchema.index({ "timeline.changedAt": -1 });

dealSchema.pre("validate", function enforceStatusReason() {
  const normalizedStage = normalizeStageKey(this.stage);
  this.status = deriveStatusFromStage(normalizedStage);

  const parsedProbability = parseOptionalNumber(this.probability);
  if (Number.isNaN(parsedProbability)) {
    this.invalidate("probability", "Probability must be a valid number");
  } else if (parsedProbability !== null) {
    this.probability = parsedProbability;
  } else {
    this.probability = null;
  }

  const parsedExpectedRevenue = parseOptionalNumber(this.expectedRevenue);
  if (Number.isNaN(parsedExpectedRevenue)) {
    this.invalidate("expectedRevenue", "Expected Revenue must be a valid number");
  }

  if (this.probability !== null) {
    const amount = Number(this.amount) || 0;
    this.expectedRevenue = Number(((amount * this.probability) / 100).toFixed(2));
  } else {
    this.expectedRevenue = parsedExpectedRevenue;
  }

  if (this.status === "Inactive") {
    const reason = String(this.reason || "").trim();
    if (!reason) {
      this.invalidate("reason", "Reason is required when stage is Closed Lost");
    } else {
      this.reason = reason;
    }
  } else {
    this.reason = "";
  }
});

module.exports = mongoose.model("Deal", dealSchema);
