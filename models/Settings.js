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
  instagramAutoPostEnabled: { type: Boolean, default: false }
});

module.exports = mongoose.model('Settings', settingsSchema);
