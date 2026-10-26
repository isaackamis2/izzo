/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    required: true
  },
  venue: { type: String, required: true },
  organizerName: { type: String, required: true, default: 'IzzoEvents Host' },
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
  importedAt: { type: Date },
  isSponsored: { type: Boolean, default: false },
  sponsoredUntil: { type: Date },
  sponsorshipTier: { type: String, default: 'Standard' },
  isPrivate: { type: Boolean, default: false },
  // Direct Organizer Payout & MoMo Settings (Non-custodial / BNR compliant)
  organizerPaymentType: { 
    type: String, 
    enum: ['momo_code', 'momo_phone', 'external', 'free'], 
    default: 'momo_code' 
  },
  momoMerchantCode: { type: String, default: '' }, // e.g. '123456' (Code Umucuruzi)
  momoMerchantName: { type: String, default: '' }, // e.g. 'Kigali Jazz Lounge'
  momoPhoneNumber: { type: String, default: '' }, // e.g. '0788123456'
  platformFeePercent: { type: Number, default: 4 }, // 4% platform commission
  commissionOwed: { type: Number, default: 0 }, // Accumulated 4% commission owed by organizer
  commissionPaid: { type: Number, default: 0 } // Settled commission
}, {  
  timestamps: true,
  optimisticConcurrency: true
});

module.exports = mongoose.model('Event', eventSchema);
