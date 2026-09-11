const mongoose = require('mongoose');

const snapshotLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  triggerType: {
    type: String,
    enum: ['cron', 'startup_check', 'manual', 'backfill'],
    required: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'SKIPPED'],
    required: true
  },
  weekStart: Date,
  weekEnd: Date,
  snapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchiveSnapshot'
  },
  positionsCount: {
    type: Number,
    default: 0
  },
  message: String,
  error: String
}, { timestamps: true });

module.exports = mongoose.model('SnapshotLog', snapshotLogSchema);
