const express = require('express');
const router = express.Router();
const controller = require('../controllers/taActivityDashboardController');

// TA Activity Dashboard Routes (Read-only aggregation endpoints)
router.get('/summary', controller.getDashboardSummary);
router.get('/daily-activities', controller.getDailyActivitiesOverview);
router.get('/ta-productivity', controller.getTaProductivityOverview);
router.get('/position-overview', controller.getPositionActivityOverview);
router.get('/planned-vs-actual', controller.getPlannedVsActualOverview);
router.get('/submission-sets', controller.getSubmissionSetsOverview);
router.get('/trends', controller.getTrendsOverview);

module.exports = router;
