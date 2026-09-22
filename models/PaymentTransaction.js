/**
 * ======================================================
 * PLATFORM DEVELOPED BY: Isiaka Kamana (Isaac)
 * Role: Lead Web Developer & Database Architect
 * Website: https://x.com/isaackamis2
 * Contact: isaackamis@gmail.com
 * ======================================================
 */

const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  referenceId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  }, // UUID v4 used in telecom API
  transactionId: { 
    type: String, 
    index: true 
  }, // External financial transaction ID from MTN / Airtel
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  event: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Event', 
    required: true 
  },
  ticketTier: { 
    type: String, 
    default: 'Standard' 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  currency: { 
    type: String, 
    default: 'RWF' 
  },
  phoneNumber: { 
    type: String, 
    required: true 
  },
  provider: { 
    type: String, 
    enum: ['MTN_MOMO', 'AIRTEL_MONEY', 'SIMULATED'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED'], 
    default: 'PENDING',
    index: true
  },
  statusMessage: { 
    type: String 
  },
  ticketGenerated: { 
    type: Boolean, 
    default: false 
  },
  registration: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Registration' 
  },
  rawProviderResponse: { 
    type: mongoose.Schema.Types.Mixed 
  },
  environment: { 
    type: String, 
    enum: ['sandbox', 'production', 'simulation'], 
    default: 'production' 
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
