const mongoose = require("mongoose");

const vendorActivitySchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["VENDOR_CREATED", "VENDOR_UPDATED", "BILL_CREATED", "BILL_UPDATED", "PAYMENT_ADDED"],
      required: true,
    },
    entityType: {
      type: String,
      enum: ["Vendor", "Bill", "Payment"],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    message: { type: String, required: true, trim: true },
    metadata: { type: Object, default: {} },
  },
  {
    timestamps: true,
    collection: "vendor_activities",
  }
);

vendorActivitySchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model("VendorActivity", vendorActivitySchema);
