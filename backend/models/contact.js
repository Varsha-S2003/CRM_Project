const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    sourceLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },
    sourceDealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    source: { type: String, trim: true },
    convertedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "contacts",
  }
);

contactSchema.pre("validate", function normalizeContactEmail() {
  const email = String(this.email || "").trim().toLowerCase();
  this.email = email || undefined;
});

// Legacy contact sync should not block deal creation when emails repeat across deals.
contactSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model("Contact", contactSchema);
