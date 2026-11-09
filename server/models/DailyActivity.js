const mongoose = require('mongoose');

const WORK_TYPES = ['100% Work', 'Follow-up', 'Add-on'];
const COMPLETION_STATUSES = ['In Progress', 'Completed', 'Partial'];

const dailyActivitySchema = new mongoose.Schema({
  // Stable human-readable Activity ID (e.g., DA-0001)
  activityId: {
    type: String,
    required: [true, 'Activity ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  // Normalized YYYY-MM-DD date string
  activityDateStr: {
    type: String,
    required: [true, 'Activity date string (YYYY-MM-DD) is required'],
    trim: true,
    index: true
  },
  activityDate: {
    type: Date,
    required: [true, 'Activity date is required'],
    index: true
  },
  ta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    required: [true, 'TA reference is required'],
    index: true
  },
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position reference is required'],
    index: true
  },
  // Optional link to assignment on the TA Work Board
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkAssignment',
    default: null,
    index: true
  },
  assignmentCode: {
    type: String,
    trim: true,
    default: ''
  },
  // Stable snapshots from Position & Client
  jobOrderId: {
    type: String,
    required: [true, 'Job Order ID is required'],
    trim: true,
    index: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null
  },
  clientName: {
    type: String,
    trim: true,
    default: ''
  },
  positionName: {
    type: String,
    required: [true, 'Position name is required'],
    trim: true
  },
  workType: {
    type: String,
    enum: {
      values: WORK_TYPES,
      message: 'Work type must be one of: 100% Work, Follow-up, Add-on'
    },
    required: [true, 'Work type is required'],
    index: true
  },

  // 1. 100% Work Metrics (Primary new sourcing)
  profilesSearched: {
    type: Number,
    min: [0, 'Profiles searched cannot be negative'],
    default: 0
  },

  // 2. Follow-up Metrics (Revisiting profiles; NOT new LinkedIn sourcing)
  candidatesFollowedUp: {
    type: Number,
    min: [0, 'Candidates followed up cannot be negative'],
    default: 0
  },
  responsesReceived: {
    type: Number,
    min: [0, 'Responses received cannot be negative'],
    default: 0
  },

  // 3. Add-on Metrics (Additional new sourcing beyond original)
  additionalProfilesSourced: {
    type: Number,
    min: [0, 'Additional profiles sourced cannot be negative'],
    default: 0
  },

  // Shared outputs across applicable work types
  cvsShared: {
    type: Number,
    min: [0, 'CVs shared cannot be negative'],
    default: 0
  },
  internallyShortlisted: {
    type: Number,
    min: [0, 'Internally shortlisted cannot be negative'],
    default: 0
  },
  goodCvs: {
    type: Number,
    min: [0, 'Good CVs cannot be negative'],
    default: 0
  },
  optionalCvs: {
    type: Number,
    min: [0, 'Optional CVs cannot be negative'],
    default: 0
  },

  // Link to original sourcing activity for Follow-up & Add-on
  originalSourcingActivity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyActivity',
    default: null
  },
  originalSourcingDate: {
    type: Date,
    default: null
  },

  // Discrepancy warning tracking for Follow-up (Follow-up Count vs CVs Shared)
  hasDiscrepancy: {
    type: Boolean,
    default: false
  },
  discrepancyNote: {
    type: String,
    trim: true,
    default: ''
  },

  completionStatus: {
    type: String,
    enum: COMPLETION_STATUSES,
    default: 'Completed'
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  recordedBy: {
    type: String,
    trim: true,
    default: 'TA'
  }
}, { timestamps: true });

// Enforce business rules before validation:
// 1. Follow-up must NEVER be counted as new LinkedIn sourcing
dailyActivitySchema.pre('validate', function() {
  if (this.workType === 'Follow-up') {
    this.profilesSearched = 0;
    this.additionalProfilesSourced = 0;
  } else if (this.workType === '100% Work') {
    this.candidatesFollowedUp = 0;
    this.responsesReceived = 0;
    this.additionalProfilesSourced = 0;
  } else if (this.workType === 'Add-on') {
    this.profilesSearched = 0;
    this.candidatesFollowedUp = 0;
    this.responsesReceived = 0;
  }
});

dailyActivitySchema.index({ activityDateStr: 1, ta: 1 });
dailyActivitySchema.index({ position: 1, activityDate: -1 });
dailyActivitySchema.index({ ta: 1, workType: 1, activityDate: -1 });

module.exports = mongoose.model('DailyActivity', dailyActivitySchema);
module.exports.WORK_TYPES = WORK_TYPES;
