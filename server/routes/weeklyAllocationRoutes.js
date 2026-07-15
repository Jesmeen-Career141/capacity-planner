const express = require('express');
const router = express.Router();
const {
  getGridForWeek,
  updateCell,
  autofillWeek
} = require('../controllers/weeklyAllocationController');

router.get('/', getGridForWeek);
router.put('/:taId/:weekStart', updateCell);
router.post('/autofill', autofillWeek);

module.exports = router;
