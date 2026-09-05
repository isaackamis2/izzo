const { TwitterApi } = require('twitter-api-v2');
const Settings = require('../models/Settings');

/**
 * Resolves Twitter API credentials from Database Settings or Environment Variables
 */
async function getTwitterClient() {
  try {
    let apiKey = process.env.TWITTER_API_KEY;
    let apiSecret = process.env.TWITTER_API_SECRET;
    let accessToken = process.env.TWITTER_ACCESS_TOKEN;
    let accessSecret = process.env.TWITTER_ACCESS_SECRET;
    let isEnabled = true;

    // Check DB Settings first
    try {
      const settings = await Settings.findOne();
      if (settings) {
        if (settings.twitterAutoPostEnabled !== undefined) {
          isEnabled = settings.twitterAutoPostEnabled;
        }
        if (settings.twitterApiKey) apiKey = settings.twitterApiKey;
        if (settings.twitterApiSecret) apiSecret = settings.twitterApiSecret;
        if (settings.twitterAccessToken) accessToken = settings.twitterAccessToken;
        if (settings.twitterAccessSecret) accessSecret = settings.twitterAccessSecret;
      }
    } catch (dbErr) {
      console.warn('[Twitter] Could not load settings from DB:', dbErr.message);
    }

    if (!isEnabled) {
      console.log('[Twitter] Auto-posting is disabled in platform settings.');
      return null;
    }

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      console.log('[Twitter] Skipping tweet: API keys are not configured yet.');
      return null;
    }

    const client = new TwitterApi({
      appKey: apiKey.trim(),
      appSecret: apiSecret.trim(),
      accessToken: accessToken.trim(),
      accessSecret: accessSecret.trim(),
    });

    return client.v2;
  } catch (error) {
    console.error('[Twitter] Failed to initialize Twitter client:', error.message);
    return null;
  }
}

/**
 * Cross-posts an event announcement to https://x.com/izzoevents
 */
const postEventToTwitter = async (event) => {
  try {
    const client = await getTwitterClient();
    if (!client) return { success: false, reason: 'Twitter API not configured or disabled' };

    const frontendBase = process.env.FRONTEND_URL || 'https://izzoevents.com';
    const eventUrl = `${frontendBase}/events/${event._id}`;
    
    const dateStr = new Date(event.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });

    let priceInfo = 'Free Event';
    if (event.isTicketed) {
      if (event.ticketTiers && event.ticketTiers.length > 0) {
        const minPrice = Math.min(...event.ticketTiers.map(t => t.price));
        priceInfo = `Tickets from ${minPrice.toLocaleString()} RWF`;
      } else if (event.priceRange) {
        priceInfo = event.priceRange;
      } else {
        priceInfo = 'Tickets on Sale';
      }
    }

    const tweetText = `🎉 NEW EVENT: ${event.title}\n\n📍 ${event.venue}\n📅 ${dateStr}\n🎟️ ${priceInfo}\n\nGet info & tickets 👇\n${eventUrl}\n\n#Kigali #Rwanda #IzzoEvents @izzoevents`;

    const response = await client.tweet(tweetText);
    console.log('[Twitter] Successfully posted tweet ID:', response.data.id);
    return { success: true, tweetId: response.data.id };
  } catch (error) {
    console.error('[Twitter] Error posting to Twitter/X:', error.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Test tweet verification helper
 */
const testTwitterConnection = async (customCreds = null) => {
  try {
    let client = null;
    if (customCreds && customCreds.apiKey && customCreds.apiSecret && customCreds.accessToken && customCreds.accessSecret) {
      const twitterApi = new TwitterApi({
        appKey: customCreds.apiKey.trim(),
        appSecret: customCreds.apiSecret.trim(),
        accessToken: customCreds.accessToken.trim(),
        accessSecret: customCreds.accessSecret.trim(),
      });
      client = twitterApi.v2;
    } else {
      client = await getTwitterClient();
    }

    if (!client) {
      return { 
        success: false, 
        message: 'Twitter credentials missing. Please fill in all 4 fields (API Key, API Secret, Access Token, Access Token Secret).' 
      };
    }
    const testText = `⚡ IzzoEvents auto-post connection test at ${new Date().toLocaleTimeString()}! Follow @izzoevents for upcoming Kigali events 🇷🇼 https://izzoevents.com`;
    const response = await client.tweet(testText);
    return { success: true, tweetId: response.data.id };
  } catch (err) {
    console.error('[Twitter] Test tweet error:', err);
    let errMsg = err.data?.detail || err.data?.title || err.message;
    if (err.data?.errors && Array.isArray(err.data.errors) && err.data.errors.length > 0) {
      errMsg = err.data.errors.map(e => e.message || e.detail || JSON.stringify(e)).join('; ');
    }
    if (err.code === 403 || err.status === 403 || (err.message && err.message.includes('403'))) {
      errMsg = `X API 403 Forbidden: ${errMsg}. Make sure your X App permissions are set to "Read and write", then REGENERATE your Access Token & Secret.`;
    }
    return { success: false, error: errMsg };
  }
};

module.exports = { postEventToTwitter, testTwitterConnection };
