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
const eventRoutes = require('./routes/eventRoutes');
const strategyTrackerRoutes = require('./routes/strategyTrackerRoutes');
const cvRoutes = require('./routes/cvRoutes');
const workBoardRoutes = require('./routes/workBoardRoutes');
const actionBoardRoutes = require('./routes/actionBoardRoutes');
const dailyActivityRoutes = require('./routes/dailyActivityRoutes');
const submissionSetRoutes = require('./routes/submissionSetRoutes');
const taActivityDashboardRoutes = require('./routes/taActivityDashboardRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const placementRoutes = require('./routes/placementRoutes');


const app = express();

// Parse configured origins from CLIENT_URL (supports comma-separated list of URLs)
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Default development origins
const defaultDevOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000'
];

const allowedOriginsSet = new Set([...configuredOrigins, ...defaultDevOrigins]);

function isOriginAllowed(origin) {
  if (!origin) return true; // Non-browser or same-origin requests
  const normalizedOrigin = origin.replace(/\/+$/, '');

  if (allowedOriginsSet.has(normalizedOrigin) || allowedOriginsSet.has(origin)) {
    return true;
  }

  // Securely allow any localhost or 127.0.0.1 port in local development environments
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
    return callback(new Error(`Not allowed by CORS: Origin ${origin} is not authorized`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

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
app.use('/api/events', eventRoutes);
app.use('/api/color-legend', require('./routes/colorLegend'));
app.use('/api/strategy-tracker', strategyTrackerRoutes);
app.use('/api/cvs', cvRoutes);
app.use('/api/action-board', actionBoardRoutes);
app.use('/api/daily-action-board', actionBoardRoutes);
app.use('/api/work-board', workBoardRoutes);
app.use('/api/daily-activity', dailyActivityRoutes);
app.use('/api/submission-sets', submissionSetRoutes);
app.use('/api/ta-dashboard', taActivityDashboardRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/placements', placementRoutes);

// Centralized error handler for CORS & uncaught API errors
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

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