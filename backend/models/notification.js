const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  dealId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Deal", 
    required: true,
    index: true
  },
  message: { 
    type: String, 
    required: true 
  },
  fromStage: String,
  toStage: String,
  changedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  changedByName: String,  // Denormalized
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  isRead: { 
    type: Boolean, 
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: "notifications"
});

// Indexes for performance
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1, createdAt: -1 });
// notificationSchema.index({ dealId: 1 }); // Already has index: true

module.exports = mongoose.model("Notification", notificationSchema);

