const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/roles');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

// Simple distance approximation helper
function distanceApprox(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) + Math.abs((a?.lng || 0) - (b?.lng || 0));
}

// ==========================
// DOCTOR DASHBOARD
// ==========================
router.get('/dashboard', requireRole('doctor'), async (req, res) => {
  try {
    const [pending, accepted, completed, wallet] = await Promise.all([
      Consultation.find({ doctor: req.user._id, status: 'pending' })
        .populate('patient')
        .sort({ createdAt: -1 }),
      Consultation.find({ doctor: req.user._id, status: 'accepted' })
        .populate('patient')
        .sort({ createdAt: -1 }),
      Consultation.find({ doctor: req.user._id, status: 'completed' })
        .populate('patient')
        .sort({ createdAt: -1 }),
      Wallet.findOne({ user: req.user._id }),
    ]);

    res.render('doctor_dashboard', {
      user: req.user,
      pending,
      accepted,
      completed,
      walletBalance: wallet ? wallet.balance.toFixed(2) : '0.00',
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ==========================
// ACCEPT CONSULTATION
// ==========================
router.post('/approve/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const cons = await Consultation.findOneAndUpdate(
      { _id: consultationId, doctor: req.user._id, status: 'pending' },
      { status: 'accepted' },
      { new: true }
    ).populate('patient doctor');

    if (!cons) return res.status(404).json({ ok: false, msg: 'Consultation not found or already handled' });

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
// DECLINE CONSULTATION
// ==========================
router.post('/decline/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const cons = await Consultation.findOneAndUpdate(
      { _id: consultationId, doctor: req.user._id, status: 'pending' },
      { status: 'declined' },
      { new: true }
    ).populate('patient');

    if (!cons) return res.status(404).json({ ok: false, msg: 'Consultation not found' });

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
// CHAT ROOM (Doctor ↔ Patient)
// ==========================
router.get('/chat/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.consultationId)
      .populate('patient doctor');

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
// PRESCRIBE MEDICINE + WALLET REWARD
// ==========================
router.post('/prescribe/:consultationId', requireRole('doctor'), async (req, res) => {
  try {
    const { consultationId } = req.params;
    const consultation = await Consultation.findById(consultationId).populate('patient doctor');
    if (!consultation) return res.status(404).send('Consultation not found');

    // Format prescription items
    const items = [];
    if (Array.isArray(req.body.name)) {
      for (let i = 0; i < req.body.name.length; i++) {
        if (req.body.name[i]) {
          items.push({
            name: req.body.name[i],
            dose: req.body.dose[i],
            qty: parseInt(req.body.qty[i], 10),
          });
        }
      }
    } else if (req.body.name) {
      items.push({
        name: req.body.name,
        dose: req.body.dose,
        qty: parseInt(req.body.qty, 10),
      });
    }

    // Create prescription
    const pres = await Prescription.create({
      consultation: consultation._id,
      doctor: req.user._id,
      patient: consultation.patient._id,
      items,
    });

    // Nearby pharmacies
    let pharmacies = await User.find({ role: 'pharmacy', approved: true }).lean();
    pharmacies.sort((A, B) => distanceApprox(A.location, req.user.location) - distanceApprox(B.location, req.user.location));
    const top = pharmacies.slice(0, 3);

    pres.sentToPharmacies = top.map(p => p._id);
    await pres.save();

    // Mark consultation completed
    consultation.status = 'completed';
    await consultation.save();

    // Reward doctor 1 HBAR
    const doctorWallet = await Wallet.findOne({ user: req.user._id });
    if (doctorWallet) {
      doctorWallet.balance += 1;
      await doctorWallet.save();

      await Transaction.create({
        from: null,
        to: req.user._id,
        amount: 1,
        type: 'bonus',
        meta: { note: 'Consultation completion reward' },
      });
    }

    // Notifications
    const io = req.app.get('io');
    top.forEach(p => io?.to(`pharmacy-${p._id}`).emit('newPrescription', { prescriptionId: pres._id, fromDoctor: req.user.name }));
    io?.to(`patient-${consultation.patient._id}`).emit('prescribed', { prescriptionId: pres._id });

    res.send('✅ Prescription sent successfully! Doctor rewarded 1 HBAR.');
  } catch (err) {
    console.error('Prescribe error:', err);
    res.status(500).send('Error sending prescription');
  }
});

// ==========================
// END CONSULTATION MANUALLY
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

    // Reward doctor manually if not rewarded yet
    const doctorWallet = await Wallet.findOne({ user: req.user._id });
    if (doctorWallet) {
      doctorWallet.balance += 1;
      await doctorWallet.save();
      await Transaction.create({
        from: null,
        to: req.user._id,
        amount: 1,
        type: 'bonus',
        meta: { note: 'Manual consultation end reward' },
      });
    }

    const io = req.app.get('io');
    io?.to(`patient-${consultation.patient._id}`).emit('consultationEnded', { consultationId: consultation._id });

    res.json({ ok: true });
  } catch (err) {
    console.error('End consultation error:', err);
    res.status(500).json({ ok: false });
  }
});
// middleware/roles.js probably sets req.session.user not req.user
router.use((req, res, next) => {
  if (req.session.user) req.user = req.session.user;
  next();
});


module.exports = router;
