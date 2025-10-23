const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const User = require('../models/User');

// ==============================
// GET WALLET PAGE
// ==============================
router.get('/wallet', ensureAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();

    // If user doesn't yet have Hedera details, initialize defaults
    if (!user.hederaAccountId) {
      await User.updateOne(
        { _id: req.user._id },
        { hederaAccountId: '0.0.pending', walletBalance: user.walletBalance || 100 }
      );
      user.hederaAccountId = '0.0.pending';
      user.walletBalance = user.walletBalance || 100;
    }

    res.render('wallet', { user });
  } catch (err) {
    console.error('Wallet load error:', err);
    res.status(500).send('Error loading wallet');
  }
});

// ==============================
// POST REFRESH BALANCE
// (In production, fetch from Hedera)
// ==============================
router.post('/wallet/refresh', ensureAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Simulate sync or random network drift
    const randomChange = (Math.random() * 2 - 1).toFixed(2); // between -1 and +1
    user.walletBalance = Math.max(0, user.walletBalance + parseFloat(randomChange));

    await user.save();

    res.redirect('/wallet');
  } catch (err) {
    console.error('Wallet refresh error:', err);
    res.status(500).send('Could not refresh balance');
  }
});

module.exports = router;
