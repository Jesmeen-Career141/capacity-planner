const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const taRoutes = require('./routes/taRoutes');
const clientRoutes = require('./routes/clientRoutes');
const positionRoutes = require('./routes/positionRoutes');
const archiveRoutes = require('./routes/archiveRoutes');
const positionHistoryRoutes = require('./routes/positionHistoryRoutes');
const weeklyAllocationRoutes = require('./routes/weeklyAllocationRoutes');
const eventRoutes = require('./routes/eventRoutes');              // ADD THIS LINE
const strategyTrackerRoutes = require('./routes/strategyTrackerRoutes');


const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

app.use(express.json());

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.use('/api/tas', taRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/position-history', positionHistoryRoutes);
app.use('/api/weekly-allocations', weeklyAllocationRoutes);
app.use('/api/events', eventRoutes);                              // ADD THIS LINE
app.use('/api/color-legend', require('./routes/colorLegend'));
app.use('/api/strategy-tracker', strategyTrackerRoutes);

const PORT = process.env.PORT || 5000;

const { initSnapshotScheduler } = require('./utils/snapshotService');
const Strategy = require('./models/Strategy');

const SEED_STRATEGIES = [
  { name: 'LinkedIn Search', order: 1 },
  { name: 'Recruiter Search & POST', order: 2 },
  { name: 'Direct Headhunt', order: 3 },
  { name: 'SCOOP', order: 4 },
  { name: 'InMail', order: 5 },
  { name: 'Designation wise search', order: 6 },
  { name: 'Previous Post screening', order: 7 },
  { name: 'L search Extraction', order: 8 },
  { name: 'Company Extraction', order: 9 },
  { name: 'Referral Extraction', order: 10 },
  { name: 'Repository', order: 11 },
  { name: 'Smart Ad', order: 12 },
  { name: 'AI Search', order: 13 },
  { name: 'Identify shortlisted candidates and do company', order: 14 },
  { name: 'Email Campaign', order: 15 },
];

async function seedStrategies() {
  try {
    const count = await Strategy.countDocuments();
    if (count === 0) {
      await Strategy.insertMany(SEED_STRATEGIES);
      console.log('Seeded 15 strategies');
    }
  } catch (err) {
    console.error('Strategy seed error:', err.message);
  }
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    initSnapshotScheduler();
    seedStrategies();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));