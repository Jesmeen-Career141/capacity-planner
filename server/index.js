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

const app = express();
app.use(cors());
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

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
