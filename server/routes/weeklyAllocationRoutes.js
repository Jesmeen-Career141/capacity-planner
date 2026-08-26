const express = require('express');
const router = express.Router();
const {
  getGridForWeek,
  getGridBatch,   // import new
  updateCell,
  autofillWeek,
  setLeaveBulk   // NEW
} = require('../controllers/weeklyAllocationController');

router.get('/', getGridForWeek);
router.get('/batch', getGridBatch);   // NEW
router.put('/:taId/:weekStart', updateCell);
router.post('/autofill', autofillWeek);
router.post('/leave', setLeaveBulk);   // NEW

module.exports = router;