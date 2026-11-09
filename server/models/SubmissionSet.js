const mongoose = require('mongoose');
const { ActivityCounter, getNextSequence } = require('./ActivityCounter');

const submissionSetSchema = new mongoose.Schema({
  submissionSetId: {
    type: String,
    required: [true, 'submissionSetId is required'],
    unique: true,
    trim: true,
    index: true
  },
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position reference is required'],
    index: true
  },
  jobOrderId: {
    type: String,
    required: [true, 'Job Order ID is required'],
    trim: true,
    index: true
  },
  setNumber: {
    type: String,
    required: [true, 'Set number (e.g. Set 01) is required'],
    trim: true
  },
  setSequence: {
    type: Number,
    required: [true, 'Set sequence number is required'],
    min: 1
  },
  sentToClientAt: {
    type: Date,
    required: [true, 'Date sent to client is required']
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  },
  sourcingTAs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA'
  }],
  cvCount: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  attempt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PositionAttempt',
    default: null
  },
  dailyActivity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyActivity',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  }
}, { timestamps: true });

// Prevent duplicate set numbers for the same position
submissionSetSchema.index({ position: 1, setSequence: 1 }, { unique: true });
submissionSetSchema.index({ position: 1, setNumber: 1 }, { unique: true });
submissionSetSchema.index({ position: 1, sentToClientAt: -1 });
submissionSetSchema.index({ sourcingTAs: 1 });

/**
 * Concurrency-safe helper to allocate the next sequential set number for a position.
 * Returns { setSequence, setNumber, submissionSetId }
 */
submissionSetSchema.statics.allocateNextSet = async function(positionId) {
  const counterName = `submission_set_${positionId}`;
  
  // Initialize counter from existing documents if this is the first time
  const existingCounter = await ActivityCounter.findOne({ name: counterName });
  if (!existingCounter) {
    const latestSet = await this.findOne({ position: positionId }).sort({ setSequence: -1 });
    const currentMax = latestSet ? (latestSet.setSequence || 0) : 0;
    await ActivityCounter.findOneAndUpdate(
      { name: counterName },
      { $setOnInsert: { seq: currentMax } },
      { returnDocument: 'after', upsert: true }
    );
  }

  // Atomic increment for concurrency safety
  const updated = await ActivityCounter.findOneAndUpdate(
    { name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );

  const seq = updated.seq;
  const setNumber = `Set ${String(seq).padStart(2, '0')}`;
  const submissionSetId = await getNextSequence('submissionSetId', 'SET-', 4);

  return { setSequence: seq, setNumber, submissionSetId };
};

/**
 * Recoverable allocation helper: decrements counter if creation completely aborts
 */
submissionSetSchema.statics.rollbackSetSequence = async function(positionId, allocatedSeq) {
  try {
    const counterName = `submission_set_${positionId}`;
    await ActivityCounter.findOneAndUpdate(
      { name: counterName, seq: allocatedSeq },
      { $inc: { seq: -1 } }
    );
  } catch (_) {}
};

module.exports = mongoose.model('SubmissionSet', submissionSetSchema);
