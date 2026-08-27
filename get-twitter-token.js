const { TwitterApi } = require('twitter-api-v2');

async function getLink() {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
  });

  const authLink = await client.generateAuthLink('oob');
  console.log('URL:', authLink.url);
  console.log('OAUTH_TOKEN:', authLink.oauth_token);
  console.log('OAUTH_SECRET:', authLink.oauth_token_secret);
}

getLink().catch(console.error);
