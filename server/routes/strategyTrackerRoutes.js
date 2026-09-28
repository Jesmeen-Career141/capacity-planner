const express = require('express');
const router = express.Router();
const {
  getStrategies,
  getEntries,
  getPositionEntries,
  updateEntry
} = require('../controllers/strategyTrackerController');

router.get('/strategies', getStrategies);
router.get('/entries', getEntries);
router.get('/positions/:positionId', getPositionEntries);
router.put('/entries/:id', updateEntry);

module.exports = router;
