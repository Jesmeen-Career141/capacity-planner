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

module.exports = mongoose.model('TA', taSchema);
