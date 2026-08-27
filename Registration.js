const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  status: { type: String, enum: ['Registered', 'Cancelled'], default: 'Registered' },
  ticketTier: { type: String },
  amountPaid: { type: Number, default: 0 },
  qrCode: { type: String },
  transactionId: { type: String },
  checkedIn: { type: Boolean, default: false },
}, { timestamps: true });

// Prevent double registration
registrationSchema.index({ user: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('Registration', registrationSchema);
