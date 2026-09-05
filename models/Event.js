const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    required: true
  },
  venue: { type: String, required: true },
  organizerName: { type: String, required: true, default: 'Unknown Organizer' },
  date: { type: Date, required: true },
  endDate: { type: Date },
  recurringFrequency: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'], default: 'none' },
  price: { type: Number, default: 0 }, // 0 for free
  maxCapacity: { type: Number, default: 9999 },
  currentCapacity: { type: Number, default: 9999 }, // Decreases as people register
  bannerImage: { type: String }, // Cloudinary URL
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isFeatured: { type: Boolean, default: false },
  isTicketed: { type: Boolean, default: false },
  ticketTiers: [{
    name: String,
    price: Number
  }],
  priceRange: { type: String }, // e.g., "5000 RWF - 15000 RWF"
  externalTicketLink: { type: String }, // URL or instructions if not using MoMo
  status: { 
    type: String, 
    enum: ['Published', 'Pending_Moderation', 'Rejected'], 
    default: 'Published' 
  },
  sourcePlatform: { 
    type: String, 
    default: 'Manual' 
  }, // 'sinc.events', 'bkarena.rw', 'eventsbash.rw', 'Manual'
  sourceUrl: { type: String, default: '' },
  importedAt: { type: Date }
}, {  
  timestamps: true,
  optimisticConcurrency: true
});

module.exports = mongoose.model('Event', eventSchema);
