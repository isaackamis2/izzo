const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed
  role: { type: String, enum: ['User', 'Manager', 'Admin'], default: 'User' },
  isVerified: { type: Boolean, default: false }, // For Manager profiles
  savedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  googleId: { type: String, sparse: true },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  socialLinks: {
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    website: { type: String, default: '' }
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
