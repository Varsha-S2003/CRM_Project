const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    state: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, default: "" },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      default: null,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
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
  },
  {
    timestamps: true,
    collection: "customers",
  }
);

customerSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model("Customer", customerSchema);
