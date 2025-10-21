const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const validator = require('validator');

const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Pharmacy = require('../models/Pharmacy');
const Activity = require('../models/Activity');

// multer storage to /public/uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage });

// Select role
router.get('/select-role', (req, res) => {
  res.render('selectRole');
});

// Registration forms
router.get('/register/:role', (req, res) => {
  const role = req.params.role;
  if (!['patient','doctor','pharmacy'].includes(role)) return res.redirect('/select-role');
  res.render(`register_${role}`, { role });
});

// Registration post
router.post('/register/:role', upload.single('licenseFile'), async (req, res) => {
  try {
    const role = req.params.role;
    const { name, email, password, lat, lng } = req.body;
    if (!name || !email || !password) return res.send('Missing fields');

    if (!validator.isEmail(email)) return res.send('Invalid email');

    const exists = await User.findOne({ email });
    if (exists) return res.send('Email already used');

    const approved = role === 'patient'; // patients auto-approved
    const user = new User({
      name, email, password, role, location: { lat: lat || 0, lng: lng || 0 }, approved
    });
    await user.save();

    if (role === 'patient') {
      await Patient.create({ user: user._id, medication: req.body.medication || '', diagnosis: req.body.diagnosis || '' });
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

    await Activity.create({ actor: user._id, action: 'register', targetRole: role, targetId: user._id });

    res.redirect(`/login/${role}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error during registration');
  }
});

// Login form
router.get('/login/:role', (req, res) => {
  const role = req.params.role;
  if (!['patient','doctor','pharmacy','admin'].includes(role)) return res.redirect('/select-role');
  res.render('login', { role });
});

// Login post
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

    // set session (store minimal)
    req.session.user = { _id: user._id, name: user.name, role: user.role };
    req.session.save(() => {
      res.redirect(`/${role}/dashboard`);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Login error');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/select-role'));
});

module.exports = router;
