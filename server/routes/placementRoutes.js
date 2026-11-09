const express = require('express');
const router = express.Router();
const placementController = require('../controllers/placementController');

router.get('/', placementController.getPlacements);
router.post('/', placementController.createPlacement);
router.get('/:id', placementController.getPlacementById);
router.put('/:id', placementController.updatePlacement);

module.exports = router;
