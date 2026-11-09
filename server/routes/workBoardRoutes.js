const express = require('express');
const router = express.Router();
const workBoardController = require('../controllers/workBoardController');

router.get('/assignments', workBoardController.getAssignments);
router.get('/assignments/:id', workBoardController.getAssignmentById);
router.post('/assignments', workBoardController.createAssignment);
router.patch('/assignments/:id', workBoardController.updateAssignment);
router.post('/assignments/:id/reassign', workBoardController.reassignAssignment);
router.get('/assignments/:id/chain', workBoardController.getAssignmentChain);

module.exports = router;
