const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    paymentSource: {
      type: String,
      enum: ["VENDOR_BILL", "CLIENT_INVOICE"],
      default: "VENDOR_BILL",
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: function requiredVendorId() {
        return this.paymentSource === "VENDOR_BILL";
      },
      index: true,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: function requiredBillId() {
        return this.paymentSource === "VENDOR_BILL";
      },
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: function requiredInvoiceId() {
        return this.paymentSource === "CLIENT_INVOICE";
      },
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: {
      type: String,
      enum: ["UPI", "Bank", "Cash"],
      required: true,
    },
    transactionId: { type: String, trim: true, default: "", index: true },
    paymentDate: { type: Date, required: true, default: Date.now, index: true },
  },
  {
    timestamps: true,
    collection: "payments",
  }
);

paymentSchema.index({ vendorId: 1, billId: 1, paymentDate: -1 });
paymentSchema.index({ invoiceId: 1, paymentDate: -1 });
paymentSchema.index(
  { invoiceId: 1, paymentSource: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentSource: "CLIENT_INVOICE",
      invoiceId: { $exists: true },
    },
  }
);
paymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Payment", paymentSchema);
