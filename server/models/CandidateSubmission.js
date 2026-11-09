const mongoose = require('mongoose');

const candidateSubmissionSchema = new mongoose.Schema({
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position reference is required'],
    index: true
  },
  attempt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PositionAttempt',
    required: [true, 'PositionAttempt reference is required'],
    index: true
  },
  submissionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubmissionSet',
    default: null,
    index: true
  },
  submissionSetId: {
    type: String,
    default: null,
    trim: true,
    index: true
  },
  setNumber: {
    type: String,
    default: null,
    trim: true
  },
  originalFileName: {
    type: String,
    required: [true, 'Original filename is required'],
    trim: true
  },
  unverifiedLabel: {
    type: String,
    trim: true,
    default: ''
  },
  nameIsVerified: {
    type: Boolean,
    default: false
  },
  fileHash: {
    type: String,
    required: [true, 'File hash (SHA-256) is required'],
    trim: true
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative']
  },
  mimeType: {
    type: String,
    required: [true, 'MIME type is required'],
    trim: true
  },
  r2StorageKey: {
    type: String,
    required: [true, 'Cloudflare R2 storage key is required'],
    trim: true
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  },
  sourcedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    default: null
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },

  // Workflow Event 1: Intake & Internal Lead Review
  internalShortlistStatus: {
    type: String,
    enum: ['Pending', 'Shortlisted', 'Rejected'],
    default: 'Pending'
  },
  internalShortlistDate: {
    type: Date,
    default: null
  },
  internalShortlistNotes: {
    type: String,
    trim: true,
    default: ''
  },

  // Workflow Event 2: Quality Rating (Quality rating, NOT a workflow stage)
  qualityRating: {
    type: String,
    enum: ['Not Rated', 'Good', 'Optional'],
    default: 'Not Rated'
  },

  // Pipeline Stage B: Prepared for client submission, but not yet sent
  readyToSend: {
    type: Boolean,
    default: false
  },

  // Workflow Event 3: Client Transmission
  sentToClient: {
    type: Boolean,
    default: false
  },
  sentToClientDate: {
    type: Date,
    default: null
  },

  // Workflow Event 4: Client Response
  clientShortlistStatus: {
    type: String,
    enum: ['Pending', 'Shortlisted', 'Rejected', 'Client Review', 'Review'],
    default: 'Pending'
  },
  clientShortlistDate: {
    type: Date,
    default: null
  },
  clientFeedback: {
    type: String,
    trim: true,
    default: ''
  },

  // Workflow Event 5: Candidate Withdrawal (only permitted after client shortlisting)
  isWithdrawn: {
    type: Boolean,
    default: false
  },
  withdrawalDate: {
    type: Date,
    default: null
  },
  withdrawalReason: {
    type: String,
    enum: [
      'Candidate withdrew',
      'Candidate declined the opportunity',
      'Candidate no longer available',
      'Other',
      null,
      ''
    ],
    default: null
  },
  withdrawalExplanation: {
    type: String,
    trim: true,
    default: ''
  },

  // Workflow Event 6: Candidate Placement
  isPlaced: {
    type: Boolean,
    default: false,
    index: true
  },
  placementDate: {
    type: Date,
    default: null
  },
  placement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Placement',
    default: null
  }
}, { timestamps: true });

// Prevent duplicate submission of the exact same file within the same recruitment attempt
candidateSubmissionSchema.index({ attempt: 1, fileHash: 1 }, { unique: true });

// Ensure storage keys in R2 are strictly unique
candidateSubmissionSchema.index({ r2StorageKey: 1 }, { unique: true });

// Index for querying all submissions under a position and attempt
candidateSubmissionSchema.index({ position: 1, attempt: 1 });
candidateSubmissionSchema.index({ position: 1, submissionSet: 1 });

// Model validations enforcing workflow rules
candidateSubmissionSchema.pre('validate', function() {
  // Client shortlist invariant: cannot be evaluated unless sent to client
  if (!this.sentToClient && this.clientShortlistStatus !== 'Pending') {
    this.invalidate('clientShortlistStatus', 'Client shortlist status cannot be evaluated before the CV is sent to the client');
  }

  // Withdrawal invariant: candidate can only be withdrawn after being client-shortlisted
  if (this.isWithdrawn && this.clientShortlistStatus !== 'Shortlisted') {
    this.invalidate('isWithdrawn', 'Candidate can only be withdrawn after being client-shortlisted');
  }

  // Withdrawal explanation required when reason is Other
  if (this.isWithdrawn && this.withdrawalReason === 'Other' && (!this.withdrawalExplanation || !this.withdrawalExplanation.trim())) {
    this.invalidate('withdrawalExplanation', 'An explanation is required when "Other" is selected as the withdrawal reason');
  }
});

module.exports = mongoose.model('CandidateSubmission', candidateSubmissionSchema);
