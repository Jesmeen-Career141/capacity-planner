const ArchiveSnapshot = require('../models/ArchiveSnapshot');
const Position = require('../models/Position');

// POST create a new snapshot from current position data
async function createSnapshot(req, res) {
  try {
    const { weekStart, weekEnd } = req.body;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'weekStart and weekEnd are required' });
    }

    const positions = await Position.find()
      .populate('client', 'clientName')
      .populate('assignee', 'name')
      .lean();

    const snapshot = positions.map(p => ({
      positionId: p._id,
      taName: p.assignee ? p.assignee.name : 'Unassigned',
      position: p.position,
      clientName: p.client ? p.client.clientName : 'Unknown',
      pLevel: p.pLevel,
      status: p.status,
      thisWeekFocus: p.thisWeekFocus || ''
    }));

    const newSnapshot = await ArchiveSnapshot.create({
      weekStart,
      weekEnd,
      snapshot
    });

    res.status(201).json(newSnapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET all snapshots (most recent first, summary only)
async function getAllSnapshots(req, res) {
  try {
    const snapshots = await ArchiveSnapshot.find()
      .select('weekStart weekEnd createdAt')
      .sort({ weekStart: -1 });
    res.json(snapshots);
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

module.exports = {
  createSnapshot,
  getAllSnapshots,
  getSnapshotById
};
