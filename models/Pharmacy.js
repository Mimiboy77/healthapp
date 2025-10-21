const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const pharmacySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  licenseNumber: String,
  licenseFile: String,
  inventory: [{ name: String, qty: Number, price: Number }]
});

module.exports = mongoose.model('Pharmacy', pharmacySchema);
