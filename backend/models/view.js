const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  filters: {
    type: Object,
    default: {}
  },
  columns: {
    type: [String],
    default: ['name', 'email', 'phone', 'company', 'status', 'source']
  },
  sort: {
    type: Object,
    default: { createdAt: -1 }
  },
  module: {
    type: String,
    enum: ['lead', 'deal'],
    default: 'lead',
    index: true
  },
  visibility: {
    type: String,
    enum: ['private', 'shared'],
    default: 'private'
  }
}, { 
  timestamps: true 
});

// Compound indexes for performance
viewSchema.index({ userId: 1, visibility: 1, module: 1 });
viewSchema.index({ userId: 1, name: 1, module: 1 });

module.exports = mongoose.model('View', viewSchema);

