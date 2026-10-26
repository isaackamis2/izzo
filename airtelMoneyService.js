/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const axios = require('axios');
const Settings = require('../models/Settings');

let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Resolves Airtel Money credentials from DB Settings or process.env
 */
async function getAirtelConfig() {
  let clientId = process.env.AIRTEL_CLIENT_ID || '';
  let clientSecret = process.env.AIRTEL_CLIENT_SECRET || '';
  let environment = process.env.AIRTEL_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'production'
  let isEnabled = true;

  try {
    const settings = await Settings.findOne();
    if (settings) {
      if (settings.airtelEnabled !== undefined) isEnabled = settings.airtelEnabled;
      if (settings.airtelClientId) clientId = settings.airtelClientId;
      if (settings.airtelClientSecret) clientSecret = settings.airtelClientSecret;
      if (settings.airtelEnvironment) environment = settings.airtelEnvironment;
    }
  } catch (err) {
    console.warn('[Airtel Money] DB settings error:', err.message);
  }

  const baseUrl = environment === 'production'
    ? 'https://openapi.airtel.africa'
    : 'https://openapiuat.airtel.africa';

  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    environment: environment.trim(),
    baseUrl,
    isEnabled
  };
}

/**
 * Obtains an OAuth 2.0 Bearer Token using Client Credentials
 */
async function getAccessToken(customConfig = null) {
  const config = customConfig || await getAirtelConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error('Airtel Money credentials missing. Please set Client ID and Client Secret in Settings.');
  }

  // Return cached token if valid
  if (!customConfig && cachedToken && tokenExpiresAt && Date.now() < (tokenExpiresAt - 60000)) {
    return cachedToken;
  }

  const res = await axios.post(
    `${config.baseUrl}/auth/oauth2/token`,
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials'
    },
    {
      headers: {
        'Content-Type': 'application/json'
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
 * Triggers an Airtel Money USSD Push Prompt to the customer's phone
 */
async function requestPayment({ referenceId, amount, phoneNumber, referenceNote }) {
  const config = await getAirtelConfig();
  const token = await getAccessToken(config);

  // Normalize phone to Rwanda 9-digit format (7XXXXXXXX) without leading 0 or 250
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('250')) {
    cleanPhone = cleanPhone.substring(3);
  } else if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  const txId = referenceId || `AIRTEL-${Date.now()}`;

  const payload = {
    reference: referenceNote || 'IzzoEvents Ticket',
    subscriber: {
      country: 'RW',
      currency: 'RWF',
      msisdn: cleanPhone
    },
    transaction: {
      amount: parseFloat(amount),
      country: 'RW',
      currency: 'RWF',
      id: txId
    }
  };

  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Country': 'RW',
    'X-Currency': 'RWF',
    'Content-Type': 'application/json'
  };

  const res = await axios.post(
    `${config.baseUrl}/merchant/v1/payments/`,
    payload,
    { headers, timeout: 15000 }
  );

  return {
    success: true,
    referenceId: txId,
    status: 'PENDING',
    phone: `250${cleanPhone}`,
    data: res.data
  };
}

/**
 * Inquires the status of an in-flight Airtel Money transaction
 */
async function getTransactionStatus(referenceId) {
  const config = await getAirtelConfig();
  const token = await getAccessToken(config);

  const res = await axios.get(
    `${config.baseUrl}/standard/v1/payments/${referenceId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Country': 'RW',
        'X-Currency': 'RWF'
      },
      timeout: 10000
    }
  );

  const data = res.data?.data || {};
  const statusObj = data.transaction || {};
  const rawStatus = (statusObj.status || res.data?.status?.message || '').toUpperCase();

  let normalizedStatus = 'PENDING';
  if (rawStatus === 'SUCCESS' || rawStatus === 'SUCCESSFUL' || rawStatus === 'PAID') {
    normalizedStatus = 'SUCCESSFUL';
  } else if (rawStatus === 'FAILED' || rawStatus === 'REJECTED' || rawStatus === 'CANCELLED') {
    normalizedStatus = 'FAILED';
  }

  return {
    referenceId,
    status: normalizedStatus,
    amount: statusObj.amount ? parseFloat(statusObj.amount) : null,
    financialTransactionId: statusObj.airtel_money_id || statusObj.id || null,
    raw: res.data
  };
}

/**
 * Tests connection & token generation with provided credentials
 */
async function testAirtelConnection(customCreds = null) {
  try {
    const config = customCreds ? {
      clientId: (customCreds.clientId || '').trim(),
      clientSecret: (customCreds.clientSecret || '').trim(),
      environment: (customCreds.environment || 'sandbox').trim(),
      baseUrl: (customCreds.environment || 'sandbox').trim() === 'production'
        ? 'https://openapi.airtel.africa'
        : 'https://openapiuat.airtel.africa'
    } : await getAirtelConfig();

    const token = await getAccessToken(config);
    return {
      success: true,
      message: `Connected successfully to Airtel Money Rwanda (${config.environment})! Access token generated.`,
      environment: config.environment,
      hasToken: Boolean(token)
    };
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error_description || err.message;
    return {
      success: false,
      error: `Airtel Money Auth failed: ${msg}`
    };
  }
}

module.exports = {
  getAirtelConfig,
  getAccessToken,
  requestPayment,
  getTransactionStatus,
  testAirtelConnection
};
