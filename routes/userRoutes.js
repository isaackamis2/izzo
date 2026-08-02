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
    if (user && user.email === 'superadmin@eventflow.com') {
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

module.exports = router;
