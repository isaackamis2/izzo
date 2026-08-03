const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { protect } = require('../middleware/authMiddleware');
const QRCode = require('qrcode');
const axios = require('axios');
const nodemailer = require('nodemailer');

async function sendTicketEmail(user, event, registration) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { 
        user: process.env.SMTP_USER, 
        pass: process.env.SMTP_PASS 
      },
    });

    const qrBase64 = registration.qrCode.split(';base64,').pop();
    const info = await transporter.sendMail({
      from: '"IzzoEvents" <noreply@izzoevents.com>',
      to: user.email,
      subject: `Your Ticket for ${event.title}`,
      html: `
        <h2>Hi ${user.name},</h2>
        <p>Thank you for registering for <strong>${event.title}</strong>!</p>
        <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
        <p><strong>Venue:</strong> ${event.venue}</p>
        <p><strong>Ticket Tier:</strong> ${registration.ticketTier}</p>
        <p>Please find your QR code ticket attached to this email. Present it at the entrance.</p>
        <p>See you there!</p>
      `,
      attachments: [{ filename: 'ticket-qrcode.png', content: qrBase64, encoding: 'base64' }]
    });

    console.log("Ticket Email sent to:", user.email);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

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

    // Fire & Forget email
    sendTicketEmail(req.user, event, reg).catch(console.error);

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

// ─── Verify Flutterwave Payment ──────────────────────────────────────────────
router.post('/verify-flutterwave', protect, async (req, res) => {
  try {
    const { transaction_id, eventId, tierName } = req.body;
    
    // 1. Verify transaction with Flutterwave API
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
      }
    });

    if (response.data.status !== 'success' || response.data.data.status !== 'successful') {
      return res.status(400).json({ message: 'Transaction could not be verified' });
    }

    const amountPaid = response.data.data.amount;

    // 2. Fetch event and check capacity
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.currentCapacity <= 0) return res.status(400).json({ message: 'Event is sold out' });

    // Check if user already registered while payment was processing
    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) return res.status(400).json({ message: 'You already have a ticket for this event' });

    // 3. Generate Ticket QR Code
    const ticketData = JSON.stringify({ 
      userId: req.user._id, 
      eventId: event._id, 
      tier: tierName,
      txId: transaction_id
    });
    const qrCode = await QRCode.toDataURL(ticketData);

    // 4. Create Registration
    const reg = await Registration.create({
      user: req.user._id,
      event: eventId,
      status: 'Registered',
      ticketTier: tierName,
      amountPaid: amountPaid,
      transactionId: transaction_id.toString(),
      qrCode
    });

    event.currentCapacity -= 1;
    await event.save();

    // Fire & Forget email
    sendTicketEmail(req.user, event, reg).catch(console.error);

    res.status(201).json({ 
      message: 'Payment verified and ticket generated successfully!', 
      registration: reg 
    });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Already registered' });
    res.status(500).json({ message: error.response?.data?.message || error.message });
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
