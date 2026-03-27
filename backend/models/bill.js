const mongoose = require("mongoose");

const billLineItemSchema = new mongoose.Schema(
  {
    product: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const billSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    billNumber: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    lineItems: [billLineItemSchema],
    inventorySynced: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["Paid", "Unpaid", "Overdue"],
      default: "Unpaid",
      index: true,
    },
    dueDate: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    collection: "bills",
  }
);

billSchema.index({ vendorId: 1, billNumber: 1 }, { unique: true });

module.exports = mongoose.model("Bill", billSchema);
