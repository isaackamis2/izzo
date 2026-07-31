const express = require('express');
const Settings = require('../models/Settings');
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
    const { logoUrl, siteName } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ logoUrl, siteName });
    } else {
      settings.logoUrl = logoUrl !== undefined ? logoUrl : settings.logoUrl;
      settings.siteName = siteName !== undefined ? siteName : settings.siteName;
    }
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
