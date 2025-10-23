const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid'); // UUID for account numbers

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Pharmacy = require('../models/Pharmacy');
const Activity = require('../models/Activity');

// multer storage for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage });

// ============================
// Select role
// ============================
router.get('/select-role', (req, res) => {
  res.render('selectRole');
});

// ============================
// Registration Form
// ============================
router.get('/register/:role', (req, res) => {
  const role = req.params.role;
  if (!['patient', 'doctor', 'pharmacy'].includes(role)) return res.redirect('/select-role');
  res.render(`register_${role}`, { role });
});

// ============================
// Registration Submit
// ============================
router.post('/register/:role', upload.single('licenseFile'), async (req, res) => {
  try {
    const role = req.params.role;
    const { name, email, password, lat, lng } = req.body;

    if (!name || !email || !password) return res.send('Missing fields');
    if (!validator.isEmail(email)) return res.send('Invalid email');

    const exists = await User.findOne({ email });
    if (exists) return res.send('Email already used');

    const approved = role === 'patient'; // auto-approve patients
    const accountNumber = 'ACCT-' + uuidv4().split('-')[0].toUpperCase();

    const user = new User({
      name,
      email,
      password,
      role,
      accountNumber,
      location: { lat: lat || 0, lng: lng || 0 },
      approved
    });
    await user.save();

    // === Create Role-Specific Record ===
    if (role === 'patient') {
      await Patient.create({
        user: user._id,
        medication: req.body.medication || '',
        diagnosis: req.body.diagnosis || ''
      });
    } else if (role === 'doctor') {
      await Doctor.create({
        user: user._id,
        specialization: req.body.specialization || '',
        licenseNumber: req.body.licenseNumber || '',
        licenseFile: req.file ? `/uploads/${req.file.filename}` : ''
      });
    } else if (role === 'pharmacy') {
      await Pharmacy.create({
        user: user._id,
        licenseNumber: req.body.licenseNumber || '',
        licenseFile: req.file ? `/uploads/${req.file.filename}` : ''
      });
    }

    // === Initialize wallet ===
    const initialBalance = role === 'patient' ? 100 : 0;
    await Wallet.create({
      user: user._id,
      accountNumber,
      balance: initialBalance,
      hbarAddress: null // placeholder for actual Hedera integration
    });

    // === Log activity ===
    await Activity.create({
      actor: user._id,
      action: 'register',
      targetRole: role,
      targetId: user._id
    });

    console.log(`✅ Registered ${role} (${email}) with account: ${accountNumber} and balance ${initialBalance} HBAR`);
    res.redirect(`/login/${role}`);

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).send('Server error during registration');
  }
});

// ============================
// Login Form
// ============================
router.get('/login/:role', (req, res) => {
  const role = req.params.role;
  if (!['patient', 'doctor', 'pharmacy', 'admin'].includes(role)) return res.redirect('/select-role');
  res.render('login', { role });
});

// ============================
// Login Submit
// ============================
router.post('/login/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const { email, password } = req.body;
    if (!email || !password) return res.send('Missing fields');

    const user = await User.findOne({ email: email.toLowerCase(), role });
    if (!user) return res.send('No such user');

    const ok = await user.comparePassword(password);
    if (!ok) return res.send('Invalid credentials');
    if (!user.approved && role !== 'patient') return res.send('Account awaiting approval');

    req.session.user = { _id: user._id, name: user.name, role: user.role };
    req.session.save(() => res.redirect(`/${role}/dashboard`));

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Login error');
  }
});

// ============================
// Logout
// ============================
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/select-role'));
});

module.exports = router;
