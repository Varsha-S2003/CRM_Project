const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Add post-save hook to handle inventory updates
inventorySchema.post("save", async function (doc) {
  if (doc.quantity > 0) {
    const updateOrders = require("../utils/vendorInventorySync").updateOrdersForRestock;
    await updateOrders(doc.product);
  }
});

module.exports = mongoose.model("Inventory", inventorySchema);

