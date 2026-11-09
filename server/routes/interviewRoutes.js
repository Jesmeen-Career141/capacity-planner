const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');

// 1. Dashboard summary and calendar
router.get('/dashboard', interviewController.getInterviewDashboardSummary);
router.get('/calendar', interviewController.getInterviewCalendarEvents);
router.get('/eligible-candidates', interviewController.getEligibleCandidates);

// 2. Candidate & Position tracking
router.get('/candidate/:candidateSubmissionId', interviewController.getCandidateInterviewHistory);
router.get('/position/:positionId/tracking', interviewController.getPositionInterviewTracking);

// 3. Core Interview CRUD and operations
router.get('/', interviewController.getInterviews);
router.post('/', interviewController.createInterview);
router.get('/:id', interviewController.getInterviewById);
router.put('/:id', interviewController.updateInterview);
router.post('/:id/reschedule', interviewController.rescheduleInterview);
router.post('/:id/feedback', interviewController.updateFeedbackAndDecision);
router.post('/:id/status', interviewController.updateStatus);

module.exports = router;
