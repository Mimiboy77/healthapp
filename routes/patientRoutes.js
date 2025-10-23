const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const { randomUUID } = require('crypto');

// Helper to approximate nearby doctors
function distanceApprox(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) + Math.abs((a?.lng || 0) - (b?.lng || 0));
}

// ==========================
// PATIENT DASHBOARD – Nearest approved doctors
// ==========================
router.get('/dashboard', requireRole('patient'), async (req, res) => {
  try {
    const patient = await User.findById(req.user._id);
    const doctors = await User.find({ role: 'doctor', approved: true }).lean();

    // Sort doctors by proximity
    doctors.sort(
      (A, B) => distanceApprox(A.location, patient.location) - distanceApprox(B.location, patient.location)
    );

    res.render('patient_dashboard', {
      user: patient,
      doctors,
      wallet: { balance: patient.walletBalance }
    });
  } catch (err) {
    console.error('Patient dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ==========================
// WALLET PAGE
// ==========================
router.get('/wallet', requireRole('patient'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render('wallet', { user });
  } catch (err) {
    console.error('Wallet view error:', err);
    res.status(500).send('Error loading wallet page');
  }
});

// ==========================
// UPDATE LOCATION
// ==========================
router.post('/location', requireRole('patient'), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      location: { lat: parseFloat(lat) || 0, lng: parseFloat(lng) || 0 },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ ok: false });
  }
});

// ==========================
// REQUEST CONSULTATION – Deducts 10 HBAR (9 doctor, 1 admin)
// ==========================
router.post('/request/:doctorId', requireRole('patient'), async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    const patient = await User.findById(req.user._id);
    const doctor = await User.findById(doctorId);
    const admin = await User.findOne({ role: 'admin' });

    if (!patient || !doctor) {
      return res.status(400).send('Doctor or patient not found.');
    }

    const fee = 10;
    const adminFee = 1;
    const doctorShare = fee - adminFee;

    // Ensure sufficient funds
    if (patient.walletBalance < fee) {
      return res.send('❌ Insufficient balance. You need at least 10 HBAR.');
    }

    // Prevent duplicate active consultation
    const existing = await Consultation.findOne({
      patient: patient._id,
      doctor: doctor._id,
      status: { $in: ['pending', 'accepted'] },
    });
    if (existing) {
      return res.send('⚠️ You already have an active consultation with this doctor.');
    }

    // Perform wallet updates
    await patient.updateBalance(-fee, `Consultation with Dr. ${doctor.name}`);
    await doctor.updateBalance(doctorShare, `Consultation from ${patient.name}`);
    if (admin) await admin.updateBalance(adminFee, 'Admin consultation fee');

    // Record transaction
    const tx = await Transaction.create({
      transactionRef: randomUUID(),
      from: patient._id,
      to: doctor._id,
      amount: doctorShare,
      fee: adminFee,
      type: 'consultation',
      meta: { note: 'Consultation payment via wallet' },
    });

    // Create consultation
    const cons = await Consultation.create({
      patient: patient._id,
      doctor: doctor._id,
      status: 'pending',
      transactionRef: tx.transactionRef,
    });

    // Notify doctor via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`doctor-${doctor._id}`).emit('newRequest', {
        patientId: patient._id,
        consultationId: cons._id,
      });
    }

    res.redirect('/patient/consultations');
  } catch (err) {
    console.error('Consultation request error:', err);
    res.status(500).send('Request failed');
  }
});

// ==========================
// VIEW CONSULTATIONS
// ==========================
router.get('/consultations', requireRole('patient'), async (req, res) => {
  try {
    const list = await Consultation.find({ patient: req.user._id })
      .populate('doctor')
      .sort({ createdAt: -1 });

    res.render('consultations', { list, role: 'patient' });
  } catch (err) {
    console.error('Consultation list error:', err);
    res.status(500).send('Error loading consultations');
  }
});

// ==========================
// CHAT ROOM (Patient ↔ Doctor)
// ==========================
router.get('/chat/:consultationId', requireRole('patient'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.consultationId)
      .populate('doctor patient');

    if (!consultation || consultation.patient._id.toString() !== req.user._id.toString()) {
      return res.status(404).send('Consultation not found');
    }

    const chatPartner = consultation.doctor;
    const room = `consultation-${consultation._id}`;

    res.render('chat_room', {
      consultation,
      user: req.user,
      chatPartner,
      room
    });
  } catch (err) {
    console.error('Chat room load error:', err);
    res.status(500).send('Chat error');
  }
});

// ==========================
// VIEW PRESCRIPTIONS
// ==========================
router.get('/prescriptions', requireRole('patient'), async (req, res) => {
  try {
    const pres = await Prescription.find({ patient: req.user._id })
      .populate('doctor')
      .sort({ createdAt: -1 });

    res.render('patient_prescriptions', { pres });
  } catch (err) {
    console.error('Prescription view error:', err);
    res.status(500).send('Error loading prescriptions');
  }
});

module.exports = router;
