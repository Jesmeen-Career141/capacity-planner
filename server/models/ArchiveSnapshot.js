const mongoose = require('mongoose');

const archiveSnapshotSchema = new mongoose.Schema({
  weekStart: {
    type: Date,
    required: true
  },
  weekEnd: {
    type: Date,
    required: true
  },
  snapshot: [{
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Position',
      default: null
    },
    taName: String,
    position: String,
    clientName: String,
    pLevel: String,
    status: String,
    thisWeekFocus: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('ArchiveSnapshot', archiveSnapshotSchema);
