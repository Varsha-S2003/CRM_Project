const mongoose = require("mongoose");

const invoicePaymentTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, trim: true, unique: true, index: true },
    transactionId: { type: String, required: true, trim: true, unique: true, index: true },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: ["unpaid", "paid", "expired"],
      default: "unpaid",
      index: true,
    },
    paidAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  {
    timestamps: true,
    collection: "invoice_payment_tokens",
  }
);

invoicePaymentTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("InvoicePaymentToken", invoicePaymentTokenSchema);
