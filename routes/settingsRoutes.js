const express = require('express');
const Settings = require('../models/Settings');
const { testTwitterConnection } = require('../utils/twitter');
const { testInstagramConnection } = require('../utils/instagram');
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
      instagramAutoPostEnabled
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
        instagramAutoPostEnabled
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

module.exports = router;
