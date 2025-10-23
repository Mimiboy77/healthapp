const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const Prescription = require('../models/Prescription');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// ==========================
// Pharmacy Dashboard
// ==========================
router.get('/dashboard', requireRole('pharmacy'), async (req, res) => {
  try {
    const prescriptions = await Prescription.find({
      sentToPharmacies: req.user._id,
    })
      .populate('doctor patient')
      .sort({ createdAt: -1 });

    res.render('pharmacy_dashboard', { user: req.user, pres: prescriptions });
  } catch (err) {
    console.error('Pharmacy dashboard error:', err);
    res.status(500).send('Error loading pharmacy dashboard');
  }
});

// ==========================
// Accept Prescription
// ==========================
router.post('/accept/:prescriptionId', requireRole('pharmacy'), async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.prescriptionId)
      .populate('doctor patient');

    if (!prescription) {
      return res.status(404).json({ ok: false, msg: 'Prescription not found' });
    }

    // Mark pharmacy as accepted
    prescription.acceptedBy = req.user._id;
    prescription.status = 'accepted';
    await prescription.save();

    // Optional: Log acceptance as a transaction
    const tx = await Transaction.create({
      transactionRef: `RX-${Date.now()}`,
      from: prescription.patient?._id || null,
      to: req.user._id,
      amount: 0, // Later can represent HBAR cost of drugs
      type: 'pharmacy',
      meta: { prescriptionId: prescription._id },
    });

    // Notify patient if connected
    const io = req.app.get('io');
    if (io && prescription.patient?._id) {
      io.to(`patient-${prescription.patient._id}`).emit('prescriptionAccepted', {
        prescriptionId: prescription._id,
        pharmacyId: req.user._id,
        pharmacyName: req.user.name,
      });
    }

    res.json({ ok: true, msg: 'Prescription accepted', txRef: tx.transactionRef });
  } catch (err) {
    console.error('Prescription accept error:', err);
    res.status(500).json({ ok: false, msg: 'Server error accepting prescription' });
  }
});

// ==========================
// Mark Prescription as Completed
// (Pharmacy finishes delivery/dispense)
// ==========================
router.post('/complete/:prescriptionId', requireRole('pharmacy'), async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.prescriptionId)
      .populate('patient doctor');

    if (!prescription || prescription.acceptedBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ ok: false, msg: 'Not authorized or prescription not found' });
    }

    prescription.status = 'completed';
    prescription.completedAt = new Date();
    await prescription.save();

    // Notify patient of completion
    const io = req.app.get('io');
    if (io && prescription.patient?._id) {
      io.to(`patient-${prescription.patient._id}`).emit('prescriptionCompleted', {
        prescriptionId: prescription._id,
      });
    }

    res.json({ ok: true, msg: 'Prescription marked as completed' });
  } catch (err) {
    console.error('Prescription complete error:', err);
    res.status(500).json({ ok: false, msg: 'Error completing prescription' });
  }
});

module.exports = router;
