const mongoose = require('mongoose');
const WorkAssignment = require('../models/WorkAssignment');
const Position = require('../models/Position');
const PositionHistory = require('../models/PositionHistory');
const TA = require('../models/TA');
const liveEvents = require('../utils/liveEvents');
const { computeFlags } = require('../utils/flagLogic');
const { getNextSequence } = require('../models/ActivityCounter');

/**
 * Normalizes input date to YYYY-MM-DD and UTC Date object
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

/**
 * Normalizes work type strings to standard values
 */
function normalizeWorkType(type) {
  if (!type) return '100% Work';
  const t = String(type).trim().toLowerCase();
  if (t === '100% work' || t === '100%') return '100% Work';
  if (t === 'follow-up' || t === 'follow up' || t === 'followup') return 'Follow-up';
  if (t === 'add-on' || t === 'add on' || t === 'addon') return 'Add-On';
  if (t === 'backup') return 'Backup';
  if (t === 're-assign' || t === 'reassign' || t === 're assign') return 'Re-assign';
  if (t === 'going good' || t === 'goinggood') return 'Going Good';
  return type;
}

/**
 * Normalizes status strings to standard values (Completed, Pending, Missed)
 */
function normalizeStatus(st) {
  if (!st) return 'Pending';
  const s = String(st).trim().toLowerCase();
  if (s === 'completed') return 'Completed';
  if (s === 'missed') return 'Missed';
  if (s === 'pending' || s === 'assigned' || s === 'in progress') return 'Pending';
  return 'Pending';
}

/**
 * GET /api/action-board/assignments
 * Query parameters:
 *  - date: exact YYYY-MM-DD
 *  - startDate & endDate: range of YYYY-MM-DD
 *  - ta: ObjectId
 *  - position: ObjectId
 *  - workType: Work type
 *  - status: Status (Completed, Pending, Missed)
 */
