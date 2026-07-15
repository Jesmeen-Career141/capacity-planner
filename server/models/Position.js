const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  jobOrderId: {
    type: String,
    required: true,
    trim: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  position: {
    type: String,
    required: true,
    trim: true
  },
  pLevel: {
    type: String,
    enum: ['P1', 'P2', 'P3', 'P4', 'P5'],
    required: true
  },
  status: {
    type: String,
    enum: ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost'],
    default: 'Yet to Activate'
  },
  pipelineStage: {
    type: String,
    enum: ['Hunting', 'Shortlisted', 'Client Review', 'Interview', 'Offer', 'Placed'],
    default: 'Hunting'
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  },
  transferParallel: {
    type: String,
    enum: ['New', 'Transfer', 'Parallel'],
    default: 'New'
  },
  dateAssigned: {
    type: Date,
    default: null
  },
  expectedCloseDate: {
    type: Date,
    default: null
  },
  completionPercent: {
    type: Number,
    enum: [0, 25, 50, 75, 100],
    default: 0
  },
  lsCount: {
    type: Number,
    default: null
  },
  cvCount: {
    type: Number,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  allocationRounds: [{
    taAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'TA' },
    roundNumber: Number,
    dateAssigned: { type: Date, default: Date.now },
    reason: String,
    cvCountAtRound: Number
  }],
  thisWeekFocus: {
    type: String,
    default: ''
  },
  remarks: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Position', positionSchema);
