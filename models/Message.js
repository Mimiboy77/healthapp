const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true },
  senderRole: { type: String, enum: ['patient','doctor'], required: true },
  senderUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  file: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);

