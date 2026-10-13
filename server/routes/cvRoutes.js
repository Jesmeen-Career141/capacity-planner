const express = require('express');
const router = express.Router();
const cvController = require('../controllers/cvController');
const { handleMulterUpload } = require('../middleware/cvUploadMiddleware');

// Recruitment Attempts
router.get('/positions/:positionId/attempts', cvController.getAttempts);
router.post('/positions/:positionId/attempts', cvController.createAttempt);
router.patch('/positions/:positionId/attempts/:attemptId', cvController.updateAttempt);
router.post('/positions/:positionId/attempts/:attemptId/close', cvController.closeAttempt);

// CV Submissions & Evaluation Workflow
router.get('/positions/:positionId/attempts/:attemptId/submissions', cvController.getSubmissions);
router.post('/positions/:positionId/upload', handleMulterUpload, cvController.uploadCvs);
router.get('/submissions/:submissionId/download-url', cvController.getDownloadUrl);
router.delete('/submissions/:submissionId', cvController.deleteSubmission);
router.patch('/submissions/:submissionId/status', cvController.updateSubmissionStatus);

module.exports = router;
