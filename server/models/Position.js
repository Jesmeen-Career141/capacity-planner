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
    enum: ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision', 'Reactivated'],
    default: 'Yet to Activate'
  },
  isReactivated: {
    type: Boolean,
    default: false
  },
  reactivatedAt: {
    type: Date,
    default: null
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
  // NEW: parallel assignees (array of TA ObjectIds)
  parallelAssignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA'
  }],
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
  placedAt: {
    type: Date,
    default: null
  },
  completionPercent: {
    type: Number,
    enum: [0, 25, 50, 75, 100],
    default: 0
  },
  cvCount: {
    type: Number,
    default: null
  },
  targetCvCount: {
    type: Number,
    default: null
  },
  interviewedCount: {
    type: Number,
    default: null
  },
  secondInterviewCount: {
    type: Number,
    default: null
  },
  packageRange: {
    type: String,
    default: ''
  },
  salary: {
    type: new mongoose.Schema({
      currency: {
        type: String,
        enum: ['USD', 'LKR', 'SAR', 'BDT', 'AED', 'EUR', 'GBP', 'QAR', 'Other'],
        default: 'USD'
      },
      salaryType: {
        type: String,
        enum: ['range', 'fixed', 'negotiable', 'confidential', 'tbc'],
        default: 'range'
      },
      minAmount: {
        type: Number,
        min: [0, 'Minimum amount must be non-negative'],
        default: null
      },
      maxAmount: {
        type: Number,
        min: [0, 'Maximum amount must be non-negative'],
        default: null
      },
      period: {
        type: String,
        enum: ['monthly', 'annual', 'hourly', 'other'],
        default: 'monthly'
      },
      basis: {
        type: String,
        enum: ['gross', 'net', 'basic', 'totalPackage', 'unspecified'],
        default: 'unspecified'
      },
      notes: {
        type: String,
        trim: true,
        default: ''
      }
    }, { _id: false }),
    default: null
  },
  extShortlistCount: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  highlightColor: {
    type: String,
    enum: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', null],
    default: null
  },
  flagOverrides: {
    followUp:  { type: String, enum: ['auto', 'on', 'off'], default: 'auto' },
    addOn:     { type: String, enum: ['auto', 'on', 'off'], default: 'auto' },
    backup:    { type: String, enum: ['auto', 'on', 'off'], default: 'auto' },
    goingGood: { type: String, enum: ['auto', 'on', 'off'], default: 'auto' },
    reAssign:  { type: String, enum: ['auto', 'on', 'off'], default: 'auto' }
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

positionSchema.pre('validate', function() {
  if (this.salary && this.salary.minAmount != null && this.salary.maxAmount != null) {
    if (this.salary.minAmount > this.salary.maxAmount) {
      this.invalidate('salary.minAmount', 'Minimum salary amount cannot exceed maximum salary amount');
    }
  }
});

module.exports = mongoose.model('Position', positionSchema);