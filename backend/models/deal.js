const mongoose = require("mongoose");

const dealSchema = new mongoose.Schema(
  {
    sourceLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    amount: { type: Number, default: 0 },
    contact: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    stage: {
      type: String,
      enum: [
        "qualification",
        "need_analysis",
        "value_proposition",
        "identify_decision_maker",
        "proposal_price_quote",
        "negotiate",
        "won",
        "lost",
      ],
      default: "qualification",
    },
  },
  {
    timestamps: true,
    collection: "deals",
  }
);

module.exports = mongoose.model("Deal", dealSchema);
