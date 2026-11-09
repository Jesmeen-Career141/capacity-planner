const mongoose = require('mongoose');
const { getNextSequence } = require('./ActivityCounter');

const ATTEMPT_STATUS_VALUES = ['Active', 'Completed', 'On Hold', 'Cancelled', 'Reopened', 'Abandoned'];

const positionAttemptSchema = new mongoose.Schema({
  attemptId: {
    type: String,
    trim: true,
    index: true,
    sparse: true
  },
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position reference is required'],
    index: true
  },
  jobOrderId: {
    type: String,
    trim: true,
    default: ''
  },
  attemptNumber: {
    type: Number,
    required: [true, 'Attempt number is required'],
    min: [1, 'Attempt number must be at least 1']
  },
  attemptNumberFormatted: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ATTEMPT_STATUS_VALUES,
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
  supportingTAs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA'
  }],
  outcome: {
    type: String,
    enum: ['In Progress', 'Placed', 'Lost', 'Cancelled', 'Reopened'],
    default: 'In Progress'
  },
  reason: {
    type: String,
    trim: true,
    default: ''
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
  placementCount: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: String,
    trim: true,
    default: 'Coordinator'
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
// A position may have multiple 'Completed', 'Reopened', 'Cancelled', or 'Abandoned' attempts, but at most ONE 'Active' attempt.
positionAttemptSchema.index(
  { position: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Active' } }
);

/**
 * Concurrency-safe helper to allocate the next sequential attempt for a position.
 */
positionAttemptSchema.statics.allocateNextAttempt = async function(positionId) {
  const latest = await this.findOne({ position: positionId })
    .sort({ attemptNumber: -1 })
    .select('attemptNumber')
    .lean();

  const nextNumber = latest ? latest.attemptNumber + 1 : 1;
  const attemptId = await getNextSequence('position_attempt', 'ATT-', 4);

  return {
    attemptNumber: nextNumber,
    attemptId,
    attemptNumberFormatted: `Attempt ${String(nextNumber).padStart(2, '0')}`
  };
};

// Prevent primaryTA from being duplicated in supportingTAs, and prevent duplicate supportingTAs
positionAttemptSchema.pre('validate', function() {
  if (this.attemptNumber && !this.attemptNumberFormatted) {
    this.attemptNumberFormatted = `Attempt ${String(this.attemptNumber).padStart(2, '0')}`;
  }

  if (Array.isArray(this.supportingTAs) && this.supportingTAs.length > 0) {
    const primaryStr = this.primaryTA ? String(this.primaryTA._id || this.primaryTA) : null;
    const seen = new Set();

    for (const ta of this.supportingTAs) {
      const taStr = ta ? String(ta._id || ta) : null;
      if (!taStr) continue;
      if (primaryStr && taStr === primaryStr) {
        this.invalidate('supportingTAs', 'Primary TA cannot also be assigned as a supporting TA');
        break;
      }
      if (seen.has(taStr)) {
        this.invalidate('supportingTAs', 'Duplicate supporting TA assignment is not allowed');
        break;
      }
      seen.add(taStr);
    }
  }
});

module.exports = mongoose.model('PositionAttempt', positionAttemptSchema);
