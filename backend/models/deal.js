const mongoose = require("mongoose");

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
        "Proposal",
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

module.exports = mongoose.model("Deal", dealSchema);
