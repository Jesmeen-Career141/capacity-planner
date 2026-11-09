const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');

// 1. Position attempts summary & dashboard
router.get('/position/:positionId/summary', attemptController.getPositionAttemptsSummary);
router.get('/dashboard', attemptController.getAttemptDashboard);
router.get('/:id/details', attemptController.getAttemptDetails);

// 2. CRUD
router.post('/', attemptController.createAttempt);
router.put('/:id', attemptController.updateAttempt);

module.exports = router;
