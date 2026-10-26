const express = require('express');
const Settings = require('../models/Settings');
const { testTwitterConnection } = require('../utils/twitter');
const { testInstagramConnection } = require('../utils/instagram');
const { testMomoConnection, createSandboxApiUserAndKey } = require('../services/mtnMomoService');
const { testAirtelConnection } = require('../services/airtelMoneyService');
const router = express.Router();

// GET global settings
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.findOne();
    res.json(settings || {});
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update global settings
router.put('/', async (req, res) => {
  try {
    const { 
      logoUrl, 
      siteName, 
      notificationEmail,
      twitterApiKey,
      twitterApiSecret,
      twitterAccessToken,
      twitterAccessSecret,
      twitterAutoPostEnabled,
      instagramAccountId,
      instagramAccessToken,
      instagramAutoPostEnabled,
      paymentSimulationMode,
      momoEnabled,
      momoEnvironment,
      momoSubscriptionKey,
      momoApiUser,
      momoApiKey,
      airtelEnabled,
      airtelEnvironment,
      airtelClientId,
      airtelClientSecret
    } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ 
        logoUrl, 
        siteName, 
        notificationEmail,
        twitterApiKey,
        twitterApiSecret,
        twitterAccessToken,
        twitterAccessSecret,
        twitterAutoPostEnabled,
        instagramAccountId,
        instagramAccessToken,
        instagramAutoPostEnabled,
        paymentSimulationMode,
        momoEnabled,
        momoEnvironment,
        momoSubscriptionKey,
        momoApiUser,
        momoApiKey,
        airtelEnabled,
        airtelEnvironment,
        airtelClientId,
        airtelClientSecret
      });
    } else {
      if (logoUrl !== undefined) settings.logoUrl = logoUrl;
      if (siteName !== undefined) settings.siteName = siteName;
      if (notificationEmail !== undefined) settings.notificationEmail = notificationEmail;
      if (twitterApiKey !== undefined) settings.twitterApiKey = twitterApiKey;
      if (twitterApiSecret !== undefined) settings.twitterApiSecret = twitterApiSecret;
      if (twitterAccessToken !== undefined) settings.twitterAccessToken = twitterAccessToken;
      if (twitterAccessSecret !== undefined) settings.twitterAccessSecret = twitterAccessSecret;
      if (twitterAutoPostEnabled !== undefined) settings.twitterAutoPostEnabled = twitterAutoPostEnabled;
      if (instagramAccountId !== undefined) settings.instagramAccountId = instagramAccountId;
      if (instagramAccessToken !== undefined) settings.instagramAccessToken = instagramAccessToken;
      if (instagramAutoPostEnabled !== undefined) settings.instagramAutoPostEnabled = instagramAutoPostEnabled;

      // IzzoPay Payment Gateway settings
      if (paymentSimulationMode !== undefined) settings.paymentSimulationMode = paymentSimulationMode;
      if (momoEnabled !== undefined) settings.momoEnabled = momoEnabled;
      if (momoEnvironment !== undefined) settings.momoEnvironment = momoEnvironment;
      if (momoSubscriptionKey !== undefined) settings.momoSubscriptionKey = momoSubscriptionKey;
      if (momoApiUser !== undefined) settings.momoApiUser = momoApiUser;
      if (momoApiKey !== undefined) settings.momoApiKey = momoApiKey;
      if (airtelEnabled !== undefined) settings.airtelEnabled = airtelEnabled;
      if (airtelEnvironment !== undefined) settings.airtelEnvironment = airtelEnvironment;
      if (airtelClientId !== undefined) settings.airtelClientId = airtelClientId;
      if (airtelClientSecret !== undefined) settings.airtelClientSecret = airtelClientSecret;
    }
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST test Twitter connection
router.post('/test-twitter', async (req, res) => {
  try {
    const result = await testTwitterConnection(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.message || result.error || 'Failed to post test tweet.' });
    }
    res.json({ message: 'Test tweet posted successfully!', tweetId: result.tweetId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST test Instagram connection
router.post('/test-instagram', async (req, res) => {
  try {
    const result = await testInstagramConnection(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.message || result.error || 'Failed to connect to Instagram.' });
    }
    res.json({ message: result.message || 'Instagram connected successfully!', account: result.account });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST test MTN MoMo connection
router.post('/test-momo', async (req, res) => {
  try {
    const result = await testMomoConnection(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Failed to connect to MTN MoMo API' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST test Airtel Money connection
router.post('/test-airtel', async (req, res) => {
  try {
    const result = await testAirtelConnection(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Failed to connect to Airtel Money API' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST auto-provision MTN MoMo Sandbox API user and key
router.post('/create-momo-sandbox', async (req, res) => {
  try {
    const { subscriptionKey } = req.body;
    if (!subscriptionKey) {
      return res.status(400).json({ message: 'Primary Subscription Key from momodeveloper.mtn.com is required.' });
    }
    const result = await createSandboxApiUserAndKey(subscriptionKey);
    res.json({
      success: true,
      message: 'Sandbox API User and Key generated successfully!',
      ...result
    });
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    res.status(500).json({ message: `Provisioning error: ${msg}` });
  }
});

module.exports = router;
