const ArchiveSnapshot = require('../models/ArchiveSnapshot');
const SnapshotLog = require('../models/SnapshotLog');
const {
  captureCurrentSnapshot,
  backfillMissingSnapshots
} = require('../utils/snapshotService');

// POST create a new snapshot or trigger a manual snapshot
async function createSnapshot(req, res) {
  try {
    const { weekStart, weekEnd } = req.body || {};
    const result = await captureCurrentSnapshot('manual', weekStart, weekEnd);
    res.status(201).json(result.snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST manually trigger snapshot capture for current week
async function triggerSnapshot(req, res) {
  try {
    const result = await captureCurrentSnapshot('manual');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST manually trigger historical backfill
async function triggerBackfill(req, res) {
  try {
    const { startDate } = req.body || {};
    const backfilled = await backfillMissingSnapshots(startDate ? new Date(startDate) : undefined);
    res.status(200).json({
      success: true,
      count: backfilled.length,
      snapshots: backfilled
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET all snapshots (most recent first)
async function getAllSnapshots(req, res) {
  try {
    const snapshots = await ArchiveSnapshot.find()
      .select('weekStart weekEnd positionCount createdAt updatedAt')
      .sort({ weekStart: -1 })
      .lean();

    // If any snapshot is missing positionCount, calculate from snapshot length if loaded
    const sanitized = await Promise.all(snapshots.map(async s => {
      if (s.positionCount === undefined || s.positionCount === null) {
        const fullDoc = await ArchiveSnapshot.findById(s._id).select('snapshot').lean();
        const count = fullDoc?.snapshot?.length || 0;
        await ArchiveSnapshot.updateOne({ _id: s._id }, { positionCount: count });
        return { ...s, positionCount: count };
      }
      return s;
    }));

    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET a single snapshot with full data
async function getSnapshotById(req, res) {
  try {
    const snapshot = await ArchiveSnapshot.findById(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET snapshot execution / audit logs
async function getSnapshotLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await SnapshotLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createSnapshot,
  triggerSnapshot,
  triggerBackfill,
  getAllSnapshots,
  getSnapshotById,
  getSnapshotLogs
};
