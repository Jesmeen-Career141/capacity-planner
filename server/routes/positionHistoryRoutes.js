const express = require('express');
const router = express.Router();
const { getHistoryForPosition } = require('../controllers/positionHistoryController');

router.get('/:positionId', getHistoryForPosition);

module.exports = router;
