const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const { notifyNewUserSignup, sendPasswordResetEmail } = require('../utils/mailer');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email: cleanEmail, password: hashedPassword, role });
    await newUser.save();

    // Fire email notification to admin
    notifyNewUserSignup(newUser).catch(console.error);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Forgot Password ─────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Please provide an email address' });

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Don't leak if account exists or not, but return success message
      return res.status(200).json({ message: 'If an account exists with this email, a reset code has been sent.' });
    }

    // Generate a 6-digit numeric reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour validity
    await user.save();

    const frontendBase = process.env.FRONTEND_URL || 'https://izzoevents.com';
    const resetUrl = `${frontendBase}/reset-password?email=${encodeURIComponent(cleanEmail)}&code=${resetCode}`;

    // Send email with reset code & link
    sendPasswordResetEmail(user, resetCode, resetUrl).catch(console.error);

    res.json({ message: 'If an account exists with this email, a reset code has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error requesting password reset' });
  }
});

// ─── Reset Password ──────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Please provide your email, reset code, and new password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      email: cleanEmail,
      resetPasswordToken: code.trim(),
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Your password has been successfully reset! You can now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error resetting password' });
  }
});

// ─── Google OAuth Sign-in & Sign-up ──────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Google credential token is required' });
    }

    // Verify token with Google's tokeninfo API
    let payload;
    try {
      const googleRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
        timeout: 10000
      });
      payload = googleRes.data;
    } catch (gErr) {
      console.error('[Google Auth] Token verification failed:', gErr.response?.data || gErr.message);
      return res.status(401).json({ message: 'Google authentication failed or expired token. Please try again.' });
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google account data received' });
    }

    const cleanEmail = payload.email.trim().toLowerCase();
    const name = payload.name || payload.given_name || cleanEmail.split('@')[0];
    const picture = payload.picture || '';
    const googleId = payload.sub;

    let user = await User.findOne({ email: cleanEmail });
    const isAdminEmail = cleanEmail === (process.env.ADMIN_EMAIL || 'isaackamis@gmail.com').toLowerCase().trim() || cleanEmail === 'superadmin@eventflow.com';

    if (user) {
      // Existing user: Link Google ID and update avatar if empty
      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
        updated = true;
      }
      if (isAdminEmail && user.role !== 'Admin') {
        user.role = 'Admin';
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    } else {
      // New user registering via Google
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        name,
        email: cleanEmail,
        password: hashedPassword,
        role: isAdminEmail ? 'Admin' : 'User',
        avatar: picture,
        googleId,
        authProvider: 'google',
        isVerified: true
      });
      await user.save();

      // Trigger admin notification email
      notifyNewUserSignup(user).catch(console.error);
    }

    // Generate 30-day session token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || picture
      }
    });
  } catch (error) {
    console.error('[Google Auth] Server error:', error);
    res.status(500).json({ message: 'Internal server error during Google authentication' });
  }
});

module.exports = router;
