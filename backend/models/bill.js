const mongoose = require("mongoose");

const billLineItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: false },
    type: { type: String, enum: ["product", "service"], default: "product" },
    product: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
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
      enum: ["Paid", "Partial", "Unpaid", "Overdue"],
      default: "Unpaid",
      index: true,
    },
    purchaseDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    collection: "bills",
  }
);

billSchema.index({ vendorId: 1, billNumber: 1 }, { unique: true });

module.exports = mongoose.model("Bill", billSchema);
