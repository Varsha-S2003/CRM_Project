const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String },
  email: { type: String },
  phone: { type: String },
  source: { type: String },
  status: {
    type: String,
    enum: ["new", "contacted", "qualified", "proposal", "converted", "lost"],
    default: "new",
  },
  notes: { type: String },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Lead", leadSchema);

