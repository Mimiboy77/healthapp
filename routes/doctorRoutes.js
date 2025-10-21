const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const User = require('../models/User');

// Helper to calculate simple distance
function distanceApprox(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) + Math.abs((a?.lng || 0) - (b?.lng || 0));
}

// ==========================
// Doctor dashboard: pending, accepted, completed
// ==========================
router.get('/dashboard', requireRole('doctor'), async (req, res) => {
  try {
    const [pending, accepted, completed] = await Promise.all([
      Consultation.find({ doctor: req.user._id, status: 'pending' }).populate('patient').sort({ createdAt: -1 }),
      Consultation.find({ doctor: req.user._id, status: 'accepted' }).populate('patient').sort({ createdAt: -1 }),
      Consultation.find({ doctor: req.user._id, status: 'completed' }).populate('patient').sort({ createdAt: -1 }),
    ]);

    res.render('doctor_dashboard', { user: req.user, pending, accepted, completed });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ==========================
// Accept consultation
// ==========================
router.post('/approve/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const cons = await Consultation.findOneAndUpdate(
      { _id: consultationId, doctor: req.user._id },
      { status: 'accepted' },
      { new: true }
    ).populate('patient doctor');

    if (!cons) return res.status(404).json({ ok: false, msg: 'Consultation not found' });

    const io = req.app.get('io');
    if (io && cons.patient?._id) {
      io.to(`patient-${cons.patient._id}`).emit('consultationAccepted', {
        consultationId: cons._id,
        doctorId: req.user._id,
        doctorName: req.user.name,
      });
    }

    res.json({ ok: true, redirect: `/doctor/chat/${cons._id}` });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ ok: false });
  }
});

// ==========================
// Decline consultation
// ==========================
router.post('/decline/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const cons = await Consultation.findOneAndUpdate(
      { _id: consultationId, doctor: req.user._id, status: 'pending' },
      { status: 'declined' },
      { new: true }
    ).populate('patient');

    if (!cons) return res.status(404).json({ ok: false, msg: 'Not found' });

    const io = req.app.get('io');
    if (io && cons.patient?._id) {
      io.to(`patient-${cons.patient._id}`).emit('consultationDeclined', { consultationId });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Decline error:', err);
    res.status(500).json({ ok: false });
  }
});

// ==========================
// Chat room (doctor ↔ patient)
// ==========================
router.get('/chat/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.consultationId).populate('patient doctor');

    if (!consultation || consultation.doctor._id.toString() !== req.user._id.toString()) {
      return res.status(404).send('Consultation not found');
    }

    const chatPartner = consultation.patient;
    const room = `consultation-${consultation._id}`;

    res.render('chat_room', {
      room,
      user: req.user,
      consultation,
      chatPartner,
    });
  } catch (err) {
    console.error('Chat load error:', err);
    res.status(500).send('Chat error');
  }
});

// ==========================
// Prescribe medicine page
// ==========================
router.get('/prescribe/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.consultationId).populate('patient doctor');
    if (!consultation || consultation.doctor._id.toString() !== req.user._id.toString()) {
      return res.status(404).send('Consultation not found');
    }
    res.render('prescribe', { consultation, user: req.user });
  } catch (err) {
    console.error('Load prescribe page error:', err);
    res.status(500).send('Error loading prescribe page');
  }
});

// ==========================
// Handle prescription submission
// ==========================
router.post('/prescribe/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const consultation = await Consultation.findById(consultationId).populate('patient doctor');
    if (!consultation) return res.status(404).send('Consultation not found');

    // Convert form fields into array of items
    let items = [];
    if (Array.isArray(req.body.name)) {
      for (let i = 0; i < req.body.name.length; i++) {
        items.push({
          name: req.body.name[i],
          dose: req.body.dose[i],
          qty: parseInt(req.body.qty[i], 10),
        });
      }
    } else {
      items.push({
        name: req.body.name,
        dose: req.body.dose,
        qty: parseInt(req.body.qty, 10),
      });
    }

    const pres = await Prescription.create({
      consultation: consultation._id,
      doctor: req.user._id,
      patient: consultation.patient._id,
      items,
    });

    // Nearby pharmacies (top 3)
    let pharmacies = await User.find({ role: 'pharmacy', approved: true }).lean();
    pharmacies = pharmacies.filter(p => p._id);
    pharmacies.sort((A, B) => distanceApprox(A.location, req.user.location) - distanceApprox(B.location, req.user.location));
    const top = pharmacies.slice(0, 3);

    pres.sentToPharmacies = top.map(p => p._id);
    await pres.save();

    const io = req.app.get('io');
    if (!io) throw new Error('Socket.IO not initialized');

    // Notify pharmacies
    top.forEach(p => {
      if (p._id) {
        io.to(`pharmacy-${p._id}`).emit('newPrescription', {
          prescriptionId: pres._id,
          fromDoctor: req.user.name,
        });
      }
    });

    // Notify patient
    if (consultation.patient?._id) {
      io.to(`patient-${consultation.patient._id}`).emit('prescribed', { prescriptionId: pres._id });
    }

    // Mark consultation completed
    consultation.status = 'completed';
    await consultation.save();

    res.send('Prescription sent successfully!');
  } catch (err) {
    console.error('Prescribe error:', err);
    res.status(500).send('Error sending prescription');
  }
});

// ==========================
// End consultation manually
// ==========================
router.post('/end/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const consultation = await Consultation.findById(consultationId).populate('patient doctor');
    if (!consultation || consultation.doctor._id.toString() !== req.user._id.toString()) {
      return res.status(404).json({ ok: false, msg: 'Consultation not found' });
    }

    consultation.status = 'completed';
    await consultation.save();

    const io = req.app.get('io');
    if (io && consultation.patient?._id) {
      io.to(`patient-${consultation.patient._id}`).emit('consultationEnded', { consultationId: consultation._id });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('End consultation error:', err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
