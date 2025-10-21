const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');

// For simplicity: admin authentication is via role 'admin' user created manually.
// admin dashboard
router.get('/dashboard', async (req, res) => {
  // require admin session
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login/admin');
  const doctors = await User.find({ role: 'doctor' }).lean();
  const pharmacies = await User.find({ role: 'pharmacy' }).lean();
  const patients = await User.find({ role: 'patient' }).lean();
  res.render('admin_dashboard', { doctors, pharmacies, patients });
});

// approve doctor
router.post('/approve/doctor/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ ok: false });
  const user = await User.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  await Activity.create({ actor: req.session.user._id, action: 'approve', targetRole: 'doctor', targetId: user._id });
  res.json({ ok: true });
});

// approve pharmacy
router.post('/approve/pharmacy/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ ok: false });
  const user = await User.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  await Activity.create({ actor: req.session.user._id, action: 'approve', targetRole: 'pharmacy', targetId: user._id });
  res.json({ ok: true });
});

// delete a user
router.delete('/delete/:role/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ ok: false });
  const { role, id } = req.params;
  await User.findByIdAndDelete(id);
  await Activity.create({ actor: req.session.user._id, action: 'delete', targetRole: role, targetId: id });
  res.json({ ok: true });
});

// activity log
router.get('/activity', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login/admin');
  const logs = await Activity.find().populate('actor').sort({ createdAt: -1 });
  res.render('activity', { logs });
});

module.exports = router;
