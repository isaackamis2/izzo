const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  logoUrl: { type: String, default: '' },
  siteName: { type: String, default: 'IzzoEvents' },
  notificationEmail: { type: String, default: 'izzoeventsapp@gmail.com' },
  twitterApiKey: { type: String, default: '' },
  twitterApiSecret: { type: String, default: '' },
  twitterAccessToken: { type: String, default: '' },
  twitterAccessSecret: { type: String, default: '' },
  twitterAutoPostEnabled: { type: Boolean, default: false },
  instagramAccountId: { type: String, default: '' },
  instagramAccessToken: { type: String, default: '' },
  instagramAutoPostEnabled: { type: Boolean, default: false },

  // ─── IzzoPay In-House Gateway Settings ───────────────────
  paymentSimulationMode: { type: Boolean, default: false }, // true for demo/sandbox fallback
  momoEnabled: { type: Boolean, default: true },
  momoEnvironment: { type: String, enum: ['sandbox', 'mtnrwanda'], default: 'sandbox' },
  momoSubscriptionKey: { type: String, default: '' },
  momoApiUser: { type: String, default: '' },
  momoApiKey: { type: String, default: '' },
  
  airtelEnabled: { type: Boolean, default: true },
  airtelEnvironment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  airtelClientId: { type: String, default: '' },
  airtelClientSecret: { type: String, default: '' }
});

module.exports = mongoose.model('Settings', settingsSchema);
