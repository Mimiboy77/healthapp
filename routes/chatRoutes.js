const express = require('express');
const router = express.Router();
const Consultation = require('../models/Consultation');

// GET: Chat page
router.get('/:consultationId', async (req, res) => {
  try {
    const cons = await Consultation.findById(req.params.consultationId)
      .populate('doctor')
      .populate('patient');

    if (!cons) return res.status(404).send('Consultation not found');

    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const role = user.role;
    const chatPartner = role === 'doctor' ? cons.patient : cons.doctor;

    res.render('chat', { cons, user, role, chatPartner });
  } catch (err) {
    console.error('Chat route error:', err);
    res.status(500).send('Server error');
  }
});

// POST: Save message (optional if using Socket.io fallback)
router.post('/:consultationId/message', async (req, res) => {
  try {
    const { message } = req.body;
    const user = req.session.user;

    if (!message || !user) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const cons = await Consultation.findById(req.params.consultationId);
    if (!cons) return res.status(404).json({ error: 'Consultation not found' });

    const newMessage = {
      sender: user.name,
      message,
      timestamp: new Date()
    };

    cons.messages.push(newMessage);
    await cons.save();

    // Emit real-time message to both users
    req.io.to(req.params.consultationId).emit('message', newMessage);

    res.json({ ok: true, message: newMessage });
  } catch (err) {
    console.error('Error saving message:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
