const express = require('express');
const router = express.Router();
const dailyActivityController = require('../controllers/dailyActivityController');

router.get('/', dailyActivityController.getActivities);
router.get('/planned-vs-actual', dailyActivityController.getPlannedVsActual);
router.get('/positions/:positionId/history', dailyActivityController.getPositionActivityHistory);
router.get('/positions/:positionId/sourcing-options', dailyActivityController.getSourcingOptions);
router.get('/:id', dailyActivityController.getActivityById);
router.post('/', dailyActivityController.createActivity);
router.patch('/:id', dailyActivityController.updateActivity);
router.delete('/:id', dailyActivityController.deleteActivity);

module.exports = router;
