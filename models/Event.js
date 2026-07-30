const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: [
      'Business and Professional Events',
      'Cultural, Artistic, and Performing Events',
      'Social and Personal Celebrations',
      'Food and Drink Events',
      'Sports and Fitness Events',
      'Charity and Cause-Driven Events',
      'Educational and Informational Events',
      'Product and Marketing Events'
    ]
  },
  venue: { type: String, required: true },
  date: { type: Date, required: true },
  price: { type: Number, default: 0 }, // 0 for free
  maxCapacity: { type: Number, required: true },
  currentCapacity: { type: Number, required: true }, // Decreases as people register
  bannerImage: { type: String }, // Cloudinary URL
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isFeatured: { type: Boolean, default: false },
}, { 
  timestamps: true,
  optimisticConcurrency: true
});

module.exports = mongoose.model('Event', eventSchema);
