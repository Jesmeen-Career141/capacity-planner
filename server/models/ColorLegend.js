const mongoose = require('mongoose');

// Fixed palette. The colors themselves don't change, but what each one
// *means* is editable by the user via the `label` field.
const PRESET_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

const colorLegendSchema = new mongoose.Schema({
  entries: [{
    key: { type: String, enum: PRESET_KEYS, required: true },
    label: { type: String, default: '', trim: true }
  }]
}, { timestamps: true });

colorLegendSchema.statics.PRESET_KEYS = PRESET_KEYS;

module.exports = mongoose.model('ColorLegend', colorLegendSchema);