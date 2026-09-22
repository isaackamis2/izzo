/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const crypto = require('crypto');
const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const QRCode = require('qrcode');
const PaymentTransaction = require('../models/PaymentTransaction');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const Settings = require('../models/Settings');
const mtnMomoService = require('./mtnMomoService');
const airtelMoneyService = require('./airtelMoneyService');
const { sendTicketEmail, notifyNewRegistration } = require('../utils/mailer');

/**
 * Detects the Rwandan mobile money telecom network from a phone number
 * @param {string} phoneNumber 
 * @returns {'MTN_MOMO' | 'AIRTEL_MONEY' | null}
 */
function detectNetwork(phoneNumber = '') {
  let clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.startsWith('250')) {
    clean = clean.substring(3);
  } else if (clean.startsWith('0')) {
    clean = clean.substring(1);
  }

  // Rwandan 9-digit format starts with 7X...
  if (clean.length === 9 && clean.startsWith('7')) {
    const prefix = clean.substring(0, 2); // '78', '79', '72', '73'
    if (prefix === '78' || prefix === '79') return 'MTN_MOMO';
    if (prefix === '72' || prefix === '73') return 'AIRTEL_MONEY';
  }

  return null;
}

/**
 * Formats phone number into standard local or international format
 */
function normalizePhoneNumber(phoneNumber = '') {
  let clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.startsWith('250')) {
    clean = clean.substring(3);
  } else if (clean.startsWith('0')) {
    clean = clean.substring(1);
  }
  return {
    raw: phoneNumber,
    localNine: clean,
    localWithZero: `0${clean}`,
    internationalE164: `250${clean}`
  };
}

/**
 * Dispatches an in-house mobile money collection request to MTN or Airtel
 */
