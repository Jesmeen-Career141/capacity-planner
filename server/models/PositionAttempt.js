const mongoose = require('mongoose');

const positionAttemptSchema = new mongoose.Schema({
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position reference is required'],
    index: true
  },
  attemptNumber: {
    type: Number,
    required: [true, 'Attempt number is required'],
    min: [1, 'Attempt number must be at least 1']
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Reopened', 'Abandoned'],
    default: 'Active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  primaryTA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  },
  outcome: {
    type: String,
    enum: ['In Progress', 'Placed', 'Lost', 'Cancelled', 'Reopened'],
    default: 'In Progress'
  },
  reopenReason: {
    type: String,
    trim: true,
    default: ''
  },
  // Attempt-level target: Required number of Good CVs for this recruitment attempt
  requiredGoodCvTarget: {
    type: Number,
    default: 0,
    min: [0, 'Required Good CV target cannot be negative']
  },
  // Captures legacy scalar metrics from Position at the time of attempt creation
  // for baseline reference and audit history, without mutating Position itself.
  legacySnapshot: {
    cvCount: { type: Number, default: null },
    extShortlistCount: { type: mongoose.Schema.Types.Mixed, default: null },
    lsCount: { type: Number, default: null },
    targetCvCount: { type: Number, default: null }
  }
}, { timestamps: true });

// Ensure attempt numbers are strictly unique per position (Attempt 1, 2, 3...)
positionAttemptSchema.index({ position: 1, attemptNumber: 1 }, { unique: true });

// Partial unique index: strictly prevent duplicate 'Active' attempts for the same position.
// A position may have multiple 'Completed', 'Reopened', or 'Abandoned' attempts, but at most ONE 'Active' attempt.
positionAttemptSchema.index(
  { position: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Active' } }
);

module.exports = mongoose.model('PositionAttempt', positionAttemptSchema);
