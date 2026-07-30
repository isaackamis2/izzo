const express = require('express');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const router = express.Router();

// Register for event
router.post('/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body; // Normally from auth token

    const existing = await Registration.findOne({ user: userId, event: eventId });
    if (existing) return res.status(400).json({ message: 'Already registered' });

    // Decrement capacity
    const event = await Event.findOneAndUpdate(
      { _id: eventId, currentCapacity: { $gt: 0 } },
      { $inc: { currentCapacity: -1 } },
      { new: true }
    );

    if (!event) return res.status(400).json({ message: 'Event is sold out!' });

    const registration = new Registration({ user: userId, event: eventId });
    await registration.save();

    res.status(201).json({ message: 'Successfully registered', registration });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
