const mongoose = require('mongoose');

const positionHistorySchema = new mongoose.Schema({
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: true
  },
  field: {
    type: String,
    required: true
  },
  oldValue: String,
  newValue: String,
  changedBy: {
    type: String,
    default: 'Lead'
  },
  changedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PositionHistory', positionHistorySchema);
