const express = require('express');
const router = express.Router();
const {
  createSnapshot,
  getAllSnapshots,
  getSnapshotById
} = require('../controllers/archiveController');

router.post('/', createSnapshot);
router.get('/', getAllSnapshots);
router.get('/:id', getSnapshotById);

module.exports = router;
