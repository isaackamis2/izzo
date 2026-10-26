/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const PaymentTransaction = require('../models/PaymentTransaction');
const { protect } = require('../middleware/authMiddleware');
const { initiatePayment, verifyPayment, detectNetwork } = require('../services/paymentGateway');

/**
 * GET /api/gateway/detect-network/:phone
 * Quick utility for UI to detect network as user types
 */
router.get('/detect-network/:phone', (req, res) => {
  const network = detectNetwork(req.params.phone);
  res.json({
    phone: req.params.phone,
    network,
    label: network === 'MTN_MOMO' ? 'MTN Mobile Money' : network === 'AIRTEL_MONEY' ? 'Airtel Money' : null
  });
});

/**
 * POST /api/gateway/initiate
 * Initiates direct in-house USSD push via MTN MoMo or Airtel Money
 */
router.post('/initiate', protect, async (req, res) => {
  try {
    const { eventId, tierName, phoneNumber } = req.body;

    if (!phoneNumber || phoneNumber.trim().length < 9) {
      return res.status(400).json({ message: 'Please enter a valid Rwandan phone number (e.g. 078XXXXXXX or 073XXXXXXX).' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.isTicketed) return res.status(400).json({ message: 'This is a free event' });
    if (event.currentCapacity <= 0) return res.status(400).json({ message: 'Event is sold out' });

    // Check if user already holds a ticket
    const existing = await Registration.findOne({ user: req.user._id, event: eventId });
    if (existing) {
      return res.status(400).json({ message: 'You already have a confirmed ticket for this event.' });
    }

    // Determine tier price
    let amount = event.price || 0;
    if (event.ticketTiers && event.ticketTiers.length > 0) {
      const tier = event.ticketTiers.find(t => t.name === tierName);
      if (tier) amount = tier.price;
    }

    const result = await initiatePayment({
      event,
      user: req.user,
      tierName: tierName || 'Standard',
      amount,
      phoneNumber: phoneNumber.trim()
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('[IzzoPay Initiate Error]:', error.message);
    res.status(500).json({ message: error.message || 'Payment initiation failed' });
  }
});

/**
 * POST /api/gateway/verify
 * Polled by frontend until telecom status becomes SUCCESSFUL or FAILED
 */
router.post('/verify', protect, async (req, res) => {
  try {
    const { ref } = req.body;
    if (!ref) {
      return res.status(400).json({ message: 'Transaction reference is required' });
    }

    const result = await verifyPayment(ref);

    if (result.status === 'pending') {
      return res.status(202).json(result);
    }

    if (result.status === 'failed') {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[IzzoPay Verify Error]:', error.message);
    res.status(500).json({ message: error.message || 'Payment verification failed' });
  }
});

/**
 * POST /api/gateway/momo/callback
 * Webhook for MTN MoMo instant payment notifications
 */
router.post('/momo/callback', async (req, res) => {
  try {
    console.log('[MTN MoMo Webhook] Notification received:', req.body);
    const referenceId = req.headers['x-reference-id'] || req.body?.externalId;
    if (referenceId) {
      await verifyPayment(referenceId).catch(err => console.warn('[MoMo Webhook Error]:', err.message));
    }
    res.status(200).json({ status: 'OK' });
  } catch (err) {
    res.status(200).json({ status: 'OK' });
  }
});

/**
 * POST /api/gateway/airtel/callback
 * Webhook for Airtel Money instant payment notifications
 */
router.post('/airtel/callback', async (req, res) => {
  try {
    console.log('[Airtel Money Webhook] Notification received:', req.body);
    const referenceId = req.body?.transaction?.id;
    if (referenceId) {
      await verifyPayment(referenceId).catch(err => console.warn('[Airtel Webhook Error]:', err.message));
    }
    res.status(200).json({ status: 'OK' });
  } catch (err) {
    res.status(200).json({ status: 'OK' });
  }
});

/**
 * GET /api/gateway/transactions (Admin only audit log)
 */
router.get('/transactions', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const transactions = await PaymentTransaction.find()
      .populate('user', 'name email phone')
      .populate('event', 'title venue')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
