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

// ---------- INDEXES ----------
// 1. Unique compound index to prevent duplicate TA+week entries
weeklyAllocationSchema.index({ ta: 1, weekStart: 1 }, { unique: true });

// 2. Compound index for batch queries that filter by weekStart first (then ta)
//    This is used in the new /batch endpoint: 
//    find({ weekStart: { $in: [...] }, ta: { $in: [...] } })
//    Order matters: (weekStart, ta) is optimal for that query.
weeklyAllocationSchema.index({ weekStart: 1, ta: 1 });

// 3. Single‑field index on weekStart for queries that filter only by weekStart
//    (e.g., the old getGridForWeek endpoint, or any other week‑only queries)
weeklyAllocationSchema.index({ weekStart: 1 });

// 4. Single‑field index on ta for queries that filter only by TA
//    (though the unique compound index { ta: 1, weekStart: 1 } already covers ta‑only queries,
//     this extra index is kept for maximum flexibility)
weeklyAllocationSchema.index({ ta: 1 });

module.exports = mongoose.model('WeeklyAllocation', weeklyAllocationSchema);