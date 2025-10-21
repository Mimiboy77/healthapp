const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const patientSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dob: Date,
  gender: String,
  medication: String,
  diagnosis: String,
  files: [String]
});

module.exports = mongoose.model('Patient', patientSchema);
