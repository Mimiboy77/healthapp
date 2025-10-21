const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const User = require('../models/User');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');

// Helper to sort nearby doctors
function distanceApprox(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) + Math.abs((a?.lng || 0) - (b?.lng || 0));
}

// ==========================
// DASHBOARD: Show nearest approved doctors
// ==========================
router.get('/dashboard', requireRole('patient'), async (req, res) => {
  try {
    const patient = req.user;
    const doctors = await User.find({ role: 'doctor', approved: true }).lean();

    doctors.sort(
      (A, B) => distanceApprox(A.location, patient.location) - distanceApprox(B.location, patient.location)
    );

    res.render('patient_dashboard', { user: patient, doctors });
  } catch (err) {
    console.error('Patient dashboard error:', err);
    res.status(500).send('Error loading dashboard');
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
// REQUEST CONSULTATION
// ==========================
router.post('/request/:doctorId', requireRole('patient'), async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    const patientId = req.user._id;

    // Only allow one active consultation with the same doctor
    let cons = await Consultation.findOne({
      patient: patientId,
      doctor: doctorId,
      status: { $in: ['pending', 'accepted'] },
    });

    if (!cons) {
      cons = await Consultation.create({ patient: patientId, doctor: doctorId, status: 'pending' });
    }

    // Notify doctor via Socket.IO
    const io = req.app.get('io');
    io.to(`doctor-${doctorId}`).emit('newRequest', { patientId });

    res.redirect('/patient/consultations');
  } catch (err) {
    console.error('Consultation request error:', err);
    res.status(500).send('Request failed');
  }
});

// ==========================
// REQUEST NEW DOCTOR (after completed consultation)
// ==========================
router.post('/request/new', requireRole('patient'), async (req, res) => {
  try {
    // Mark any completed consultations as ended (if needed)
    await Consultation.updateMany(
      { patient: req.user._id, status: 'completed' },
      { $set: { ended: true } }
    );

    // Redirect to dashboard to select a new doctor
    res.redirect('/patient/dashboard');
  } catch (err) {
    console.error('New doctor request error:', err);
    res.status(500).send('Error requesting new doctor');
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

    const chatPartner = consultation.doctor; // doctor is chat partner
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

// ==========================
// PRESCRIPTION NOTIFICATIONS (Socket)
// ==========================
router.get('/notifications', requireRole('patient'), (req, res) => {
  res.json({ ok: true, message: 'Notifications handled via Socket.IO' });
});

module.exports = router;