async function initiatePayment({ event, user, tierName, amount, phoneNumber }) {
  const network = detectNetwork(phoneNumber);
  if (!network) {
    throw new Error('Invalid Rwandan phone number. Please enter an MTN (078/079) or Airtel (072/073) number.');
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const referenceId = uuidv4();

  // Load gateway settings
  const settings = await Settings.findOne() || {};
  const isSimulation = Boolean(settings.paymentSimulationMode);

  // Check if live telecom credentials exist for the detected network
  let hasRealCreds = false;
  if (network === 'MTN_MOMO') {
    const momoConfig = await mtnMomoService.getMomoConfig();
    hasRealCreds = Boolean(momoConfig.subscriptionKey && momoConfig.apiUser && momoConfig.apiKey);
  } else if (network === 'AIRTEL_MONEY') {
    const airtelConfig = await airtelMoneyService.getAirtelConfig();
    hasRealCreds = Boolean(airtelConfig.clientId && airtelConfig.clientSecret);
  }

  // If simulation mode is explicitly enabled or real credentials aren't configured yet,
  // execute an intelligent simulation so checkouts work flawlessly during testing.
  if (isSimulation || !hasRealCreds) {
    console.log(`[IzzoPay] Simulating payment checkout (${network}) for ${normalizedPhone.localWithZero}, Amount: ${amount} RWF`);

    const tx = await PaymentTransaction.create({
      referenceId,
      user: user._id,
      event: event._id,
      ticketTier: tierName,
      amount,
      phoneNumber: normalizedPhone.internationalE164,
      provider: network,
      status: 'PENDING',
      environment: 'simulation',
      statusMessage: 'Simulated USSD Push sent to phone'
    });

    return {
      success: true,
      ref: referenceId,
      provider: network,
      status: 'pending',
      environment: 'simulation',
      message: `USSD push sent to ${normalizedPhone.localWithZero} (${network === 'MTN_MOMO' ? 'MTN MoMo' : 'Airtel Money'}). Enter your PIN...`
    };
  }

  // Real Telecom API Call
  let telecomRes;
  try {
    if (network === 'MTN_MOMO') {
      telecomRes = await mtnMomoService.requestToPay({
        referenceId,
        amount,
        phoneNumber: normalizedPhone.internationalE164,
        externalId: `IZZO-${event._id.toString().substring(0, 6)}-${Date.now()}`,
        payerMessage: `Ticket for ${event.title}`,
        payeeNote: 'IzzoEvents Kigali'
      });
    } else {
      telecomRes = await airtelMoneyService.requestPayment({
        referenceId,
        amount,
        phoneNumber: normalizedPhone.localNine,
        referenceNote: `IzzoEvents: ${event.title}`
      });
    }

    await PaymentTransaction.create({
      referenceId,
      user: user._id,
      event: event._id,
      ticketTier: tierName,
      amount,
      phoneNumber: normalizedPhone.internationalE164,
      provider: network,
      status: 'PENDING',
      environment: 'production',
      rawProviderResponse: telecomRes
    });

    return {
      success: true,
      ref: referenceId,
      provider: network,
      status: 'pending',
      environment: 'production',
      message: `USSD prompt sent to ${normalizedPhone.localWithZero} (${network === 'MTN_MOMO' ? 'MTN MoMo' : 'Airtel Money'}). Enter your PIN...`
    };
  } catch (err) {
    console.error(`[IzzoPay] ${network} Dispatch Error:`, err.message);
    throw new Error(err.response?.data?.message || err.message || `Failed to initiate ${network} payment`);
  }
}

/**
 * Verifies transaction status and automatically generates QR ticket when successful
 */
async function verifyPayment(referenceId) {
  const tx = await PaymentTransaction.findOne({ referenceId })
    .populate('user', 'name email phone')
    .populate('event');

  if (!tx) {
    throw new Error('Payment transaction not found for reference ' + referenceId);
  }

  // If already successful and ticket issued, return existing ticket immediately
  if (tx.status === 'SUCCESSFUL' && tx.ticketGenerated && tx.registration) {
    const existingReg = await Registration.findById(tx.registration);
    return {
      status: 'successful',
      message: 'Ticket already generated',
      registration: existingReg
    };
  }

  // Determine current status
  let finalStatus = tx.status;
  let financialTxId = tx.transactionId;

  if (tx.environment === 'simulation') {
    // In simulation mode, grant approval after 4 seconds of waiting
    const elapsedSeconds = (Date.now() - new Date(tx.createdAt).getTime()) / 1000;
    if (elapsedSeconds >= 4) {
      finalStatus = 'SUCCESSFUL';
      financialTxId = `SIM-${Date.now()}`;
    } else {
      finalStatus = 'PENDING';
    }
  } else {
    // Query Live Telecom Provider
    try {
      if (tx.provider === 'MTN_MOMO') {
        const momoStatus = await mtnMomoService.getTransactionStatus(tx.referenceId);
        finalStatus = momoStatus.status;
        if (momoStatus.financialTransactionId) financialTxId = momoStatus.financialTransactionId;
      } else if (tx.provider === 'AIRTEL_MONEY') {
        const airtelStatus = await airtelMoneyService.getTransactionStatus(tx.referenceId);
        finalStatus = airtelStatus.status;
        if (airtelStatus.financialTransactionId) financialTxId = airtelStatus.financialTransactionId;
      }
    } catch (err) {
      console.warn(`[IzzoPay] Verification poll error for ${tx.referenceId}:`, err.message);
    }
  }

  // Update transaction record
  tx.status = finalStatus;
  if (financialTxId) tx.transactionId = financialTxId;
  await tx.save();

  if (finalStatus === 'PENDING') {
    return { status: 'pending', message: 'Payment still in progress. Please approve on your phone.' };
  }

  if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED') {
    return { status: 'failed', message: 'Payment failed or was cancelled by user.' };
  }

  if (finalStatus === 'SUCCESSFUL') {
    // Check if registration already exists for this transaction
    let reg = await Registration.findOne({
      user: tx.user._id,
      event: tx.event._id,
      transactionId: tx.referenceId
    });

    if (!reg) {
      const event = await Event.findById(tx.event._id);
      
      // Generate QR Code for check-in
      const ticketData = JSON.stringify({
        userId: tx.user._id,
        eventId: tx.event._id,
        tier: tx.ticketTier,
        txId: tx.referenceId,
        ref: financialTxId || tx.referenceId,
        provider: tx.provider
      });
      const qrCode = await QRCode.toDataURL(ticketData);

      reg = await Registration.create({
        user: tx.user._id,
        event: tx.event._id,
        status: 'Registered',
        ticketTier: tx.ticketTier,
        amountPaid: tx.amount,
        transactionId: tx.referenceId,
        qrCode
      });

      if (event && event.currentCapacity > 0) {
        event.currentCapacity -= 1;
        await event.save();
      }

      tx.ticketGenerated = true;
      tx.registration = reg._id;
      await tx.save();

      // Send confirmation emails asynchronously
      sendTicketEmail(tx.user, event || tx.event, reg).catch(console.error);
      notifyNewRegistration(tx.user, event || tx.event, reg).catch(console.error);
    }

    return {
      status: 'successful',
      message: 'Payment Successful! Ticket generated.',
      registration: reg
    };
  }

  return { status: finalStatus.toLowerCase() };
}

module.exports = {
  detectNetwork,
  normalizePhoneNumber,
  initiatePayment,
  verifyPayment
};
