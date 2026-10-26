const mongoose = require('mongoose');

const visitorLogSchema = new mongoose.Schema({
  visitorId: {
    type: String,
    required: true,
    index: true
  },
  path: {
    type: String,
    default: '/'
  },
  pageTitle: {
    type: String,
    default: ''
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  platform: {
    type: String,
    enum: ['web', 'ios', 'android', 'other'],
    default: 'web',
    index: true
  },
  device: {
    type: String,
    enum: ['mobile', 'desktop', 'tablet', 'unknown'],
    default: 'unknown'
  },
  browser: {
    type: String,
    default: 'Other'
  },
  os: {
    type: String,
    default: 'Other'
  },
  ip: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    default: 'Rwanda'
  },
  city: {
    type: String,
    default: 'Kigali'
  },
  referrer: {
    type: String,
    default: 'Direct'
  },
  sessionDate: {
    type: String, // e.g. "2026-09-05"
    index: true
  }
}, { timestamps: true });

visitorLogSchema.index({ createdAt: -1 });
visitorLogSchema.index({ platform: 1, createdAt: -1 });
visitorLogSchema.index({ visitorId: 1, sessionDate: 1 });

module.exports = mongoose.model('VisitorLog', visitorLogSchema);
