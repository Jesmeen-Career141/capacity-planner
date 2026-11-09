const mongoose = require('mongoose');

const ROUND_VALUES = ['First Round', 'Second Round', 'Third Round', 'Final Round'];
const STATUS_VALUES = ['Scheduled', 'Completed', 'Cancelled', 'No Show', 'Rescheduled', 'Withdrew'];
const DECISION_VALUES = ['Reschedule', 'Pending', 'Shortlisted', 'Rejected', 'Dropped'];
const MODE_VALUES = ['Online', 'Physical', 'Telephone'];

const rescheduleEntrySchema = new mongoose.Schema({
  previousDate: {
    type: Date,
    required: true
  },
  previousDateStr: {
    type: String,
    required: true
  },
  previousTime: {
    type: String,
    required: true
  },
  newDate: {
    type: Date,
    required: true
  },
  newDateStr: {
    type: String,
    required: true
  },
  newTime: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: [true, 'Rescheduling reason is required'],
    trim: true
  },
  rescheduledBy: {
    type: String,
    trim: true,
    default: 'Coordinator'
  },
  rescheduledAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const auditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    trim: true
  },
  changedBy: {
    type: String,
    trim: true,
    default: 'System'
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  details: {
    type: String,
    trim: true,
    default: ''
  },
  previousValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { _id: true });

const interviewSchema = new mongoose.Schema({
  interviewId: {
    type: String,
    required: [true, 'Interview ID is required'],
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
  positionName: {
    type: String,
    trim: true,
    default: ''
  },
  submissionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubmissionSet',
    default: null,
    index: true
  },
  submissionSetId: {
    type: String,
    trim: true,
    default: null
  },
  attempt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PositionAttempt',
    default: null,
    index: true
  },
  attemptId: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  attemptNumber: {
    type: Number,
    default: null
  },
  sourcingTA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null,
    index: true
  },
  interviewCoordinator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null,
    index: true
  },
  round: {
    type: String,
    enum: ROUND_VALUES,
    required: [true, 'Interview round is required'],
    default: 'First Round'
  },
  roundSequence: {
    type: Number,
    min: 1,
    max: 4,
    default: 1
  },
  interviewDate: {
    type: Date,
    required: [true, 'Interview date is required'],
    index: true
  },
  interviewDateStr: {
    type: String,
    required: [true, 'Interview date string (YYYY-MM-DD) is required'],
    trim: true
  },
  interviewTime: {
    type: String,
    required: [true, 'Interview time is required'],
    trim: true
  },
  interviewMode: {
    type: String,
    enum: MODE_VALUES,
    default: 'Online'
  },
  meetingLinkOrLocation: {
    type: String,
    trim: true,
    default: ''
  },
  interviewerName: {
    type: String,
    trim: true,
    default: ''
  },
  interviewerDesignation: {
    type: String,
    trim: true,
    default: ''
  },
  schedulingNotes: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: STATUS_VALUES,
    default: 'Scheduled',
    index: true
  },
  decision: {
    type: String,
    enum: DECISION_VALUES,
    default: 'Pending',
    index: true
  },
  decisionDate: {
    type: Date,
    default: null
  },
  feedback: {
    type: String,
    trim: true,
    default: ''
  },
  interviewerComments: {
    type: String,
    trim: true,
    default: ''
  },
  candidatePerformanceNotes: {
    type: String,
    trim: true,
    default: ''
  },
  nextAction: {
    type: String,
    trim: true,
    default: ''
  },
  nextInterviewRound: {
    type: String,
    enum: [...ROUND_VALUES, null, ''],
    default: null
  },
  nextInterviewDate: {
    type: Date,
    default: null
  },
  nextInterviewDateStr: {
    type: String,
    trim: true,
    default: null
  },
  rescheduleHistory: [rescheduleEntrySchema],
  auditTrail: [auditEntrySchema],
  createdBy: {
    type: String,
    trim: true,
    default: null
  }
}, { timestamps: true });

// Compound indexes for high performance filtering and dashboard queries
interviewSchema.index({ position: 1, interviewDate: 1 });
interviewSchema.index({ candidateSubmission: 1, roundSequence: 1 });
interviewSchema.index({ interviewCoordinator: 1, interviewDate: 1 });
interviewSchema.index({ status: 1, interviewDate: 1 });
interviewSchema.index({ decision: 1, interviewDate: 1 });

const Interview = mongoose.model('Interview', interviewSchema);

module.exports = {
  Interview,
  ROUND_VALUES,
  STATUS_VALUES,
  DECISION_VALUES,
  MODE_VALUES
};
