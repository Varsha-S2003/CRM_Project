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
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    value: { type: Number, default: null },
    amount: { type: Number, default: 0 },
    contact: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
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
