const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    industry: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "accounts",
  }
);

accountSchema.pre("validate", function normalizeAccountFields() {
  this.name = String(this.name || "").trim();
  this.normalizedName = this.name.toLowerCase();
  this.email = String(this.email || "").trim().toLowerCase();
  this.industry = String(this.industry || "").trim();
  this.phone = String(this.phone || "").trim();
  this.status = String(this.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
});

module.exports = mongoose.model("Account", accountSchema);
