const mongoose = require('mongoose');

const taSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['Active', 'Left'],
    default: 'Active'
  }
}, { timestamps: true });

// ---------- INDEXES ----------
// Index on status for fast filtering of active TAs (used in getActiveTAs())
taSchema.index({ status: 1 });

module.exports = mongoose.model('TA', taSchema);