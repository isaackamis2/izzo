const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { protect } = require('../middleware/authMiddleware');
const QRCode = require('qrcode');

// ─── Register for a Free Event ───────────────────────────────────────────────
router.post('/register-free', protect, async (req, res) => {
  try {
    const { eventId } = req.body;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.isTicketed) return res.status(400).json({ message: 'This event requires a paid ticket' });
    if (event.currentCapacity <= 0) return res.status(400).json({ message: 'Event is at full capacity' });

    // Check if already registered
    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) return res.status(400).json({ message: 'You are already registered for this event' });

    // Generate QR Code for check-in
    const ticketData = JSON.stringify({ userId: req.user._id, eventId: event._id, type: 'Free' });
    const qrCode = await QRCode.toDataURL(ticketData);

    const reg = await Registration.create({
      user: req.user._id,
      event: eventId,
      status: 'Registered',
      qrCode,
      amountPaid: 0,
      ticketTier: 'Free'
    });

    event.currentCapacity -= 1;
    await event.save();

    res.status(201).json({ message: 'Successfully registered', registration: reg });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Already registered' });
    res.status(500).json({ message: error.message });
  }
});

// ─── Purchase Ticket with MTN MoMo (MOCK) ────────────────────────────────────
router.post('/purchase-momo', protect, async (req, res) => {
  try {
    const { eventId, tierName, amount } = req.body;
    
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.isTicketed) return res.status(400).json({ message: 'This is a free event' });
    if (event.currentCapacity <= 0) return res.status(400).json({ message: 'Event is sold out' });

    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) return res.status(400).json({ message: 'You already have a ticket for this event' });

    // ─────────────────────────────────────────────────────────────────────────
    // MOCK MTN MoMo API INTEGRATION
    // Simulates external network delay and transaction processing
    // ─────────────────────────────────────────────────────────────────────────
    await new Promise(resolve => setTimeout(resolve, 2500)); 
    
    // Fake Transaction ID from MoMo
    const momoTransactionId = 'MOMO-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

    // Generate QR Code for the paid ticket
    const ticketData = JSON.stringify({ 
      userId: req.user._id, 
      eventId: event._id, 
      tier: tierName,
      txId: momoTransactionId
    });
    const qrCode = await QRCode.toDataURL(ticketData);

    const reg = await Registration.create({
      user: req.user._id,
      event: eventId,
      status: 'Registered',
      ticketTier: tierName,
      amountPaid: amount,
      transactionId: momoTransactionId,
      qrCode
    });

    event.currentCapacity -= 1;
    await event.save();

    res.status(201).json({ 
      message: 'Payment Successful', 
      registration: reg,
      transactionId: momoTransactionId
    });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Already registered' });
    res.status(500).json({ message: error.message });
  }
});

// ─── Get User Tickets ────────────────────────────────────────────────────────
router.get('/my-tickets', protect, async (req, res) => {
  try {
    const tickets = await Registration.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
