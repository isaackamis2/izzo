const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed
  role: { type: String, enum: ['User', 'Manager', 'Admin'], default: 'User' },
  isVerified: { type: Boolean, default: false }, // For Manager profiles
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
