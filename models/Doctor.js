const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const doctorSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  specialization: String,
  licenseNumber: String,
  licenseFile: String,
  bio: String
});

module.exports = mongoose.model('Doctor', doctorSchema);
