const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: [
      'General Inquiry',
      'Event Ticketing Support',
      'Organizer Partnership',
      'Advertising & Sponsorship',
      'Technical / Bug Report',
      'Other'
    ],
    default: 'General Inquiry'
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['New', 'Read', 'Replied', 'Archived'],
    default: 'New'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  replyHistory: [{
    repliedBy: { type: String, default: 'Admin' },
    replyText: { type: String, required: true },
    repliedAt: { type: Date, default: Date.now }
  }],
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
}, { timestamps: true });

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ email: 1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
