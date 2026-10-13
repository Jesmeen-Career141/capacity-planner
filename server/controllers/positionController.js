const Position = require('../models/Position');
const PositionHistory = require('../models/PositionHistory');
const { computeFlags } = require('../utils/flagLogic');
const liveEvents = require('../utils/liveEvents');
const { formatSalary, validateSalary } = require('../utils/salaryFormatter');
// GET all positions
async function getAllPositions(req, res) {
  try {
    const positions = await Position.find()
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
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

// GET single
async function getPositionById(req, res) {
  try {
    const position = await Position.findById(req.params.id)
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .lean();

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json({ ...position, flags: computeFlags(position) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Helper to parse and validate placedAt date inputs safely
function parseAndValidatePlacedAt(value) {
  if (value === undefined) {
    return { provided: false, value: undefined };
  }
  if (value === null || value === '') {
    return { provided: true, value: null };
  }
  if (typeof value === 'boolean') {
    return { error: 'Invalid placedAt date' };
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return { error: 'Invalid placedAt date' };
    }
    return { provided: true, value };
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return { error: 'Invalid placedAt date' };
    }
    return { provided: true, value: d };
  }
  return { error: 'Invalid placedAt date' };
}

// POST create
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
      cvCount,
      targetCvCount,
      interviewedCount,
      secondInterviewCount,
      packageRange,
      salary,
      extShortlistCount,
      tags,
      remarks,
      placedAt
    } = req.body;

    if (!jobOrderId || !client || !position || !pLevel) {
      return res.status(400).json({
        error: 'jobOrderId, client, position, and pLevel are required'
      });
    }

    const placedAtParsed = parseAndValidatePlacedAt(placedAt);
    if (placedAtParsed.error) {
      return res.status(400).json({ error: placedAtParsed.error });
    }

    let finalPlacedAt = null;
    if (status === 'Placed') {
      finalPlacedAt = placedAtParsed.provided && placedAtParsed.value ? placedAtParsed.value : null;
    } else {
      finalPlacedAt = null;
    }

    let finalSalary = null;
    let finalPackageRange = packageRange || '';

    // Synchronize salary: when structured salary data is explicitly supplied
    if (salary !== undefined && salary !== null) {
      const { valid, errors, sanitized } = validateSalary(salary);
      if (!valid) {
        return res.status(400).json({ error: `Salary validation error: ${errors.join('; ')}` });
      }
      finalSalary = sanitized;
      // Regenerate packageRange from structured values
      finalPackageRange = formatSalary(sanitized, packageRange || '');
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
      placedAt: finalPlacedAt,
      completionPercent,
      cvCount,
      targetCvCount,
      interviewedCount,
      secondInterviewCount,
      packageRange: finalPackageRange,
      salary: finalSalary,
      extShortlistCount,
      tags,
      remarks
    });

    res.status(201).json(newPosition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT update
async function updatePosition(req, res) {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    const existing = await Position.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Validate placedAt if provided
    if (updates.placedAt !== undefined) {
      const placedAtParsed = parseAndValidatePlacedAt(updates.placedAt);
      if (placedAtParsed.error) {
        return res.status(400).json({ error: placedAtParsed.error });
      }
      updates.placedAt = placedAtParsed.value;
    }

    const oldStatus = existing.status;
    const isStatusProvided = updates.status !== undefined;
    const newStatus = isStatusProvided ? updates.status : oldStatus;

    if (oldStatus !== 'Placed' && newStatus === 'Placed') {
      // Transition TO Placed:
      // Set placedAt to explicit valid date if supplied, otherwise now
      if (updates.placedAt === undefined || updates.placedAt === null) {
        updates.placedAt = new Date();
      }
    } else if (oldStatus === 'Placed' && newStatus !== 'Placed') {
      // Transition AWAY from Placed:
      // Clear placedAt to null (PositionHistory will preserve prior placement event)
      updates.placedAt = null;
    } else if (oldStatus === 'Placed' && newStatus === 'Placed') {
      // Position is already Placed:
      // Preserve existing placedAt when unrelated fields are edited.
      // Do not automatically refresh the timestamp.
      if (updates.placedAt === undefined) {
        delete updates.placedAt;
      }
    } else {
      // Not Placed and remains not Placed:
      if (updates.placedAt !== undefined) {
        updates.placedAt = null;
      }
    }

    // Synchronize salary data on updates:
    // 1. When structured salary is explicitly provided
    if (updates.salary !== undefined) {
      if (updates.salary === null) {
        updates.salary = null;
      } else {
        const { valid, errors, sanitized } = validateSalary(updates.salary);
        if (!valid) {
          return res.status(400).json({ error: `Salary validation error: ${errors.join('; ')}` });
        }
        updates.salary = sanitized;
        // Regenerate packageRange from structured values
        updates.packageRange = formatSalary(sanitized, updates.packageRange || existing.packageRange || '');
      }
    }
    // 2. When legacy client submits only packageRange without salary:
    // We intentionally avoid overwriting or erasing existing.salary

    const skipFields = ['_id', '__v', 'createdAt', 'updatedAt', 'allocationRounds'];

    const historyEntries = [];

    for (const field of Object.keys(updates)) {
      if (skipFields.includes(field)) continue;

      const oldValue = existing[field];
      const newValue = updates[field];

      const oldStr = oldValue === null || oldValue === undefined ? '' : oldValue instanceof Date ? oldValue.toISOString() : typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue);
      const newStr = newValue === null || newValue === undefined ? '' : newValue instanceof Date ? newValue.toISOString() : typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);

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
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .lean();

    if (historyEntries.length > 0) {
      await PositionHistory.insertMany(historyEntries);
    }

    liveEvents.emit('positions:changed');   // ADD THIS LINE
    res.json({ ...updatedPosition, flags: computeFlags(updatedPosition) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT assign – primary only (parallel handled via updatePosition)
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

    // Only push to allocationRounds if assigning someone (not unassigning)
    if (taId) {
      position.allocationRounds.push({
        taAssigned: taId,
        roundNumber: position.allocationRounds.length + 1,
        reason: reason || 'Primary assignment',
        cvCountAtRound: position.cvCount
      });
    }

    // Reset reAssign override to 'auto' (clears manual override)
    if (position.flagOverrides?.reAssign) {
      position.flagOverrides.reAssign = 'auto';
    }

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
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .lean();

    liveEvents.emit('positions:changed');   // ADD THIS LINE — currently missing
    res.json({ ...populated, flags: computeFlags(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT flag override
async function setFlagOverride(req, res) {
  try {
    const { id, flagName } = req.params;
    const { mode } = req.body;

    const validFlags = ['followUp', 'addOn', 'backup', 'goingGood', 'reAssign'];
    if (!validFlags.includes(flagName)) {
      return res.status(400).json({ error: `flagName must be one of: ${validFlags.join(', ')}` });
    }
    if (!['auto', 'on', 'off'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be auto, on, or off' });
    }

    const existing = await Position.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const oldMode = existing.flagOverrides?.[flagName] || 'auto';

    const updatedPosition = await Position.findByIdAndUpdate(
      id,
      { [`flagOverrides.${flagName}`]: mode },
      { new: true, runValidators: true }
    )
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .lean();

    if (oldMode !== mode) {
      await PositionHistory.create({
        position: id,
        field: `flagOverrides.${flagName}`,
        oldValue: oldMode,
        newValue: mode
      });
    }

    liveEvents.emit('positions:changed');   // ADD THIS LINE
    res.json({ ...updatedPosition, flags: computeFlags(updatedPosition) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE
async function deletePosition(req, res) {
  try {
    const { id } = req.params;

    const deleted = await Position.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Position not found' });
    }

    await PositionHistory.deleteMany({ position: id });

    liveEvents.emit('positions:changed');   // ADD THIS LINE
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
  setFlagOverride,
  deletePosition
};