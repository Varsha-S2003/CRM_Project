const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: {
      type: String,
      enum: ["UPI", "Bank", "Cash"],
      required: true,
    },
    paymentDate: { type: Date, required: true, default: Date.now, index: true },
  },
  {
    timestamps: true,
    collection: "payments",
  }
);

paymentSchema.index({ vendorId: 1, billId: 1, paymentDate: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
