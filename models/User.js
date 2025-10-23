const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // to generate unique account numbers

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { type: String, required: true },

  role: {
    type: String,
    enum: ['patient', 'doctor', 'pharmacy', 'admin'],
    required: true
  },

  approved: { type: Boolean, default: false },

  // ==========================================
  // WALLET SYSTEM (ENHANCED)
  // ==========================================
  hederaAccountId: { type: String, default: null },  // e.g., 0.0.xxxxxx
  privateKey: { type: String, default: null },
  walletBalance: { type: Number, default: 0 },       // current HBAR balance
  accountNumber: { type: String, unique: true },     // local wallet ID (e.g., ACCT-XXXX)
  walletTransactions: [
    {
      type: {
        type: String, // 'credit' or 'debit'
        enum: ['credit', 'debit'],
      },
      amount: Number,
      description: String,
      date: { type: Date, default: Date.now }
    }
  ],

  // ==========================================
  // GEOLOCATION
  // ==========================================
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },

  createdAt: { type: Date, default: Date.now }
});

// ==========================================
// PASSWORD HASHING
// ==========================================
userSchema.pre('save', async function (next) {
  try {
    // Hash password if modified
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }

    // Generate unique account number if not set
    if (!this.accountNumber) {
      this.accountNumber = 'ACCT-' + uuidv4().split('-')[0].toUpperCase();
    }

    // Default 100 HBAR for new patients
    if (this.isNew && this.role === 'patient' && this.walletBalance === 0) {
      this.walletBalance = 100;
      this.walletTransactions.push({
        type: 'credit',
        amount: 100,
        description: 'Signup bonus'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
});

// ==========================================
// PASSWORD CHECK METHOD
// ==========================================
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ==========================================
// WALLET UTILITY METHODS
// ==========================================
userSchema.methods.updateBalance = async function (amount, description = '') {
  const type = amount >= 0 ? 'credit' : 'debit';
  this.walletBalance = Math.max(0, this.walletBalance + amount);
  this.walletTransactions.push({ type, amount: Math.abs(amount), description });
  await this.save();
  return this.walletBalance;
};

module.exports = mongoose.model('User', userSchema);
