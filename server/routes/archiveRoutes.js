const express = require('express');
const router = express.Router();
const {
  createSnapshot,
  triggerSnapshot,
  triggerBackfill,
  getAllSnapshots,
  getSnapshotById,
  getSnapshotLogs
} = require('../controllers/archiveController');

router.post('/', createSnapshot);
router.post('/trigger', triggerSnapshot);
router.post('/backfill', triggerBackfill);
router.get('/', getAllSnapshots);
router.get('/logs', getSnapshotLogs);
router.get('/:id', getSnapshotById);

module.exports = router;
