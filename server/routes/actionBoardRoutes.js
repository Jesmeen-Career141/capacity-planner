const express = require('express');
const router = express.Router();
const actionBoardController = require('../controllers/actionBoardController');

router.get('/assignments', actionBoardController.getAssignments);
router.get('/assignments/:id', actionBoardController.getAssignmentById);
router.post('/assignments', actionBoardController.createAssignment);
router.patch('/assignments/:id', actionBoardController.updateAssignment);
router.delete('/assignments/:id', actionBoardController.deleteAssignment);
router.get('/overview', actionBoardController.getOverview);
router.get('/available-work', actionBoardController.getAvailableWork);

module.exports = router;
