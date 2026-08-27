const { TwitterApi } = require('twitter-api-v2');

let twitterClient = null;

try {
  if (
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  ) {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    twitterClient = client.v2;
  }
} catch (error) {
  console.error('Failed to initialize Twitter API client:', error);
}

const postEventToTwitter = async (event) => {
  if (!twitterClient) {
    console.log('Twitter cross-posting skipped: API keys are not configured.');
    return;
  }

  try {
    const frontendBase = process.env.FRONTEND_URL || 'https://izzoevents.com';
    const eventUrl = ${frontendBase}/events/;
    
    const dateStr = new Date(event.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });

    const tweetText = \🎉 New Event Alert! 🎉\n\n\\n📍 \\n📅 \\n\nGet your tickets now before they sell out! 👇\n\ #Kigali #RwandaEvents\;

    const response = await twitterClient.tweet(tweetText);
    console.log('Successfully posted to Twitter:', response.data.id);
  } catch (error) {
    console.error('Error posting to Twitter:', error);
  }
};

module.exports = { postEventToTwitter };
