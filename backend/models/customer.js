const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "customers",
  }
);

customerSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model("Customer", customerSchema);
