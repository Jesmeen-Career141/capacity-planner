const express = require('express');
const router = express.Router();
const submissionSetController = require('../controllers/submissionSetController');
const { handleMulterUpload } = require('../middleware/cvUploadMiddleware');

// Submission Sets endpoints
router.get('/', submissionSetController.getSubmissionSets);
router.post('/', submissionSetController.createSubmissionSet);
router.post('/create-with-upload', handleMulterUpload, submissionSetController.createSetWithUpload);
router.get('/positions/:positionId', submissionSetController.getPositionSets);
router.get('/:id', submissionSetController.getSubmissionSetById);
router.post('/:id/upload', handleMulterUpload, submissionSetController.uploadCvsToSet);
router.delete('/:id', submissionSetController.deleteSubmissionSet);

module.exports = router;
