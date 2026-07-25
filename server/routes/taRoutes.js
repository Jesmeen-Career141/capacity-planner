const express = require('express');
const router = express.Router();
const {
  getAllTAs,
  getActiveTAs,
  createTA,
  updateTAStatus,
  updateTAColor,   // <-- new import
  deleteTA
} = require('../controllers/taController');

router.get('/', getAllTAs);
router.get('/active', getActiveTAs);
router.post('/', createTA);
router.put('/:id/status', updateTAStatus);
router.put('/:id/color', updateTAColor);   // <-- new route
router.delete('/:id', deleteTA);

module.exports = router;