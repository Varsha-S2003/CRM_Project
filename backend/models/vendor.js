const mongoose = require("mongoose");

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;

const vendorSchema = new mongoose.Schema(
  {
    vendorName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true, default: "" },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"],
    },
    phone: { type: String, trim: true, default: "" },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      validate: {
        validator: (value) => !value || GST_REGEX.test(value),
        message: "Invalid GST format",
      },
    },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    productsProvided: { type: [{ type: String, trim: true }], default: [] },
    servicesProvided: { type: [{ type: String, trim: true }], default: [] },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "vendors",
  }
);

vendorSchema.index({ vendorName: 1 });
vendorSchema.index({ companyName: 1 });
vendorSchema.index({ email: 1 }, { unique: true, sparse: true });
vendorSchema.index({ gstNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Vendor", vendorSchema);
