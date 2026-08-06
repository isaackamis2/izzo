const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    required: true
  },
  venue: { type: String, required: true },
  date: { type: Date, required: true },
  endDate: { type: Date },
  isRecurringYearly: { type: Boolean, default: false },
  price: { type: Number, default: 0 }, // 0 for free
  maxCapacity: { type: Number, required: true },
  currentCapacity: { type: Number, required: true }, // Decreases as people register
  bannerImage: { type: String }, // Cloudinary URL
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isFeatured: { type: Boolean, default: false },
  isTicketed: { type: Boolean, default: false },
  ticketTiers: [{
    name: String,
    price: Number
  }],
  priceRange: { type: String }, // e.g., "5000 RWF - 15000 RWF"
  externalTicketLink: { type: String } // URL or instructions if not using MoMo
}, {  
  timestamps: true,
  optimisticConcurrency: true
});

module.exports = mongoose.model('Event', eventSchema);
