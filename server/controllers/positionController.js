const Position = require('../models/Position');
const Client = require('../models/Client');
const PositionHistory = require('../models/PositionHistory');
const { computeFlags } = require('../utils/flagLogic');
const liveEvents = require('../utils/liveEvents');
const { formatSalary, validateSalary } = require('../utils/salaryFormatter');
// GET all positions
async function getAllPositions(req, res) {
  try {
    const filter = {};
    if (req.query.engaged === 'true') {
      const engagedClientIds = await Client.find({ isEngaged: true }).distinct('_id');
      filter.client = { $in: engagedClientIds };
    } else if (req.query.engaged === 'false') {
      const engagedClientIds = await Client.find({ isEngaged: true }).distinct('_id');
      filter.client = { $nin: engagedClientIds };
    }

    const positions = await Position.find(filter)
      .populate('client', 'clientId clientName isEngaged')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .populate('taAssignments.ta', 'name status color')
      .populate('assignmentHistory.ta', 'name status color')
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
      .populate('taAssignments.ta', 'name status color')
      .populate('assignmentHistory.ta', 'name status color')
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
      parallelAssignees,
      transferParallel,
      dateAssigned,
      receivedDate,
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

    const isReactivated = Boolean(req.body.isReactivated || status === 'Reactivated');
    const reactivatedAt = isReactivated ? (req.body.reactivatedAt || new Date()) : null;

    const clientDoc = await Client.findById(client).lean();
    const clientIsEngaged = Boolean(clientDoc && clientDoc.isEngaged);

    const now = new Date();
    const finalReceivedDate = receivedDate ? new Date(receivedDate) : now;
    const finalDateAssigned = assignee ? (dateAssigned ? new Date(dateAssigned) : now) : (dateAssigned ? new Date(dateAssigned) : null);

    const initialTaAssignments = [];
    const initialAssignmentHistory = [];
    const initialAllocationRounds = [];

    if (assignee) {
      const assignedTimestamp = finalDateAssigned || now;
      initialTaAssignments.push({
        ta: assignee,
        role: 'Primary',
        assignedAt: assignedTimestamp
      });
      initialAssignmentHistory.push({
        ta: assignee,
        role: 'Primary',
        assignedAt: assignedTimestamp,
        unassignedAt: null,
        action: 'Assigned'
      });
      initialAllocationRounds.push({
        taAssigned: assignee,
        roundNumber: 1,
        dateAssigned: assignedTimestamp,
        reason: 'Initial assignment',
        cvCountAtRound: cvCount || 0
      });
    }

    if (Array.isArray(parallelAssignees) && parallelAssignees.length > 0) {
      for (const pTaId of parallelAssignees) {
        if (!pTaId) continue;
        initialTaAssignments.push({
          ta: pTaId,
          role: 'Parallel',
          assignedAt: now
        });
        initialAssignmentHistory.push({
          ta: pTaId,
          role: 'Parallel',
          assignedAt: now,
          unassignedAt: null,
          action: 'Assigned'
        });
      }
    }

    const newPosition = await Position.create({
      jobOrderId,
      client,
      position,
      pLevel,
      status,
      isEngaged: clientIsEngaged,
      engagedAt: clientIsEngaged ? (clientDoc.engagedAt || now) : null,
      isReactivated,
      reactivatedAt,
      pipelineStage,
      assignee: assignee || null,
      parallelAssignees: Array.isArray(parallelAssignees) ? parallelAssignees : [],
      transferParallel,
      dateAssigned: finalDateAssigned,
      receivedDate: isNaN(finalReceivedDate.getTime()) ? now : finalReceivedDate,
      activatedAt: null, // Only activated when first placed on TA Board
      taAssignments: initialTaAssignments,
      assignmentHistory: initialAssignmentHistory,
      allocationRounds: initialAllocationRounds,
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

    // Validate receivedDate if provided
    if (updates.receivedDate !== undefined) {
      if (updates.receivedDate === null || updates.receivedDate === '') {
        delete updates.receivedDate;
      } else {
        const parsedReceived = new Date(updates.receivedDate);
        if (isNaN(parsedReceived.getTime())) {
          return res.status(400).json({ error: 'Invalid receivedDate format' });
        }
        updates.receivedDate = parsedReceived;
      }
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

    if (newStatus === 'Reactivated' || updates.isReactivated === true) {
      updates.isReactivated = true;
      if (!existing.reactivatedAt && !updates.reactivatedAt) {
        updates.reactivatedAt = new Date();
      }
    }

    if (updates.isEngaged !== undefined) {
      updates.isEngaged = Boolean(updates.isEngaged);
      updates.engagedAt = updates.isEngaged ? (existing.engagedAt || new Date()) : null;
    }

    // Track per-TA assignment dates when assignee or parallelAssignees change via updatePosition
    const now = new Date();
    let currentTaAssignments = Array.isArray(existing.taAssignments)
      ? existing.taAssignments.map(a => ({ ...a }))
      : [];
    let currentAssignmentHistory = Array.isArray(existing.assignmentHistory)
      ? existing.assignmentHistory.map(h => ({ ...h }))
      : [];
    let taAssignmentsModified = false;

    // Seed existing primary/parallel into currentTaAssignments if legacy record had empty taAssignments
    if (currentTaAssignments.length === 0) {
      if (existing.assignee) {
        currentTaAssignments.push({
          ta: existing.assignee,
          role: 'Primary',
          assignedAt: existing.dateAssigned || existing.createdAt || now
        });
      }
      if (Array.isArray(existing.parallelAssignees)) {
        for (const pId of existing.parallelAssignees) {
          currentTaAssignments.push({
            ta: pId,
            role: 'Parallel',
            assignedAt: existing.dateAssigned || existing.createdAt || now
          });
        }
      }
    }

    if (updates.assignee !== undefined) {
      const oldPrimary = existing.assignee ? String(existing.assignee) : '';
      const newPrimary = updates.assignee ? String(updates.assignee) : '';
      if (oldPrimary !== newPrimary) {
        taAssignmentsModified = true;
        // Close previous primary in assignmentHistory without overwriting original assignedAt
        if (oldPrimary) {
          for (let i = currentAssignmentHistory.length - 1; i >= 0; i--) {
            if (String(currentAssignmentHistory[i].ta) === oldPrimary && currentAssignmentHistory[i].role === 'Primary' && !currentAssignmentHistory[i].unassignedAt) {
              currentAssignmentHistory[i].unassignedAt = now;
              break;
            }
          }
        }
        // Remove previous Primary from active taAssignments
        currentTaAssignments = currentTaAssignments.filter(a => a.role !== 'Primary');
        if (newPrimary) {
          currentTaAssignments.unshift({
            ta: updates.assignee,
            role: 'Primary',
            assignedAt: now
          });
          currentAssignmentHistory.push({
            ta: updates.assignee,
            role: 'Primary',
            assignedAt: now,
            unassignedAt: null,
            action: oldPrimary ? 'Reassigned' : 'Assigned'
          });
          if (!updates.dateAssigned) {
            updates.dateAssigned = now;
          }
        }
      }
    }

    if (updates.parallelAssignees !== undefined && Array.isArray(updates.parallelAssignees)) {
      const oldParallelIds = (existing.parallelAssignees || []).map(id => String(id));
      const newParallelIds = updates.parallelAssignees.filter(Boolean).map(id => String(id));

      const addedParallel = newParallelIds.filter(id => !oldParallelIds.includes(id));
      const removedParallel = oldParallelIds.filter(id => !newParallelIds.includes(id));

      if (addedParallel.length > 0 || removedParallel.length > 0) {
        taAssignmentsModified = true;
        // Mark removed parallel TAs as unassigned in history (preserving original assignedAt)
        for (const remId of removedParallel) {
          currentTaAssignments = currentTaAssignments.filter(
            a => !(a.role === 'Parallel' && String(a.ta) === remId)
          );
          for (let i = currentAssignmentHistory.length - 1; i >= 0; i--) {
            if (String(currentAssignmentHistory[i].ta) === remId && currentAssignmentHistory[i].role === 'Parallel' && !currentAssignmentHistory[i].unassignedAt) {
              currentAssignmentHistory[i].unassignedAt = now;
              break;
            }
          }
        }
        // Add newly assigned parallel TAs with their individual assignedAt timestamp
        for (const addId of addedParallel) {
          currentTaAssignments.push({
            ta: addId,
            role: 'Parallel',
            assignedAt: now
          });
          currentAssignmentHistory.push({
            ta: addId,
            role: 'Parallel',
            assignedAt: now,
            unassignedAt: null,
            action: 'Assigned'
          });
        }
        if (addedParallel.length > 0 && !existing.dateAssigned && !updates.dateAssigned) {
          updates.dateAssigned = now;
        }
      }
    }

    if (taAssignmentsModified) {
      updates.taAssignments = currentTaAssignments;
      updates.assignmentHistory = currentAssignmentHistory;
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

    const skipFields = ['_id', '__v', 'createdAt', 'updatedAt', 'allocationRounds', 'taAssignments', 'assignmentHistory'];

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
      .populate('taAssignments.ta', 'name status color')
      .populate('assignmentHistory.ta', 'name status color')
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

    const now = new Date();
    const oldAssignee = position.assignee ? String(position.assignee) : '';
    const newAssignee = taId ? String(taId) : '';

    // Seed taAssignments from legacy fields if empty
    if (!Array.isArray(position.taAssignments) || position.taAssignments.length === 0) {
      position.taAssignments = [];
      if (position.assignee) {
        position.taAssignments.push({
          ta: position.assignee,
          role: 'Primary',
          assignedAt: position.dateAssigned || position.createdAt || now
        });
      }
      if (Array.isArray(position.parallelAssignees)) {
        for (const pId of position.parallelAssignees) {
          position.taAssignments.push({
            ta: pId,
            role: 'Parallel',
            assignedAt: position.dateAssigned || position.createdAt || now
          });
        }
      }
    }
    if (!Array.isArray(position.assignmentHistory)) {
      position.assignmentHistory = [];
      if (position.assignee) {
        position.assignmentHistory.push({
          ta: position.assignee,
          role: 'Primary',
          assignedAt: position.dateAssigned || position.createdAt || now,
          unassignedAt: null,
          action: 'Assigned'
        });
      }
    }

    if (oldAssignee !== newAssignee) {
      // Mark previous primary entry as unassigned without overwriting its original assignedAt
      if (oldAssignee) {
        for (let i = position.assignmentHistory.length - 1; i >= 0; i--) {
          if (String(position.assignmentHistory[i].ta) === oldAssignee && position.assignmentHistory[i].role === 'Primary' && !position.assignmentHistory[i].unassignedAt) {
            position.assignmentHistory[i].unassignedAt = now;
            break;
          }
        }
      }
      // Keep parallel assignments with their existing assignedAt timestamps; replace Primary
      position.taAssignments = position.taAssignments.filter(a => a.role !== 'Primary');
      if (taId) {
        position.taAssignments.unshift({
          ta: taId,
          role: 'Primary',
          assignedAt: now
        });
        position.assignmentHistory.push({
          ta: taId,
          role: 'Primary',
          assignedAt: now,
          unassignedAt: null,
          action: oldAssignee ? 'Reassigned' : 'Assigned'
        });
      }
    }

    position.assignee = taId || null;
    if (taId) {
      position.dateAssigned = now;
    }

    // Only push to allocationRounds if assigning someone (not unassigning)
    if (taId) {
      position.allocationRounds.push({
        taAssigned: taId,
        roundNumber: position.allocationRounds.length + 1,
        dateAssigned: now,
        reason: reason || (oldAssignee ? 'Reassigned' : 'Primary assignment'),
        cvCountAtRound: position.cvCount
      });
    }

    // Reset reAssign override to 'auto' (clears manual override)
    if (position.flagOverrides?.reAssign) {
      position.flagOverrides.reAssign = 'auto';
    }

    await position.save();

    if (oldAssignee !== newAssignee) {
      await PositionHistory.create({
        position: id,
        field: 'assignee',
        oldValue: oldAssignee,
        newValue: newAssignee
      });
    }

    const populated = await Position.findById(id)
      .populate('client', 'clientId clientName')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .populate('taAssignments.ta', 'name status color')
      .populate('assignmentHistory.ta', 'name status color')
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
      .populate('taAssignments.ta', 'name status color')
      .populate('assignmentHistory.ta', 'name status color')
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

// BULK UPDATE ENGAGEMENT (Client-level engagement)
async function bulkUpdateEngagement(req, res) {
  try {
    const { positionIds, clientIds, isEngaged } = req.body;
    let targetClientIds = [];

    if (Array.isArray(clientIds) && clientIds.length > 0) {
      targetClientIds = [...new Set(clientIds.map(String))];
    } else if (Array.isArray(positionIds) && positionIds.length > 0) {
      const positions = await Position.find({ _id: { $in: positionIds } }, 'client').lean();
      targetClientIds = [...new Set(positions.map(p => p.client?.toString()).filter(Boolean))];
    }

    if (targetClientIds.length === 0) {
      return res.status(400).json({ error: 'No valid clients or positions provided' });
    }

    const engagedBool = Boolean(isEngaged);
    const engagedDate = engagedBool ? new Date() : null;

    // 1. Update all identified distinct clients
    await Client.updateMany(
      { _id: { $in: targetClientIds } },
      {
        $set: {
          isEngaged: engagedBool,
          engagedAt: engagedDate
        }
      }
    );

    // 2. Update ALL positions belonging to these clients
    const positionUpdateResult = await Position.updateMany(
      { client: { $in: targetClientIds } },
      {
        $set: {
          isEngaged: engagedBool,
          engagedAt: engagedDate
        }
      }
    );

    const clientDocs = await Client.find({ _id: { $in: targetClientIds } }, 'clientName').lean();

    liveEvents.emit('positions:changed');
    res.json({
      success: true,
      clientCount: targetClientIds.length,
      clients: clientDocs.map(c => c.clientName),
      modifiedPositionsCount: positionUpdateResult.modifiedCount,
      isEngaged: engagedBool
    });
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
  deletePosition,
  bulkUpdateEngagement
};