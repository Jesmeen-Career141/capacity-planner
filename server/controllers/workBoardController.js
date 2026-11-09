const mongoose = require('mongoose');
const WorkAssignment = require('../models/WorkAssignment');
const Position = require('../models/Position');
const TA = require('../models/TA');
const liveEvents = require('../utils/liveEvents');
const { getNextSequence } = require('../models/ActivityCounter');

/**
 * Normalizes input date to YYYY-MM-DD and UTC Date
 */
function normalizeDate(input) {
  if (!input) {
    const today = new Date();
    const str = today.toISOString().split('T')[0];
    return { str, date: new Date(`${str}T00:00:00.000Z`) };
  }
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const str = input.trim();
    return { str, date: new Date(`${str}T00:00:00.000Z`) };
  }
  const d = new Date(input);
  const str = d.toISOString().split('T')[0];
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

// GET /api/work-board/assignments
async function getAssignments(req, res) {
  try {
    const { date, startDate, endDate, ta, position, status, workType } = req.query;
    const filter = {};

    if (date) {
      filter.assignedDateStr = String(date).trim();
    } else if (startDate && endDate) {
      filter.assignedDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filter.ta = ta;
    }

    if (position && mongoose.Types.ObjectId.isValid(position)) {
      filter.position = position;
    }

    if (status && WorkAssignment.ASSIGNMENT_STATUSES.includes(status)) {
      filter.status = status;
    }

    if (workType && WorkAssignment.WORK_TYPES.includes(workType)) {
      filter.workType = workType;
    }

    const assignments = await WorkAssignment.find(filter)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client assignee')
      .populate('client', 'clientName')
      .populate('reassignedTo', 'assignmentId ta assignedDateStr status')
      .populate('reassignedFrom', 'assignmentId ta assignedDateStr status')
      .sort({ assignedDate: -1, createdAt: -1 })
      .lean();

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/work-board/assignments/:id
async function getAssignmentById(req, res) {
  try {
    const { id } = req.params;
    let assignment = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      assignment = await WorkAssignment.findById(id);
    } else {
      assignment = await WorkAssignment.findOne({ assignmentId: id });
    }

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const populated = await WorkAssignment.findById(assignment._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client assignee')
      .populate('client', 'clientName')
      .populate('originalAssignment', 'assignmentId assignedDateStr status')
      .populate('reassignedFrom', 'assignmentId assignedDateStr status')
      .populate('reassignedTo', 'assignmentId assignedDateStr status')
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/work-board/assignments
async function createAssignment(req, res) {
  try {
    const {
      assignedDate,
      assignedDateStr,
      ta,
      position,
      workType,
      plannedTarget,
      notes,
      createdBy,
      originalSourcingActivity,
      originalSourcingDate
    } = req.body;

    if (!ta || !position || !workType) {
      return res.status(400).json({ error: 'TA, Position, and Work Type are required.' });
    }

    if (!WorkAssignment.WORK_TYPES.includes(workType)) {
      return res.status(400).json({
        error: `Invalid work type: ${workType}. Allowed values: ${WorkAssignment.WORK_TYPES.join(', ')}`
      });
    }

    const targetPos = await Position.findById(position).populate('client', 'clientName').lean();
    if (!targetPos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const targetTA = await TA.findById(ta).lean();
    if (!targetTA) {
      return res.status(404).json({ error: 'TA not found' });
    }

    const { str: finalDateStr, date: finalDate } = normalizeDate(assignedDateStr || assignedDate);

    // Generate atomic sequence WA-XXXX
    const assignmentId = await getNextSequence('workAssignment', 'WA-', 4);

    const clientRef = targetPos.client?._id || targetPos.client || null;
    const clientName = targetPos.client?.clientName || '';

    const newAssignment = await WorkAssignment.create({
      assignmentId,
      assignedDateStr: finalDateStr,
      assignedDate: finalDate,
      ta: targetTA._id,
      position: targetPos._id,
      jobOrderId: targetPos.jobOrderId,
      client: clientRef,
      clientName,
      positionName: targetPos.position,
      workType,
      plannedTarget: {
        targetProfiles: Number(plannedTarget?.targetProfiles) || 0,
        targetCvsShared: Number(plannedTarget?.targetCvsShared) || 0,
        targetFollowUps: Number(plannedTarget?.targetFollowUps) || 0,
        targetShortlisted: Number(plannedTarget?.targetShortlisted) || 0,
        summary: plannedTarget?.summary ? String(plannedTarget.summary).trim() : ''
      },
      status: 'Assigned',
      notes: notes ? String(notes).trim() : '',
      createdBy: createdBy ? String(createdBy).trim() : 'Lead',
      originalSourcingActivity: originalSourcingActivity || null,
      originalSourcingDate: originalSourcingDate ? new Date(originalSourcingDate) : null
    });

    const populated = await WorkAssignment.findById(newAssignment._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .lean();

    try {
      liveEvents.emit('work-board:changed');
    } catch (_) {}

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/work-board/assignments/:id
async function updateAssignment(req, res) {
  try {
    const { id } = req.params;
    const { status, plannedTarget, notes, workType } = req.body;

    const assignment = await WorkAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (status !== undefined) {
      if (!WorkAssignment.ASSIGNMENT_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status: ${status}. Allowed: ${WorkAssignment.ASSIGNMENT_STATUSES.join(', ')}`
        });
      }
      assignment.status = status;
    }

    if (workType !== undefined) {
      if (!WorkAssignment.WORK_TYPES.includes(workType)) {
        return res.status(400).json({
          error: `Invalid work type: ${workType}. Allowed: ${WorkAssignment.WORK_TYPES.join(', ')}`
        });
      }
      assignment.workType = workType;
    }

    if (plannedTarget !== undefined) {
      assignment.plannedTarget = {
        targetProfiles: plannedTarget.targetProfiles !== undefined ? Number(plannedTarget.targetProfiles) : assignment.plannedTarget.targetProfiles,
        targetCvsShared: plannedTarget.targetCvsShared !== undefined ? Number(plannedTarget.targetCvsShared) : assignment.plannedTarget.targetCvsShared,
        targetFollowUps: plannedTarget.targetFollowUps !== undefined ? Number(plannedTarget.targetFollowUps) : assignment.plannedTarget.targetFollowUps,
        targetShortlisted: plannedTarget.targetShortlisted !== undefined ? Number(plannedTarget.targetShortlisted) : assignment.plannedTarget.targetShortlisted,
        summary: plannedTarget.summary !== undefined ? String(plannedTarget.summary).trim() : assignment.plannedTarget.summary
      };
    }

    if (notes !== undefined) {
      assignment.notes = String(notes).trim();
    }

    await assignment.save();

    const populated = await WorkAssignment.findById(assignment._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .lean();

    try {
      liveEvents.emit('work-board:changed');
    } catch (_) {}

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/work-board/assignments/:id/reassign
// Preserves original assignment history and creates replacement assignment
async function reassignAssignment(req, res) {
  try {
    const { id } = req.params;
    const {
      newTa,
      newDateStr,
      newDate,
      reason,
      reassignedBy,
      newWorkType,
      newPlannedTarget,
      originalStatusAfterReassign // e.g. 'Missed' or remain current
    } = req.body;

    const original = await WorkAssignment.findById(id);
    if (!original) {
      return res.status(404).json({ error: 'Original assignment not found' });
    }

    if (original.reassignedTo) {
      return res.status(400).json({
        error: `This assignment has already been reassigned to ${original.reassignedTo}.`
      });
    }

    const effectiveTaId = newTa || original.ta;
    const targetTA = await TA.findById(effectiveTaId).lean();
    if (!targetTA) {
      return res.status(404).json({ error: 'Target TA not found' });
    }

    const { str: finalDateStr, date: finalDate } = normalizeDate(newDateStr || newDate || original.assignedDateStr);
    const effectiveWorkType = newWorkType || original.workType;
    const effectivePlannedTarget = newPlannedTarget || original.plannedTarget;

    const rootOriginalId = original.originalAssignment || original._id;
    const newAssignmentId = await getNextSequence('workAssignment', 'WA-', 4);

    // 1. Create linked replacement assignment
    const replacement = await WorkAssignment.create({
      assignmentId: newAssignmentId,
      assignedDateStr: finalDateStr,
      assignedDate: finalDate,
      ta: targetTA._id,
      position: original.position,
      jobOrderId: original.jobOrderId,
      client: original.client,
      clientName: original.clientName,
      positionName: original.positionName,
      workType: effectiveWorkType,
      plannedTarget: effectivePlannedTarget,
      status: 'Assigned',
      notes: original.notes ? `[Reassigned from ${original.assignmentId}] ${original.notes}` : `[Reassigned from ${original.assignmentId}]`,
      createdBy: reassignedBy || 'Lead',
      originalAssignment: rootOriginalId,
      reassignedFrom: original._id
    });

    // 2. Update original assignment (PRESERVING HISTORY, NEVER DELETING)
    original.reassignedTo = replacement._id;
    original.reassignmentReason = reason || 'Work rescheduled or reassigned';
    original.reassignedAt = new Date();
    original.reassignedBy = reassignedBy || 'Lead';
    if (originalStatusAfterReassign && WorkAssignment.ASSIGNMENT_STATUSES.includes(originalStatusAfterReassign)) {
      original.status = originalStatusAfterReassign;
    }
    await original.save();

    const populatedReplacement = await WorkAssignment.findById(replacement._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .populate('reassignedFrom', 'assignmentId ta assignedDateStr status')
      .lean();

    try {
      liveEvents.emit('work-board:changed');
    } catch (_) {}

    res.status(201).json({
      message: 'Assignment reassigned successfully',
      original: {
        _id: original._id,
        assignmentId: original.assignmentId,
        reassignedTo: replacement._id,
        reassignmentReason: original.reassignmentReason
      },
      replacement: populatedReplacement
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/work-board/assignments/:id/chain
// Traces complete assignment and rescheduling chain
async function getAssignmentChain(req, res) {
  try {
    const { id } = req.params;
    const current = await WorkAssignment.findById(id).lean();
    if (!current) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const rootId = current.originalAssignment || current._id;
    const chain = await WorkAssignment.find({
      $or: [
        { _id: rootId },
        { originalAssignment: rootId },
        { reassignedFrom: rootId }
      ]
    })
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position')
      .sort({ createdAt: 1 })
      .lean();

    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  reassignAssignment,
  getAssignmentChain
};
