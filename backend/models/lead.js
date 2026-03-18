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
    industry: { type: String, trim: true },
    annualRevenue: { type: Number, min: 0, default: null },
    employeeCount: { type: Number, min: 0, default: null },
    source: { type: String, trim: true },
    rating: {
      type: String,
      enum: ["hot", "warm", "cold", ""],
      default: "",
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
      enum: ["new", "contacted", "qualified", "proposal", "converted", "lost"],
      default: "new",
    },
    notes: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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
  },

  { timestamps: true }
);

leadSchema.index({ name: 1, status: 1 });
leadSchema.index({ email: 1 }, { sparse: true });
leadSchema.index({ 'customFields': 1 }, { sparse: true });

module.exports = mongoose.model("Lead", leadSchema);