async function getAssignments(req, res) {
  try {
    const { date, startDate, endDate, ta, position, status, workType } = req.query;
    const filter = {};

    if (date) {
      filter.assignedDateStr = String(date).trim();
    } else if (startDate && endDate) {
      filter.assignedDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
    } else if (startDate) {
      filter.assignedDateStr = { $gte: String(startDate).trim() };
    } else if (endDate) {
      filter.assignedDateStr = { $lte: String(endDate).trim() };
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filter.ta = new mongoose.Types.ObjectId(ta);
    }

    if (position && mongoose.Types.ObjectId.isValid(position)) {
      filter.position = new mongoose.Types.ObjectId(position);
    }

    if (status) {
      const normalizedSt = normalizeStatus(status);
      filter.status = normalizedSt;
    }

    if (workType) {
      const normalizedWt = normalizeWorkType(workType);
      filter.workType = normalizedWt;
    }

    const assignments = await WorkAssignment.find(filter)
      .populate('ta', 'name status color')
      .populate({
        path: 'position',
        select: 'jobOrderId position pLevel status client assignee flagOverrides flags cvCount extShortlistCount',
        populate: { path: 'client', select: 'clientId clientName isEngaged' }
      })
      .populate('client', 'clientId clientName isEngaged')
      .sort({ assignedDate: -1, createdAt: -1 })
      .lean();

    // Attach computed flags to position snapshot for frontend convenience
    const enriched = assignments.map(a => {
      const copy = { ...a };
      if (copy.position) {
        copy.position.flags = computeFlags(copy.position);
      }
      return copy;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/action-board/assignments/:id
 */
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
      .populate({
        path: 'position',
        select: 'jobOrderId position pLevel status client assignee flagOverrides flags cvCount extShortlistCount',
        populate: { path: 'client', select: 'clientId clientName isEngaged' }
      })
      .populate('client', 'clientId clientName isEngaged')
      .lean();

    if (populated.position) {
      populated.position.flags = computeFlags(populated.position);
    }

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/action-board/assignments
 * Fields:
 *  - position (required ObjectId)
 *  - ta (required ObjectId)
 *  - assignedDate / assignedDateStr (required date)
 *  - workType (required: 100% Work, Follow-up, Add-On, Backup, Re-assign, Going Good)
 *  - notes (optional)
 *  - plannedTarget (optional)
 */
async function createAssignment(req, res) {
  try {
    const {
      assignedDate,
      assignedDateStr,
      ta,
      position,
      workType,
      notes,
      plannedTarget,
      createdBy
    } = req.body;

    if (!ta || !position || !workType) {
      return res.status(400).json({ error: 'Position, TA, and Work Type are required.' });
    }

    const normalizedWorkType = normalizeWorkType(workType);
    if (!WorkAssignment.PRIMARY_WORK_TYPES.includes(normalizedWorkType)) {
      return res.status(400).json({
        error: `Invalid work type: ${workType}. Allowed values: ${WorkAssignment.PRIMARY_WORK_TYPES.join(', ')}`
      });
    }

    const targetPos = await Position.findById(position).populate('client', 'clientName isEngaged').lean();
    if (!targetPos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const targetTA = await TA.findById(ta).lean();
    if (!targetTA) {
      return res.status(404).json({ error: 'TA not found' });
    }

    const { str: finalDateStr, date: finalDate } = normalizeDate(assignedDateStr || assignedDate);

    // 1. DUPLICATE CHECK: Same position, TA, date, and work type
    const existing = await WorkAssignment.findOne({
      position: targetPos._id,
      ta: targetTA._id,
      assignedDateStr: finalDateStr,
      workType: normalizedWorkType
    });

    if (existing) {
      return res.status(400).json({
        error: `An assignment for ${targetPos.jobOrderId} (${normalizedWorkType}) already exists for ${targetTA.name} on ${finalDateStr}.`
      });
    }

    // 2. POSITION LIFECYCLE CHECK:
    // New work cannot be scheduled for closed, lost, hold, or placed positions
    const isArchived = ['Placed', 'Lost', 'Hold'].includes(targetPos.status);
    if (isArchived) {
      return res.status(400).json({
        error: `Position ${targetPos.jobOrderId} is currently ${targetPos.status}. New assignments cannot be scheduled for inactive positions.`
      });
    }

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
      workType: normalizedWorkType,
      status: 'Pending',
      plannedTarget: {
        targetProfiles: Number(plannedTarget?.targetProfiles) || 0,
        targetCvsShared: Number(plannedTarget?.targetCvsShared) || 0,
        targetFollowUps: Number(plannedTarget?.targetFollowUps) || 0,
        targetShortlisted: Number(plannedTarget?.targetShortlisted) || 0,
        summary: plannedTarget?.summary ? String(plannedTarget.summary).trim() : ''
      },
      notes: notes ? String(notes).trim() : '',
      createdBy: createdBy ? String(createdBy).trim() : 'Manager'
    });

    // Cross-module audit: Log assignment creation to PositionHistory
    try {
      await PositionHistory.create({
        position: targetPos._id,
        field: 'assignment',
        oldValue: '',
        newValue: JSON.stringify({
          action: 'created',
          assignmentId,
          workType: normalizedWorkType,
          taName: targetTA.name,
          assignedDateStr: finalDateStr,
          status: 'Pending',
          notes: notes ? String(notes).trim() : ''
        }),
        changedBy: createdBy ? String(createdBy).trim() : 'Manager',
        changedAt: new Date()
      });
    } catch (e) {
      console.warn('Failed to log assignment creation to PositionHistory:', e.message);
    }

    const populated = await WorkAssignment.findById(newAssignment._id)
      .populate('ta', 'name status color')
      .populate({
        path: 'position',
        select: 'jobOrderId position pLevel status client assignee flagOverrides flags cvCount extShortlistCount',
        populate: { path: 'client', select: 'clientId clientName isEngaged' }
      })
      .populate('client', 'clientId clientName isEngaged')
      .lean();

    if (populated.position) {
      populated.position.flags = computeFlags(populated.position);
    }

    try {
      liveEvents.emit('work-board:changed');
      liveEvents.emit('action-board:changed');
    } catch (_) {}

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/action-board/assignments/:id
 * Allows updating status ('Completed', 'Pending', 'Missed'), work type, date, TA, and notes.
 * CRITICAL RULE: Editing assignments must preserve data integrity and prevent duplicates.
 */
async function updateAssignment(req, res) {
  try {
    const { id } = req.params;
    const { status, notes, workType, assignedDateStr, assignedDate, ta } = req.body;

    const assignment = await WorkAssignment.findById(id).populate('ta', 'name');
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const oldStatus = assignment.status;
    const oldWorkType = assignment.workType;
    const oldDateStr = assignment.assignedDateStr;
    const oldTaId = String(assignment.ta?._id || assignment.ta);
    const oldTaName = assignment.ta?.name || 'TA';
    const oldNotes = assignment.notes || '';

    let nextWorkType = oldWorkType;
    if (workType !== undefined) {
      const normalizedWorkType = normalizeWorkType(workType);
      if (!WorkAssignment.WORK_TYPES.includes(normalizedWorkType)) {
        return res.status(400).json({
          error: `Invalid work type: ${workType}. Allowed: ${WorkAssignment.PRIMARY_WORK_TYPES.join(', ')}`
        });
      }
      nextWorkType = normalizedWorkType;
    }

    let nextDateStr = oldDateStr;
    let nextDateObj = assignment.assignedDate;
    if (assignedDateStr || assignedDate) {
      const { str, date } = normalizeDate(assignedDateStr || assignedDate);
      nextDateStr = str;
      nextDateObj = date;
    }

    let nextTaId = oldTaId;
    let nextTaDoc = assignment.ta;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      if (String(ta) !== oldTaId) {
        nextTaDoc = await TA.findById(ta).select('name');
        if (!nextTaDoc) {
          return res.status(404).json({ error: 'Target TA not found' });
        }
        nextTaId = String(nextTaDoc._id);
      }
    }

    // DUPLICATE CHECK: Verify if another assignment exists for the same (position, ta, date, workType)
    if (nextTaId !== oldTaId || nextDateStr !== oldDateStr || nextWorkType !== oldWorkType) {
      const duplicate = await WorkAssignment.findOne({
        _id: { $ne: assignment._id },
        position: assignment.position,
        ta: nextTaId,
        assignedDateStr: nextDateStr,
        workType: nextWorkType
      });
      if (duplicate) {
        return res.status(409).json({
          error: `An assignment (${duplicate.assignmentId}) already exists for this position, TA, date (${nextDateStr}), and work type (${nextWorkType}). Duplicate assignments are not permitted.`
        });
      }
    }

    let nextStatus = oldStatus;
    if (status !== undefined) {
      nextStatus = normalizeStatus(status);
      assignment.status = nextStatus;
    }

    assignment.workType = nextWorkType;
    assignment.assignedDateStr = nextDateStr;
    assignment.assignedDate = nextDateObj;
    assignment.ta = new mongoose.Types.ObjectId(nextTaId);

    if (notes !== undefined) {
      assignment.notes = String(notes).trim();
    }

    await assignment.save();

    // Cross-module audit: Log assignment changes to PositionHistory
    try {
      const changes = [];
      const newTaName = nextTaDoc?.name || oldTaName;
      if (oldTaId !== nextTaId) changes.push(`TA reassigned from ${oldTaName} to ${newTaName}`);
      if (oldDateStr !== nextDateStr) changes.push(`Date changed from ${oldDateStr} to ${nextDateStr}`);
      if (oldWorkType !== nextWorkType) changes.push(`Work type changed from ${oldWorkType} to ${nextWorkType}`);
      if (oldStatus !== nextStatus) changes.push(`Status changed from ${oldStatus} to ${nextStatus}`);
      if (notes !== undefined && String(notes).trim() !== oldNotes) changes.push(`Notes updated`);

      if (changes.length > 0) {
        const isStatusOnly = oldStatus !== nextStatus && changes.length === 1;
        await PositionHistory.create({
          position: assignment.position,
          field: 'assignment',
          oldValue: JSON.stringify({
            assignmentId: assignment.assignmentId,
            taName: oldTaName,
            assignedDateStr: oldDateStr,
            workType: oldWorkType,
            status: oldStatus,
            notes: oldNotes
          }),
          newValue: JSON.stringify({
            action: isStatusOnly ? 'status_changed' : 'updated',
            assignmentId: assignment.assignmentId,
            taName: newTaName,
            assignedDateStr: nextDateStr,
            workType: nextWorkType,
            status: nextStatus,
            notes: assignment.notes,
            changes
          }),
          changedBy: req.user?.name || 'Lead',
          changedAt: new Date()
        });
      }
    } catch (e) {
      console.warn('Failed to log assignment update to PositionHistory:', e.message);
    }

    const populated = await WorkAssignment.findById(assignment._id)
      .populate('ta', 'name status color')
      .populate({
        path: 'position',
        select: 'jobOrderId position pLevel status client assignee flagOverrides flags cvCount extShortlistCount',
        populate: { path: 'client', select: 'clientId clientName isEngaged' }
      })
      .populate('client', 'clientId clientName isEngaged')
      .lean();

    if (populated.position) {
      populated.position.flags = computeFlags(populated.position);
    }

    try {
      liveEvents.emit('work-board:changed');
      liveEvents.emit('action-board:changed');
    } catch (_) {}

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/action-board/assignments/:id
 */
async function deleteAssignment(req, res) {
  try {
    const { id } = req.params;
    const assignment = await WorkAssignment.findById(id).populate('ta', 'name');
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const deletedDetails = {
      action: 'deleted',
      assignmentId: assignment.assignmentId,
      jobOrderId: assignment.jobOrderId,
      positionName: assignment.positionName,
      taName: assignment.ta?.name || 'TA',
      assignedDateStr: assignment.assignedDateStr,
      workType: assignment.workType,
      status: assignment.status
    };

    // Cross-module audit: Log deletion to PositionHistory
    try {
      await PositionHistory.create({
        position: assignment.position,
        field: 'assignment',
        oldValue: JSON.stringify(deletedDetails),
        newValue: 'Deleted',
        changedBy: req.user?.name || 'Lead',
        changedAt: new Date()
      });
    } catch (e) {
      console.warn('Failed to log assignment deletion to PositionHistory:', e.message);
    }

    await WorkAssignment.findByIdAndDelete(id);

    try {
      liveEvents.emit('work-board:changed');
      liveEvents.emit('action-board:changed');
    } catch (_) {}

    res.json({ success: true, message: 'Assignment deleted successfully', deleted: deletedDetails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/action-board/overview
 * Overview & Performance Summary over a date range.
 * Query parameters:
 *  - startDate, endDate (YYYY-MM-DD)
 *  - ta (optional)
 *  - workType (optional)
 *  - status (optional)
 */
async function getOverview(req, res) {
  try {
    const { startDate, endDate, ta, workType, status } = req.query;
    const filter = {};

    if (startDate && endDate) {
      filter.assignedDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
    } else if (startDate) {
      filter.assignedDateStr = { $gte: String(startDate).trim() };
    } else if (endDate) {
      filter.assignedDateStr = { $lte: String(endDate).trim() };
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filter.ta = new mongoose.Types.ObjectId(ta);
    }

    if (workType) {
      filter.workType = normalizeWorkType(workType);
    }

    if (status) {
      filter.status = normalizeStatus(status);
    }

    // Load assignments in filter
    const assignments = await WorkAssignment.find(filter)
      .populate('ta', 'name status color')
      .populate('client', 'clientName')
      .sort({ assignedDate: -1 })
      .lean();

    // Summary calculation
    const totalAssignments = assignments.length;
    let completedCount = 0;
    let pendingCount = 0;
    let missedCount = 0;

    // Per TA accumulation map
    const taMap = new Map();

    // First initialize map with all active TAs so even TAs with 0 assignments are listed
    const allTAs = await TA.find({ status: { $ne: 'Inactive' } }).sort({ name: 1 }).lean();
    for (const t of allTAs) {
      taMap.set(t._id.toString(), {
        taId: t._id,
        taName: t.name,
        taColor: t.color || '#059669',
        total: 0,
        completed: 0,
        pending: 0,
        missed: 0,
        completionRate: 0
      });
    }

    for (const a of assignments) {
      const st = a.status;
      if (st === 'Completed') completedCount++;
      else if (st === 'Missed') missedCount++;
      else pendingCount++;

      const taIdStr = a.ta?._id ? a.ta._id.toString() : (a.ta ? a.ta.toString() : null);
      if (taIdStr) {
        if (!taMap.has(taIdStr)) {
          taMap.set(taIdStr, {
            taId: taIdStr,
            taName: a.ta?.name || 'Unknown TA',
            taColor: a.ta?.color || '#059669',
            total: 0,
            completed: 0,
            pending: 0,
            missed: 0,
            completionRate: 0
          });
        }
        const row = taMap.get(taIdStr);
        row.total += 1;
        if (st === 'Completed') row.completed += 1;
        else if (st === 'Missed') row.missed += 1;
        else row.pending += 1;
      }
    }

    // Compute completion rates
    const taPerformance = Array.from(taMap.values()).map(row => {
      const rate = row.total > 0 ? Number(((row.completed / row.total) * 100).toFixed(1)) : 0;
      return {
        ...row,
        completionRate: rate
      };
    });

    // If specific TA was filtered, filter table
    let filteredTaPerformance = taPerformance;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filteredTaPerformance = taPerformance.filter(r => r.taId.toString() === ta.toString());
    }

    const overallCompletionRate = totalAssignments > 0
      ? Number(((completedCount / totalAssignments) * 100).toFixed(1))
      : 0;

    res.json({
      summary: {
        totalAssignments,
        completed: completedCount,
        pending: pendingCount,
        missed: missedCount,
        completionRate: overallCompletionRate
      },
      taPerformance: filteredTaPerformance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/action-board/available-work
 * Retrieves all eligible positions and their active work flags.
 * Used by the Assign Work window to present:
 *  - Available Flagged Work (filtered to positions with active flags)
 *  - All Eligible Positions (all active positions for 100% Work or flagged work)
 */
async function getAvailableWork(req, res) {
  try {
    const { search, workType } = req.query;

    // Eligible positions exclude inactive/terminal lifecycle statuses
    const query = {
      status: { $nin: ['Placed', 'Lost', 'Hold'] }
    };

    const positions = await Position.find(query)
      .populate('client', 'clientId clientName isEngaged')
      .populate('assignee', 'name status color')
      .populate('parallelAssignees', 'name status color')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = positions.map(p => {
      const flags = computeFlags(p);
      const availableWorkTypes = [];

      // 100% Work is always available for eligible active positions
      availableWorkTypes.push('100% Work');

      if (flags.followUp) availableWorkTypes.push('Follow-up');
      if (flags.addOn) availableWorkTypes.push('Add-On');
      if (flags.backup) availableWorkTypes.push('Backup');
      if (flags.reAssign) availableWorkTypes.push('Re-assign');
      if (flags.goingGood) availableWorkTypes.push('Going Good');

      const hasActiveFlags = availableWorkTypes.length > 1;

      return {
        _id: p._id,
        jobOrderId: p.jobOrderId,
        position: p.position,
        client: p.client,
        clientName: p.client?.clientName || '',
        pLevel: p.pLevel,
        status: p.status,
        cvCount: p.cvCount,
        extShortlistCount: p.extShortlistCount,
        assignee: p.assignee,
        parallelAssignees: p.parallelAssignees,
        flags,
        availableWorkTypes,
        hasActiveFlags
      };
    });

    let flagged = enriched.filter(p => p.hasActiveFlags);
    let allEligible = enriched;

    // Filter by workType if requested
    if (workType) {
      const normWt = normalizeWorkType(workType);
      flagged = flagged.filter(p => p.availableWorkTypes.includes(normWt));
    }

    // Text search filter
    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matchesSearch = (p) => {
        const text = `${p.jobOrderId} ${p.position} ${p.clientName}`.toLowerCase();
        return terms.every(t => text.includes(t));
      };
      flagged = flagged.filter(matchesSearch);
      allEligible = allEligible.filter(matchesSearch);
    }

    // Aggregates across all eligible positions
    const countByFlag = {
      followUp: enriched.filter(p => p.flags.followUp).length,
      addOn: enriched.filter(p => p.flags.addOn).length,
      backup: enriched.filter(p => p.flags.backup).length,
      reAssign: enriched.filter(p => p.flags.reAssign).length,
      goingGood: enriched.filter(p => p.flags.goingGood).length
    };

    res.json({
      allEligible,
      flagged,
      summary: {
        totalEligible: enriched.length,
        totalFlagged: enriched.filter(p => p.hasActiveFlags).length,
        countByFlag
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getOverview,
  getAvailableWork,
  normalizeDate,
  normalizeWorkType,
  normalizeStatus
};

