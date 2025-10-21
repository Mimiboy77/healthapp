const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const activitySchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: String,
  targetRole: String,
  targetId: Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Activity', activitySchema);
