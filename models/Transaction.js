const { randomUUID } = require('crypto');
const mongoose = require('mongoose');

const txSchema = new mongoose.Schema({
  transactionRef: { 
    type: String, 
    required: true, 
    unique: true, 
    default: () => randomUUID()  // Auto-generate unique transaction reference
  },
  hederaTxId: { type: String }, // Hedera Transaction ID (optional, from blockchain)
  
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  fromAccountNumber: { type: String },
  toAccountNumber: { type: String },

  amount: { type: Number, required: true }, // HBAR amount
  fee: { type: Number, default: 0 }, // Admin commission (10%)
  type: { 
    type: String, 
    enum: ['consultation', 'pharmacy', 'deposit', 'withdraw', 'transfer'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed'], 
    default: 'success' 
  },

  meta: mongoose.Schema.Types.Mixed, // Optional extra details
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', txSchema);
