const axios = require('axios');
const Settings = require('../models/Settings');

/**
 * Resolves Instagram Graph API credentials from Database Settings or Environment Variables
 */
async function getInstagramCredentials() {
  try {
    let accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    let accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    let isEnabled = true;

    try {
      const settings = await Settings.findOne();
      if (settings) {
        if (settings.instagramAutoPostEnabled !== undefined) {
          isEnabled = settings.instagramAutoPostEnabled;
        }
        if (settings.instagramAccountId) accountId = settings.instagramAccountId;
        if (settings.instagramAccessToken) accessToken = settings.instagramAccessToken;
      }
    } catch (dbErr) {
      console.warn('[Instagram] Could not load settings from DB:', dbErr.message);
    }

    if (!isEnabled) {
      console.log('[Instagram] Auto-posting is disabled in platform settings.');
      return null;
    }

    if (!accountId || !accessToken) {
      console.log('[Instagram] Skipping Instagram post: Account ID or Access Token not configured yet.');
      return null;
    }

    return {
      accountId: accountId.trim(),
      accessToken: accessToken.trim()
    };
  } catch (err) {
    console.error('[Instagram] Error resolving credentials:', err.message);
    return null;
  }
}

/**
 * Automatically publishes a new event post to Instagram (@izzoevents)
 * Uses Meta Graph API: 1) Media Container Creation -> 2) Media Publish
 */
const postEventToInstagram = async (event) => {
  try {
    const creds = await getInstagramCredentials();
    if (!creds) return { success: false, reason: 'Instagram API not configured or disabled' };

    if (!event.bannerImage || !event.bannerImage.startsWith('http')) {
      console.log('[Instagram] Skipping post: Event has no public image URL.');
      return { success: false, reason: 'Invalid or missing banner image URL' };
    }

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
        priceInfo = 'Tickets Available';
      }
    }

    const caption = `🔥 NEW EVENT IN KIGALI: ${event.title} 🇷🇼✨\n\n📍 Venue: ${event.venue}\n📅 Date: ${dateStr}\n🎟️ Admission: ${priceInfo}\n\n${event.description ? event.description.substring(0, 200) + '...\n\n' : ''}👉 Get your tickets now on izzoevents.com or link in bio!\n🔗 ${eventUrl}\n\n#IzzoEvents #Kigali #Rwanda #KigaliNightlife #VisitRwanda #RwOT #KigaliEvents #EventsInRwanda`;

    // Step 1: Create Media Container
    console.log('[Instagram] Creating media container for event:', event.title);
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${creds.accountId}/media`,
      {
        image_url: event.bannerImage,
        caption: caption,
        access_token: creds.accessToken
      }
    );

    const creationId = containerRes.data?.id;
    if (!creationId) {
      throw new Error('Failed to obtain creation_id from Meta Graph API');
    }

    // Small delay to allow Meta to download and process the image
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Publish the Container
    console.log('[Instagram] Publishing media container ID:', creationId);
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${creds.accountId}/media_publish`,
      {
        creation_id: creationId,
        access_token: creds.accessToken
      }
    );

    const publishedMediaId = publishRes.data?.id;
    console.log('[Instagram] Successfully published post to Instagram! Media ID:', publishedMediaId);
    return { success: true, mediaId: publishedMediaId };

  } catch (error) {
    const errorDetails = error.response?.data?.error || error.message;
    console.error('[Instagram] Error posting to Instagram:', errorDetails);
    return { success: false, error: errorDetails };
  }
};

/**
 * Tests connection to Instagram Graph API account
 */
const testInstagramConnection = async (customCreds = null) => {
  try {
    let creds = null;
    if (customCreds && customCreds.accountId && customCreds.accessToken) {
      creds = {
        accountId: customCreds.accountId.trim(),
        accessToken: customCreds.accessToken.trim()
      };
    } else {
      creds = await getInstagramCredentials();
    }

    if (!creds) {
      return { success: false, message: 'Instagram credentials missing. Please fill in Account ID and Access Token.' };
    }

    // Verify account info
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${creds.accountId}?fields=id,username,name,profile_picture_url&access_token=${creds.accessToken}`
    );

    return { 
      success: true, 
      account: res.data,
      message: `Connected successfully to @${res.data.username || 'izzoevents'}!` 
    };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[Instagram] Connection test failed:', msg);
    return { success: false, error: msg };
  }
};

module.exports = { postEventToInstagram, testInstagramConnection };
