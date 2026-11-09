const mongoose = require('mongoose');

const activityCounterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

const ActivityCounter = mongoose.model('ActivityCounter', activityCounterSchema);

async function getNextSequence(name, prefix = '', padLength = 4) {
  const counter = await ActivityCounter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `${prefix}${String(counter.seq).padStart(padLength, '0')}`;
}

module.exports = {
  ActivityCounter,
  getNextSequence
};
