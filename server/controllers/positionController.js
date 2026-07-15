const Position = require('../models/Position');
const PositionHistory = require('../models/PositionHistory');
const { computeFlags } = require('../utils/flagLogic');

// GET all positions (with client and assignee populated, plus flags)
async function getAllPositions(req, res) {
  try {
    const positions = await Position.find()
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const withFlags = positions.map(p => ({
      ...p,
      flags: computeFlags(p)
    }));

    res.json(withFlags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET a single position by ID (with flags)
async function getPositionById(req, res) {
  try {
    const position = await Position.findById(req.params.id)
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name')
      .lean();

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json({ ...position, flags: computeFlags(position) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST create a new position
async function createPosition(req, res) {
  try {
    const {
      jobOrderId,
      client,
      position,
      pLevel,
      status,
      pipelineStage,
      assignee,
      transferParallel,
      dateAssigned,
      expectedCloseDate,
      completionPercent,
      lsCount,
      cvCount,
      tags,
      remarks
    } = req.body;

    if (!jobOrderId || !client || !position || !pLevel) {
      return res.status(400).json({
        error: 'jobOrderId, client, position, and pLevel are required'
      });
    }

    const newPosition = await Position.create({
      jobOrderId,
      client,
      position,
      pLevel,
      status,
      pipelineStage,
      assignee,
      transferParallel,
      dateAssigned,
      expectedCloseDate,
      completionPercent,
      lsCount,
      cvCount,
      tags,
      remarks
    });

    res.status(201).json(newPosition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT update a position - logs each changed field to PositionHistory
async function updatePosition(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await Position.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const skipFields = ['_id', '__v', 'createdAt', 'updatedAt', 'allocationRounds'];

    const historyEntries = [];

    for (const field of Object.keys(updates)) {
      if (skipFields.includes(field)) continue;

      const oldValue = existing[field];
      const newValue = updates[field];

      const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
      const newStr = newValue === null || newValue === undefined ? '' : String(newValue);

      if (oldStr !== newStr) {
        historyEntries.push({
          position: id,
          field,
          oldValue: oldStr,
          newValue: newStr
        });
      }
    }

    const updatedPosition = await Position.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name')
      .lean();

    if (historyEntries.length > 0) {
      await PositionHistory.insertMany(historyEntries);
    }

    res.json({ ...updatedPosition, flags: computeFlags(updatedPosition) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT assign a TA to a position (the Assign screen action)
async function assignPosition(req, res) {
  try {
    const { id } = req.params;
    const { taId, reason } = req.body;

    const position = await Position.findById(id);
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const oldAssignee = position.assignee ? String(position.assignee) : '';

    position.assignee = taId;
    position.dateAssigned = new Date();
    position.allocationRounds.push({
      taAssigned: taId,
      roundNumber: position.allocationRounds.length + 1,
      reason: reason || 'Initial assignment',
      cvCountAtRound: position.cvCount
    });

    await position.save();

    if (oldAssignee !== String(taId)) {
      await PositionHistory.create({
        position: id,
        field: 'assignee',
        oldValue: oldAssignee,
        newValue: String(taId)
      });
    }

    const populated = await Position.findById(id)
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name')
      .lean();

    res.json({ ...populated, flags: computeFlags(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE a position (also cleans up its history entries)
async function deletePosition(req, res) {
  try {
    const { id } = req.params;

    const deleted = await Position.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Position not found' });
    }

    await PositionHistory.deleteMany({ position: id });

    res.json({ message: 'Position deleted', deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllPositions,
  getPositionById,
  createPosition,
  updatePosition,
  assignPosition,
  deletePosition
};
