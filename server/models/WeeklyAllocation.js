const mongoose = require('mongoose');

const dayAllocationSchema = new mongoose.Schema({
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    default: null
  },
  isAutoFilled: {
    type: Boolean,
    default: false
  },
  leave: {
    type: {
      type: String,
      enum: ['leave', 'holiday'],
      default: null
    },
    setAt: {
      type: Date,
      default: null
    }
  }
}, { _id: false });

const weeklyAllocationSchema = new mongoose.Schema({
  ta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TA',
    required: true
  },
  weekStart: {
    type: Date,
    required: true
  },
  weekEnd: {
    type: Date,
    required: true
  },
  days: {
    mon: { type: dayAllocationSchema, default: () => ({}) },
    tue: { type: dayAllocationSchema, default: () => ({}) },
    wed: { type: dayAllocationSchema, default: () => ({}) },
    thu: { type: dayAllocationSchema, default: () => ({}) },
    fri: { type: dayAllocationSchema, default: () => ({}) },
    sat: { type: dayAllocationSchema, default: () => ({}) },
    sun: { type: dayAllocationSchema, default: () => ({}) }
  }
}, { timestamps: true });

// ---------- INDEXES ----------
// 1. Unique compound index to prevent duplicate TA+week entries
weeklyAllocationSchema.index({ ta: 1, weekStart: 1 }, { unique: true });

// 2. Compound index for batch queries that filter by weekStart first (then ta)
weeklyAllocationSchema.index({ weekStart: 1, ta: 1 });

// 3. Single‑field index on weekStart for queries that filter only by weekStart
weeklyAllocationSchema.index({ weekStart: 1 });

// 4. Single‑field index on ta for queries that filter only by TA
weeklyAllocationSchema.index({ ta: 1 });

module.exports = mongoose.model('WeeklyAllocation', weeklyAllocationSchema);