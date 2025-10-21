const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const prescriptionSchema = new Schema({
  consultation: { type: Schema.Types.ObjectId, ref: 'Consultation' },
  doctor: { type: Schema.Types.ObjectId, ref: 'User' },
  patient: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [{ name: String, dose: String, qty: Number }],
  createdAt: { type: Date, default: Date.now },
  sentToPharmacies: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Prescription', prescriptionSchema);
