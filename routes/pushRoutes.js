const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { protect } = require('../middleware/authMiddleware');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BGqxJoRrFXIbE9C-5EX3q__9FBlQ7xe9DrnURpoiMB2jMVwpFRUg3ldzBBfMDMCV7VQWZDCtnEgkfouGtWEpkBc';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'r0ssU19wv5Jvpo-z8pHIkclMEGWIDL8nL180vCHpOIM';
const VAPID_EMAIL = process.env.ADMIN_EMAIL || 'mailto:izzoeventsapp@gmail.com';

webpush.setVapidDetails(
  VAPID_EMAIL.startsWith('mailto:') ? VAPID_EMAIL : `mailto:${VAPID_EMAIL}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// GET public VAPID key
router.get('/public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST save push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, visitorId, platform, device, userId } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        visitorId: visitorId || null,
        userId: userId || null,
        platform: platform || 'web',
        device: device || 'mobile'
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, message: 'Subscribed to event alerts!' });
  } catch (err) {
    console.error('[Push] Subscribe error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save push subscription' });
  }
});

// POST broadcast notification to all subscribers (Admin / Manager)
router.post('/broadcast', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, message, url, icon, badge, image } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const subscriptions = await PushSubscription.find();
    const payload = JSON.stringify({
      title,
      body: message,
      icon: icon || 'https://izzoevents.com/icon-192.png',
      badge: badge || 'https://izzoevents.com/icon-192.png',
      image: image || null,
      data: {
        url: url || 'https://izzoevents.com/'
      }
    });

    let sent = 0;
    let failed = 0;
    const staleEndpoints = [];

    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, payload);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }));

    // Clean up expired subscriptions
    if (staleEndpoints.length > 0) {
      await PushSubscription.deleteMany({ endpoint: { $in: staleEndpoints } });
    }

    res.json({
      success: true,
      message: `Push broadcast sent to ${sent} subscribers. (${failed} unreachable removed).`,
      stats: { total: subscriptions.length, sent, failed }
    });
  } catch (err) {
    console.error('[Push] Broadcast error:', err.message);
    res.status(500).json({ message: 'Broadcast failed', error: err.message });
  }
});

// GET subscriber count
router.get('/count', async (req, res) => {
  try {
    const count = await PushSubscription.countDocuments();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

module.exports = router;
