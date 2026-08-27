const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  logoUrl: { type: String, default: '' },
  siteName: { type: String, default: 'IzzoEvents' }
});

module.exports = mongoose.model('Settings', settingsSchema);
