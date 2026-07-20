const express = require('express');
const router = express.Router();
const { getLegend, updateLegend } = require('../controllers/colorLegendController');

router.get('/', getLegend);
router.put('/', updateLegend);

module.exports = router;