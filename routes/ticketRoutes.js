const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { protect } = require('../middleware/authMiddleware');
const QRCode = require('qrcode');
const axios = require('axios');
const { sendTicketEmail, notifyNewRegistration } = require('../utils/mailer');

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

    // Fire & Forget email confirmations and admin alerts
    sendTicketEmail(req.user, event, reg).catch(console.error);
    notifyNewRegistration(req.user, event, reg).catch(console.error);

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

    // Fire email confirmations and admin alerts
    sendTicketEmail(req.user, event, reg).catch(console.error);
    notifyNewRegistration(req.user, event, reg).catch(console.error);

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

// ─── Initiate PayPack Payment ──────────────────────────────────────────────────
router.post('/paypack/initiate', protect, async (req, res) => {
  try {
    const { eventId, tierName, phoneNumber } = req.body;
    
    if (!phoneNumber || phoneNumber.length < 10) {
      return res.status(400).json({ message: 'Invalid phone number format. Use 078XXXXXXX' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.isTicketed) return res.status(400).json({ message: 'This is a free event' });
    if (event.currentCapacity <= 0) return res.status(400).json({ message: 'Event is sold out' });

    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) return res.status(400).json({ message: 'You already have a ticket for this event' });

    // Find the correct price for the tier
    let amount = event.price;
    if (event.ticketTiers && event.ticketTiers.length > 0) {
      const tier = event.ticketTiers.find(t => t.name === tierName);
      if (tier) amount = tier.price;
    }

    // Authenticate with PayPack
    let access_token;
    try {
      const authRes = await axios.post('https://payments.paypack.rw/api/auth/agents/authorize', {
        client_id: process.env.PAYPACK_CLIENT_ID || 'test_client_id',
        client_secret: process.env.PAYPACK_CLIENT_SECRET || 'test_client_secret'
      });
      access_token = authRes.data.access;
    } catch (err) {
      console.error('PayPack Auth Error:', err.response?.data || err.message);
      return res.status(500).json({ message: 'Payment gateway authentication failed' });
    }

    // Initiate Cashin
    const cashinRes = await axios.post('https://payments.paypack.rw/api/transactions/cashin', {
      amount: amount,
      number: phoneNumber,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
    }, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    res.status(200).json({
      message: 'Payment prompt sent to phone',
      ref: cashinRes.data.ref,
      status: cashinRes.data.status
    });

  } catch (error) {
    console.error('PayPack Initiate Error:', error.response?.data || error.message);
    res.status(500).json({ message: error.response?.data?.message || 'Failed to initiate payment' });
  }
});

// ─── Verify PayPack Payment ────────────────────────────────────────────────────
router.post('/paypack/verify', protect, async (req, res) => {
  try {
    const { ref, eventId, tierName } = req.body;
    
    // Authenticate with PayPack
    const authRes = await axios.post('https://payments.paypack.rw/api/auth/agents/authorize', {
      client_id: process.env.PAYPACK_CLIENT_ID || 'test_client_id',
      client_secret: process.env.PAYPACK_CLIENT_SECRET || 'test_client_secret'
    });
    const access_token = authRes.data.access;

    // Check transaction status
    const statusRes = await axios.get(`https://payments.paypack.rw/api/transactions/find/${ref}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const txStatus = statusRes.data.status; // typically 'pending', 'successful', or 'failed'
    
    if (txStatus === 'pending') {
      return res.status(202).json({ message: 'Payment still pending', status: 'pending' });
    }
    
    if (txStatus === 'failed') {
      return res.status(400).json({ message: 'Payment failed or was cancelled by user', status: 'failed' });
    }

    if (txStatus !== 'successful') {
      return res.status(400).json({ message: `Unknown payment status: ${txStatus}`, status: txStatus });
    }

    const amountPaid = statusRes.data.amount;

    // Payment is successful, generate ticket
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) return res.status(200).json({ message: 'Ticket already generated', registration: existing });

    const ticketData = JSON.stringify({ 
      userId: req.user._id, 
      eventId: event._id, 
      tier: tierName,
      txId: ref
    });
    const qrCode = await QRCode.toDataURL(ticketData);

    const reg = await Registration.create({
      user: req.user._id,
      event: eventId,
      status: 'Registered',
      ticketTier: tierName,
      amountPaid: amountPaid,
      transactionId: ref,
      qrCode
    });

    event.currentCapacity -= 1;
    await event.save();

    sendTicketEmail(req.user, event, reg).catch(console.error);
    notifyNewRegistration(req.user, event, reg).catch(console.error);

    res.status(201).json({ 
      message: 'Payment successful! Ticket generated.', 
      status: 'successful',
      registration: reg 
    });
  } catch (error) {
    console.error('PayPack Verify Error:', error.response?.data || error.message);
    res.status(500).json({ message: error.response?.data?.message || 'Failed to verify payment' });
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

// ─── Scan & Check-in Ticket ────────────────────────────────────────────────────
router.post('/check-in', protect, async (req, res) => {
  try {
    // Only Admin or Manager can check-in
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized to check-in tickets' });
    }

    const { userId, eventId } = req.body;
    
    // Find Registration
    const registration = await Registration.findOne({ user: userId, event: eventId }).populate('user', 'name email').populate('event', 'title manager');
    
    if (!registration) {
      return res.status(404).json({ message: 'Ticket not found or invalid QR code.' });
    }

    // Check if the manager owns the event (unless Admin)
    if (req.user.role !== 'Admin' && registration.event.manager.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not the manager of this event.' });
    }

    // Check if already checked in
    if (registration.checkedIn) {
      return res.status(400).json({ message: 'Ticket has ALREADY been used!', registration });
    }

    // Mark as checked in
    registration.checkedIn = true;
    await registration.save();

    res.json({ message: 'Ticket successfully verified and checked in!', registration });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
