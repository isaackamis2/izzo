const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// Middleware to check if requester is Admin
const requireAdmin = async (req, res, next) => {
  try {
    const { requesterId } = req.query; // Or req.body, but for GET query is better
    if (!requesterId) return res.status(401).json({ message: 'Unauthorized' });
    
    const user = await User.findById(requesterId);
    if (!user || user.role !== 'Admin') {
      return res.status(403).json({ message: 'Forbidden: Super Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET all users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update user role
router.put('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body; // 'User', 'Manager', 'Admin'
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');
    if (!updatedUser) return res.status(404).json({ message: 'User not found' });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE user
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Prevent deleting the very first admin as a safety measure
    const user = await User.findById(req.params.id);
    const superEmails = ['isaackamis@gmail.com', 'superadmin@eventflow.com', (process.env.ADMIN_EMAIL || '').toLowerCase().trim()];
    if (user && superEmails.includes(user.email.toLowerCase())) {
      return res.status(400).json({ message: 'Cannot delete the primary Super Admin' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle saved event
router.post('/save-event', protect, async (req, res) => {
  try {
    const { eventId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const index = user.savedEvents.indexOf(eventId);
    if (index === -1) {
      user.savedEvents.push(eventId);
    } else {
      user.savedEvents.splice(index, 1);
    }
    
    await user.save();
    res.json({ savedEvents: user.savedEvents });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get saved events
router.get('/saved-events', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('savedEvents');
    res.json(user.savedEvents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile (bio, avatar, socialLinks)
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, bio, avatar, socialLinks } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (socialLinks) user.socialLinks = socialLinks;

    await user.save();
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio,
      avatar: user.avatar,
      socialLinks: user.socialLinks
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET public organizer profile and their events
router.get('/organizer/:id', async (req, res) => {
  try {
    const organizer = await User.findById(req.params.id).select('name bio avatar socialLinks isVerified');
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });
    
    const events = await require('../models/Event').find({ manager: req.params.id })
      .sort({ date: 1 })
      .select('-__v'); // fetch all their events

    res.json({ organizer, events });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
