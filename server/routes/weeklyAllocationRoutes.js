const express = require('express');
const router = express.Router();
const {
  getGridForWeek,
  getGridBatch,   // import new
  updateCell,
  autofillWeek
} = require('../controllers/weeklyAllocationController');

router.get('/', getGridForWeek);
router.get('/batch', getGridBatch);   // NEW
router.put('/:taId/:weekStart', updateCell);
router.post('/autofill', autofillWeek);

module.exports = router;