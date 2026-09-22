/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const axios = require('axios');
const crypto = require('crypto');
const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const Settings = require('../models/Settings');

let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Resolves MTN MoMo credentials from DB Settings or process.env
 */
async function getMomoConfig() {
  let subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY || '';
  let apiUser = process.env.MTN_MOMO_API_USER || '';
  let apiKey = process.env.MTN_MOMO_API_KEY || '';
  let environment = process.env.MTN_MOMO_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'mtnrwanda'
  let isEnabled = true;

  try {
    const settings = await Settings.findOne();
    if (settings) {
      if (settings.momoEnabled !== undefined) isEnabled = settings.momoEnabled;
      if (settings.momoSubscriptionKey) subscriptionKey = settings.momoSubscriptionKey;
      if (settings.momoApiUser) apiUser = settings.momoApiUser;
      if (settings.momoApiKey) apiKey = settings.momoApiKey;
      if (settings.momoEnvironment) environment = settings.momoEnvironment;
    }
  } catch (err) {
    console.warn('[MTN MoMo] DB settings error:', err.message);
  }

  const baseUrl = environment === 'sandbox'
    ? 'https://sandbox.momodeveloper.mtn.com'
    : 'https://proxy.momoapi.mtn.com';

  return {
    subscriptionKey: subscriptionKey.trim(),
    apiUser: apiUser.trim(),
    apiKey: apiKey.trim(),
    environment: environment.trim(),
    baseUrl,
    isEnabled
  };
}

/**
 * Obtains an OAuth 2.0 Bearer Token using Basic Auth (API_USER:API_KEY)
 */
async function getAccessToken(customConfig = null) {
  const config = customConfig || await getMomoConfig();

  if (!config.subscriptionKey || !config.apiUser || !config.apiKey) {
    throw new Error('MTN MoMo credentials missing. Please set Subscription Key, API User, and API Key in Settings.');
  }

  // Return cached token if still valid (with 60-second safety margin)
  if (!customConfig && cachedToken && tokenExpiresAt && Date.now() < (tokenExpiresAt - 60000)) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64');

  const res = await axios.post(
    `${config.baseUrl}/collection/token/`,
    {},
    {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Ocp-Apim-Subscription-Key': config.subscriptionKey
      },
      timeout: 10000
    }
  );

  const token = res.data?.access_token;
  const expiresIn = res.data?.expires_in || 3600;

  if (!customConfig) {
    cachedToken = token;
    tokenExpiresAt = Date.now() + (expiresIn * 1000);
  }

  return token;
}

/**
 * Triggers a USSD Push prompt to the customer's phone (Request to Pay)
 */
async function requestToPay({ referenceId, amount, phoneNumber, externalId, payerMessage, payeeNote }) {
  const config = await getMomoConfig();
  const token = await getAccessToken(config);

  // Format to standard 25078XXXXXXX or 25079XXXXXXX
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '250' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('250')) {
    cleanPhone = '250' + cleanPhone;
  }

  const ref = referenceId || uuidv4();

  const payload = {
    amount: String(amount),
    currency: 'RWF',
    externalId: externalId || `IZZO-${Date.now()}`,
    payer: {
      partyIdType: 'MSISDN',
      partyId: cleanPhone
    },
    payerMessage: payerMessage || 'Payment for IzzoEvents Ticket',
    payeeNote: payeeNote || 'IzzoEvents Kigali'
  };

  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Reference-Id': ref,
    'X-Target-Environment': config.environment,
    'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    'Content-Type': 'application/json'
  };

  if (process.env.FRONTEND_URL) {
    headers['X-Callback-Url'] = `${process.env.FRONTEND_URL}/api/gateway/momo/callback`;
  }

  const res = await axios.post(
    `${config.baseUrl}/collection/v1_0/requesttopay`,
    payload,
    { headers, timeout: 15000 }
  );

  return {
    success: true,
    referenceId: ref,
    status: 'PENDING',
    statusCode: res.status,
    phone: cleanPhone
  };
}

/**
 * Checks status of an in-flight RequestToPay transaction
 */
async function getTransactionStatus(referenceId) {
  const config = await getMomoConfig();
  const token = await getAccessToken(config);

  const res = await axios.get(
    `${config.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': config.environment,
        'Ocp-Apim-Subscription-Key': config.subscriptionKey
      },
      timeout: 10000
    }
  );

  const data = res.data || {};
  
  // MoMo returns 'SUCCESSFUL', 'PENDING', or 'FAILED'
  const rawStatus = (data.status || '').toUpperCase();
  let normalizedStatus = 'PENDING';
  if (rawStatus === 'SUCCESSFUL') normalizedStatus = 'SUCCESSFUL';
  else if (rawStatus === 'FAILED' || rawStatus === 'REJECTED') normalizedStatus = 'FAILED';

  return {
    referenceId,
    status: normalizedStatus,
    amount: data.amount ? parseFloat(data.amount) : null,
    financialTransactionId: data.financialTransactionId || null,
    reason: data.reason || null,
    raw: data
  };
}

/**
 * Tests connection & token generation with provided or saved credentials
 */
async function testMomoConnection(customCreds = null) {
  try {
    const config = customCreds ? {
      subscriptionKey: (customCreds.subscriptionKey || '').trim(),
      apiUser: (customCreds.apiUser || '').trim(),
      apiKey: (customCreds.apiKey || '').trim(),
      environment: (customCreds.environment || 'sandbox').trim(),
      baseUrl: (customCreds.environment || 'sandbox').trim() === 'sandbox'
        ? 'https://sandbox.momodeveloper.mtn.com'
        : 'https://proxy.momoapi.mtn.com'
    } : await getMomoConfig();

    const token = await getAccessToken(config);
    return {
      success: true,
      message: `Connected successfully to MTN MoMo (${config.environment})! Access token generated.`,
      environment: config.environment,
      hasToken: Boolean(token)
    };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return {
      success: false,
      error: `MTN MoMo Auth failed: ${msg}`
    };
  }
}

/**
 * Helper to auto-create a Sandbox API User and API Key on momodeveloper.mtn.com
 */
async function createSandboxApiUserAndKey(subscriptionKey, hostUrl = 'https://izzoevents.com') {
  const userId = uuidv4();
  const subKey = subscriptionKey.trim();

  // 1. Create API User
  await axios.post(
    'https://sandbox.momodeveloper.mtn.com/v1_0/apiuser',
    { providerCallbackHost: new URL(hostUrl).host },
    {
      headers: {
        'X-Reference-Id': userId,
        'Ocp-Apim-Subscription-Key': subKey,
        'Content-Type': 'application/json'
      }
    }
  );

  // 2. Generate API Key
  const keyRes = await axios.post(
    `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/${userId}/apikey`,
    {},
    {
      headers: {
        'Ocp-Apim-Subscription-Key': subKey
      }
    }
  );

  return {
    apiUser: userId,
    apiKey: keyRes.data?.apiKey,
    subscriptionKey: subKey
  };
}

module.exports = {
  getMomoConfig,
  getAccessToken,
  requestToPay,
  getTransactionStatus,
  testMomoConnection,
  createSandboxApiUserAndKey
};
