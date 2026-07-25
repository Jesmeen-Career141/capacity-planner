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
  },
  color: {
    type: String,
    enum: ['blue', 'yellow', 'purple', 'darkGreen', 'lightGreen', 'lightBlue', 'turquoise', 'pink', 'slate', 'maroon', null],
    default: null
  }
}, { timestamps: true });

taSchema.index({ status: 1 });

module.exports = mongoose.model('TA', taSchema);