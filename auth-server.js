const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const app = express();
let tempTokens = {};

app.get('/auth', async (req, res) => {
  try {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
    });
    const authLink = await client.generateAuthLink('http://localhost:3030/callback');
    tempTokens[authLink.oauth_token] = authLink.oauth_token_secret;
    res.redirect(authLink.url);
  } catch (e) {
    res.send('Error: Make sure TWITTER_API_KEY and TWITTER_API_SECRET are in backend/.env');
  }
});

app.get('/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  const secret = tempTokens[oauth_token];
  if (!secret) return res.send('Error matching token');
  
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: oauth_token,
    accessSecret: secret,
  });

  try {
    const { accessToken, accessSecret, screenName } = await client.login(oauth_verifier);
    res.send('<h1>Success! Authorized as @' + screenName + '</h1><p><b>TWITTER_ACCESS_TOKEN:</b> ' + accessToken + '</p><p><b>TWITTER_ACCESS_SECRET:</b> ' + accessSecret + '</p><p><i>Copy these two values into Render, and you can close this window!</i></p>');
  } catch (e) {
    res.send('Error during login');
  }
});

app.listen(3030, () => console.log('Auth server running on http://localhost:3030/auth'));
