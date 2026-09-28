const mongoose = require('mongoose');

const positionStrategySchema = new mongoose.Schema({
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: true
  },
  strategy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Strategy',
    required: true
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'done', 'na'],
    default: 'not_started'
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA'
  }],
  assignedDate: {
    type: Date,
    default: null
  },
  doneDate: {
    type: Date,
    default: null
  },
  note: {
    type: String,
    default: '',
    trim: true
  }
}, { timestamps: true });

// Unique compound index – prevents duplicate rows and makes upserts race-safe
positionStrategySchema.index({ position: 1, strategy: 1 }, { unique: true });

module.exports = mongoose.model('PositionStrategy', positionStrategySchema);
