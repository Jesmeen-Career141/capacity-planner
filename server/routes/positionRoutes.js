const express = require('express');
const router = express.Router();
const {
  getAllPositions,
  getPositionById,
  createPosition,
  updatePosition,
  assignPosition,
  setFlagOverride,
  deletePosition
} = require('../controllers/positionController');

router.get('/', getAllPositions);
router.get('/:id', getPositionById);
router.post('/', createPosition);
router.put('/:id', updatePosition);
router.put('/:id/assign', assignPosition);
router.put('/:id/flags/:flagName', setFlagOverride);
router.delete('/:id', deletePosition);

module.exports = router;
