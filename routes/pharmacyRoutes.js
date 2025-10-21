const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const Prescription = require('../models/Prescription');

// pharmacy dashboard - show prescriptions assigned to this pharmacy (sentToPharmacies includes their id)
router.get('/dashboard', requireRole('pharmacy'), async (req, res) => {
  const pres = await Prescription.find({ sentToPharmacies: req.user._id }).populate('doctor patient').sort({ createdAt: -1 });
  res.render('pharmacy_dashboard', { user: req.user, pres });
});

// accept prescription
router.post('/accept/:prescriptionId', requireRole('pharmacy'), async (req, res) => {
  try {
    const pres = await Prescription.findById(req.params.prescriptionId);
    if (!pres) return res.json({ ok: false });
    pres.acceptedBy = req.user._id;
    await pres.save();
    const io = req.app.get('io');
    io.to(`patient-${pres.patient}`).emit('prescriptionAccepted', { prescriptionId: pres._id, pharmacyId: req.user._id, pharmacyName: req.user.name });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
