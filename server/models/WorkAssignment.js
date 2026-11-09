const mongoose = require('mongoose');

const WORK_TYPES = [
  '100% Work',
  'Follow-up',
  'Add-On',
  'Backup',
  'Re-assign',
  'Going Good',
  'Add-on',
  'Reassign'
];

const PRIMARY_WORK_TYPES = [
  '100% Work',
  'Follow-up',
  'Add-On',
  'Backup',
  'Re-assign',
  'Going Good'
];

const ASSIGNMENT_STATUSES = [
  'Completed',
  'Pending',
  'Missed',
  'Assigned',
  'In Progress'
];

const PRIMARY_STATUSES = ['Completed', 'Pending', 'Missed'];

const workAssignmentSchema = new mongoose.Schema({
  // Stable human-readable Assignment ID (e.g., WA-0001)
  assignmentId: {
    type: String,
    required: [true, 'Assignment ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  // Normalized YYYY-MM-DD string for exact daily board filtering
  assignedDateStr: {
    type: String,
    required: [true, 'Assigned date string (YYYY-MM-DD) is required'],
    trim: true,
    index: true
  },
  // Date object (UTC midnight of assignedDateStr) for date range queries
  assignedDate: {
    type: Date,
    required: [true, 'Assigned date is required'],
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
  // Stable snapshots from Position & Client for fast board rendering and historical integrity
  jobOrderId: {
    type: String,
    required: [true, 'Job Order ID (JO ID) is required'],
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
      message: 'Work type must be one of: 100% Work, Follow-up, Add-On, Backup, Re-assign, Going Good'
    },
    required: [true, 'Work type is required'],
    index: true
  },
  // Planned work or target (kept strictly separate from actual completed activity)
  plannedTarget: {
    targetProfiles: { type: Number, min: 0, default: 0 },
    targetCvsShared: { type: Number, min: 0, default: 0 },
    targetFollowUps: { type: Number, min: 0, default: 0 },
    targetShortlisted: { type: Number, min: 0, default: 0 },
    summary: { type: String, trim: true, default: '' }
  },
  status: {
    type: String,
    enum: {
      values: ASSIGNMENT_STATUSES,
      message: 'Assignment status must be one of: Completed, Pending, Missed'
    },
    default: 'Pending',
    index: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: String,
    trim: true,
    default: 'Lead'
  },
  // Optional reference to original sourcing activity/date for Follow-up and Add-on work
  originalSourcingActivity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyActivity',
    default: null
  },
  originalSourcingDate: {
    type: Date,
    default: null
  },
  // Reassignment & Rescheduling History Chain (Never delete original assignment)
  originalAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkAssignment',
    default: null,
    index: true
  },
  reassignedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkAssignment',
    default: null
  },
  reassignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkAssignment',
    default: null
  },
  reassignmentReason: {
    type: String,
    trim: true,
    default: ''
  },
  reassignedAt: {
    type: Date,
    default: null
  },
  reassignedBy: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

workAssignmentSchema.index({ assignedDateStr: 1, ta: 1 });
workAssignmentSchema.index({ position: 1, assignedDate: -1 });
workAssignmentSchema.index({ ta: 1, status: 1, assignedDate: -1 });
workAssignmentSchema.index({ position: 1, ta: 1, assignedDateStr: 1, workType: 1 });

module.exports = mongoose.model('WorkAssignment', workAssignmentSchema);
module.exports.WORK_TYPES = WORK_TYPES;
module.exports.PRIMARY_WORK_TYPES = PRIMARY_WORK_TYPES;
module.exports.ASSIGNMENT_STATUSES = ASSIGNMENT_STATUSES;
module.exports.PRIMARY_STATUSES = PRIMARY_STATUSES;
