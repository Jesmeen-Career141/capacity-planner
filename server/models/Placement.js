const mongoose = require('mongoose');

const PLACEMENT_STATUS_VALUES = ['Offer Accepted', 'Joined', 'Probation Passed', 'Cancelled'];

const placementSchema = new mongoose.Schema({
  placementId: {
    type: String,
    required: [true, 'Placement ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  candidateSubmission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateSubmission',
    required: [true, 'Candidate submission reference is required'],
    index: true
  },
  candidateName: {
    type: String,
    required: [true, 'Candidate name is required'],
    trim: true
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
  positionName: {
    type: String,
    required: [true, 'Position name is required'],
    trim: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client reference is required'],
    index: true
  },
  clientName: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  attempt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PositionAttempt',
    required: [true, 'Recruitment attempt reference is required'],
    index: true
  },
  attemptId: {
    type: String,
    trim: true,
    default: null
  },
  attemptNumber: {
    type: Number,
    default: null
  },
  placedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null,
    index: true
  },
  sourcingTA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null,
    index: true
  },
  placementDate: {
    type: Date,
    required: [true, 'Placement date is required'],
    default: Date.now,
    index: true
  },
  placementDateStr: {
    type: String,
    required: [true, 'Placement date string (YYYY-MM-DD) is required'],
    trim: true
  },
  status: {
    type: String,
    enum: PLACEMENT_STATUS_VALUES,
    default: 'Joined',
    index: true
  },
  salary: {
    type: Number,
    default: 0
  },
  packageDetails: {
    type: String,
    trim: true,
    default: ''
  },
  billingAmount: {
    type: Number,
    default: 0
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
  }
}, { timestamps: true });

// Prevent duplicate active placement of the exact same candidate submission
placementSchema.index({ candidateSubmission: 1, position: 1 }, { unique: true });

const Placement = mongoose.model('Placement', placementSchema);

module.exports = {
  Placement,
  PLACEMENT_STATUS_VALUES
};
