const mongoose = require("mongoose");

const dealViewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filters: {
      type: Object,
      default: {},
    },
    columns: {
      type: [String],
      default: ["name", "company", "amount", "contact", "stage", "closingDate"],
    },
    sort: {
      type: Object,
      default: { createdAt: -1 },
    },
    visibility: {
      type: String,
      enum: ["private", "shared"],
      default: "private",
    },
  },
  {
    timestamps: true,
    collection: "deal_views",
  }
);

dealViewSchema.index({ userId: 1, visibility: 1 });
dealViewSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model("DealView", dealViewSchema);
