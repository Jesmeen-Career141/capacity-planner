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

// Compound unique index on ta and weekStart
weeklyAllocationSchema.index({ ta: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyAllocation', weeklyAllocationSchema);
