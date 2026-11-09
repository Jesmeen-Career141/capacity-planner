const mongoose = require('mongoose');
const DailyActivity = require('../models/DailyActivity');
const WorkAssignment = require('../models/WorkAssignment');
const Position = require('../models/Position');
const TA = require('../models/TA');
const liveEvents = require('../utils/liveEvents');
const { getNextSequence } = require('../models/ActivityCounter');

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

// GET /api/daily-activity
async function getActivities(req, res) {
  try {
    const { date, startDate, endDate, ta, position, workType, assignment } = req.query;
    const filter = {};

    if (date) {
      filter.activityDateStr = String(date).trim();
    } else if (startDate && endDate) {
      filter.activityDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) filter.ta = ta;
    if (position && mongoose.Types.ObjectId.isValid(position)) filter.position = position;
    if (workType && DailyActivity.WORK_TYPES.includes(workType)) filter.workType = workType;
    if (assignment && mongoose.Types.ObjectId.isValid(assignment)) filter.assignment = assignment;

    const activities = await DailyActivity.find(filter)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .populate('assignment', 'assignmentId status plannedTarget')
      .populate('originalSourcingActivity', 'activityId activityDateStr workType profilesSearched')
      .sort({ activityDate: -1, createdAt: -1 })
      .lean();

    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-activity/:id
async function getActivityById(req, res) {
  try {
    const { id } = req.params;
    let activity = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      activity = await DailyActivity.findById(id);
    } else {
      activity = await DailyActivity.findOne({ activityId: id });
    }

    if (!activity) return res.status(404).json({ error: 'Daily activity not found' });

    const populated = await DailyActivity.findById(activity._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .populate('assignment', 'assignmentId status plannedTarget')
      .populate('originalSourcingActivity', 'activityId activityDateStr workType profilesSearched')
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/daily-activity
async function createActivity(req, res) {
  try {
    const {
      ta,
      position,
      assignment,
      activityDate,
      activityDateStr,
      workType,
      // 100% Work
      profilesSearched,
      // Follow-up
      candidatesFollowedUp,
      responsesReceived,
      // Add-on
      additionalProfilesSourced,
      // Shared
      cvsShared,
      internallyShortlisted,
      goodCvs,
      optionalCvs,
      originalSourcingActivity,
      originalSourcingDate,
      completionStatus,
      notes,
      recordedBy,
      // Discrepancy acknowledgement
      acknowledgeDiscrepancy,
      discrepancyNote,
      // Optional explicit assignment status update
      updateAssignmentStatus
    } = req.body;

    if (!ta || !position || !workType) {
      return res.status(400).json({ error: 'TA, Position, and Work Type are required.' });
    }

    if (!DailyActivity.WORK_TYPES.includes(workType)) {
      return res.status(400).json({
        error: `Invalid work type: ${workType}. Allowed values: ${DailyActivity.WORK_TYPES.join(', ')}`
      });
    }

    const targetPos = await Position.findById(position).populate('client', 'clientName').lean();
    if (!targetPos) return res.status(404).json({ error: 'Position not found' });

    const targetTA = await TA.findById(ta).lean();
    if (!targetTA) return res.status(404).json({ error: 'TA not found' });

    const { str: finalDateStr, date: finalDate } = normalizeDate(activityDateStr || activityDate);

    // Business Rule Check: Follow-up Count vs CVs Shared
    let hasDiscrepancy = false;
    let finalDiscrepancyNote = '';
    if (workType === 'Follow-up') {
      const followUpCount = Number(candidatesFollowedUp) || 0;
      const cvs = Number(cvsShared) || 0;

      if (followUpCount !== cvs) {
        if (!acknowledgeDiscrepancy) {
          return res.status(422).json({
            code: 'FOLLOWUP_CV_MISMATCH',
            warning: `For reporting process, Follow-up Count (${followUpCount}) and CVs Shared (${cvs}) should match.`,
            candidatesFollowedUp: followUpCount,
            cvsShared: cvs,
            requiresConfirmation: true,
            message: 'Follow-up Count and CVs Shared do not match. To proceed, please confirm and provide an explanation.'
          });
        }
        hasDiscrepancy = true;
        finalDiscrepancyNote = discrepancyNote ? String(discrepancyNote).trim() : `Follow-up Count (${followUpCount}) != CVs Shared (${cvs})`;
      }
    }

    let linkedAssignment = null;
    let assignmentCode = '';
    if (assignment && mongoose.Types.ObjectId.isValid(assignment)) {
      linkedAssignment = await WorkAssignment.findById(assignment);
      if (linkedAssignment) {
        assignmentCode = linkedAssignment.assignmentId;
        // Optionally update assignment status if explicitly requested by user
        if (updateAssignmentStatus && WorkAssignment.ASSIGNMENT_STATUSES.includes(updateAssignmentStatus)) {
          linkedAssignment.status = updateAssignmentStatus;
          await linkedAssignment.save();
        }
      }
    }

    const activityId = await getNextSequence('dailyActivity', 'DA-', 4);

    const clientRef = targetPos.client?._id || targetPos.client || null;
    const clientName = targetPos.client?.clientName || '';

    const newActivity = await DailyActivity.create({
      activityId,
      activityDateStr: finalDateStr,
      activityDate: finalDate,
      ta: targetTA._id,
      position: targetPos._id,
      assignment: linkedAssignment ? linkedAssignment._id : null,
      assignmentCode,
      jobOrderId: targetPos.jobOrderId,
      client: clientRef,
      clientName,
      positionName: targetPos.position,
      workType,
      profilesSearched: workType === '100% Work' ? (Number(profilesSearched) || 0) : 0,
      candidatesFollowedUp: workType === 'Follow-up' ? (Number(candidatesFollowedUp) || 0) : 0,
      responsesReceived: workType === 'Follow-up' ? (Number(responsesReceived) || 0) : 0,
      additionalProfilesSourced: workType === 'Add-on' ? (Number(additionalProfilesSourced) || 0) : 0,
      cvsShared: Number(cvsShared) || 0,
      internallyShortlisted: Number(internallyShortlisted) || 0,
      goodCvs: Number(goodCvs) || 0,
      optionalCvs: Number(optionalCvs) || 0,
      originalSourcingActivity: originalSourcingActivity || null,
      originalSourcingDate: originalSourcingDate ? new Date(originalSourcingDate) : null,
      hasDiscrepancy,
      discrepancyNote: finalDiscrepancyNote,
      completionStatus: completionStatus || 'Completed',
      notes: notes ? String(notes).trim() : '',
      recordedBy: recordedBy || 'TA'
    });

    const populated = await DailyActivity.findById(newActivity._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .populate('assignment', 'assignmentId status plannedTarget')
      .populate('originalSourcingActivity', 'activityId activityDateStr workType profilesSearched')
      .lean();

    try {
      liveEvents.emit('daily-activity:changed');
    } catch (_) {}

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/daily-activity/:id
async function updateActivity(req, res) {
  try {
    const { id } = req.params;
    const activity = await DailyActivity.findById(id);
    if (!activity) return res.status(404).json({ error: 'Daily activity not found' });

    const updates = req.body;

    if (updates.workType && DailyActivity.WORK_TYPES.includes(updates.workType)) {
      activity.workType = updates.workType;
    }

    if (updates.activityDateStr || updates.activityDate) {
      const { str, date } = normalizeDate(updates.activityDateStr || updates.activityDate);
      activity.activityDateStr = str;
      activity.activityDate = date;
    }

    if (activity.workType === '100% Work') {
      if (updates.profilesSearched !== undefined) activity.profilesSearched = Number(updates.profilesSearched) || 0;
      activity.candidatesFollowedUp = 0;
      activity.responsesReceived = 0;
      activity.additionalProfilesSourced = 0;
    } else if (activity.workType === 'Follow-up') {
      if (updates.candidatesFollowedUp !== undefined) activity.candidatesFollowedUp = Number(updates.candidatesFollowedUp) || 0;
      if (updates.responsesReceived !== undefined) activity.responsesReceived = Number(updates.responsesReceived) || 0;
      activity.profilesSearched = 0;
      activity.additionalProfilesSourced = 0;

      // Discrepancy check
      const cvs = updates.cvsShared !== undefined ? Number(updates.cvsShared) : activity.cvsShared;
      if (activity.candidatesFollowedUp !== cvs) {
        if (!updates.acknowledgeDiscrepancy && !activity.hasDiscrepancy) {
          return res.status(422).json({
            code: 'FOLLOWUP_CV_MISMATCH',
            warning: `For reporting process, Follow-up Count (${activity.candidatesFollowedUp}) and CVs Shared (${cvs}) should match.`,
            candidatesFollowedUp: activity.candidatesFollowedUp,
            cvsShared: cvs,
            requiresConfirmation: true
          });
        }
        activity.hasDiscrepancy = true;
        if (updates.discrepancyNote !== undefined) activity.discrepancyNote = String(updates.discrepancyNote).trim();
      } else {
        activity.hasDiscrepancy = false;
        activity.discrepancyNote = '';
      }
    } else if (activity.workType === 'Add-on') {
      if (updates.additionalProfilesSourced !== undefined) activity.additionalProfilesSourced = Number(updates.additionalProfilesSourced) || 0;
      activity.profilesSearched = 0;
      activity.candidatesFollowedUp = 0;
      activity.responsesReceived = 0;
    }

    if (updates.cvsShared !== undefined) activity.cvsShared = Number(updates.cvsShared) || 0;
    if (updates.internallyShortlisted !== undefined) activity.internallyShortlisted = Number(updates.internallyShortlisted) || 0;
    if (updates.goodCvs !== undefined) activity.goodCvs = Number(updates.goodCvs) || 0;
    if (updates.optionalCvs !== undefined) activity.optionalCvs = Number(updates.optionalCvs) || 0;
    if (updates.completionStatus) activity.completionStatus = updates.completionStatus;
    if (updates.notes !== undefined) activity.notes = String(updates.notes).trim();

    await activity.save();

    const populated = await DailyActivity.findById(activity._id)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status client')
      .populate('client', 'clientName')
      .populate('assignment', 'assignmentId status plannedTarget')
      .lean();

    try {
      liveEvents.emit('daily-activity:changed');
    } catch (_) {}

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/daily-activity/:id
async function deleteActivity(req, res) {
  try {
    const { id } = req.params;
    const deleted = await DailyActivity.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Daily activity not found' });

    try {
      liveEvents.emit('daily-activity:changed');
    } catch (_) {}

    res.json({ message: 'Daily activity deleted successfully', deletedId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-activity/planned-vs-actual
// Compares planned work from WorkAssignment against actual work completed from DailyActivity
async function getPlannedVsActual(req, res) {
  try {
    const { date, startDate, endDate, ta, position } = req.query;
    const assignmentFilter = {};
    const activityFilter = {};

    if (date) {
      assignmentFilter.assignedDateStr = String(date).trim();
      activityFilter.activityDateStr = String(date).trim();
    } else if (startDate && endDate) {
      assignmentFilter.assignedDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
      activityFilter.activityDateStr = { $gte: String(startDate).trim(), $lte: String(endDate).trim() };
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      assignmentFilter.ta = ta;
      activityFilter.ta = ta;
    }

    if (position && mongoose.Types.ObjectId.isValid(position)) {
      assignmentFilter.position = position;
      activityFilter.position = position;
    }

    const assignments = await WorkAssignment.find(assignmentFilter)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status')
      .populate('client', 'clientName')
      .lean();

    const activities = await DailyActivity.find(activityFilter)
      .populate('ta', 'name status color')
      .populate('position', 'jobOrderId position pLevel status')
      .populate('client', 'clientName')
      .lean();

    // Map by assignment ID
    const activitiesByAssignment = new Map();
    const unlinkedActivities = [];

    for (const act of activities) {
      if (act.assignment) {
        const key = String(act.assignment._id || act.assignment);
        if (!activitiesByAssignment.has(key)) {
          activitiesByAssignment.set(key, []);
        }
        activitiesByAssignment.get(key).push(act);
      } else {
        unlinkedActivities.push(act);
      }
    }

    const comparison = assignments.map(asg => {
      const linked = activitiesByAssignment.get(String(asg._id)) || [];

      // Calculate actual sums for this assignment
      const actualSummary = {
        profilesSearched: 0,
        additionalProfilesSourced: 0,
        candidatesFollowedUp: 0,
        responsesReceived: 0,
        cvsShared: 0,
        internallyShortlisted: 0,
        goodCvs: 0,
        optionalCvs: 0,
        activityCount: linked.length
      };

      for (const act of linked) {
        actualSummary.profilesSearched += act.profilesSearched || 0;
        actualSummary.additionalProfilesSourced += act.additionalProfilesSourced || 0;
        actualSummary.candidatesFollowedUp += act.candidatesFollowedUp || 0;
        actualSummary.responsesReceived += act.responsesReceived || 0;
        actualSummary.cvsShared += act.cvsShared || 0;
        actualSummary.internallyShortlisted += act.internallyShortlisted || 0;
        actualSummary.goodCvs += act.goodCvs || 0;
        actualSummary.optionalCvs += act.optionalCvs || 0;
      }

      return {
        assignmentId: asg.assignmentId,
        _id: asg._id,
        assignedDateStr: asg.assignedDateStr,
        ta: asg.ta,
        position: asg.position,
        jobOrderId: asg.jobOrderId,
        positionName: asg.positionName,
        clientName: asg.clientName,
        workType: asg.workType,
        status: asg.status,
        planned: asg.plannedTarget,
        actual: actualSummary,
        linkedActivities: linked
      };
    });

    res.json({
      comparison,
      unlinkedActivities,
      totals: {
        totalAssignments: assignments.length,
        totalActivities: activities.length,
        totalProfilesSearched: activities.reduce((sum, a) => sum + (a.profilesSearched || 0), 0),
        totalAdditionalProfiles: activities.reduce((sum, a) => sum + (a.additionalProfilesSourced || 0), 0),
        totalFollowUps: activities.reduce((sum, a) => sum + (a.candidatesFollowedUp || 0), 0),
        totalResponses: activities.reduce((sum, a) => sum + (a.responsesReceived || 0), 0),
        totalCvsShared: activities.reduce((sum, a) => sum + (a.cvsShared || 0), 0),
        totalGoodCvs: activities.reduce((sum, a) => sum + (a.goodCvs || 0), 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-activity/positions/:positionId/history
// Retrieves complete activity history for a position across all dates & TAs
async function getPositionActivityHistory(req, res) {
  try {
    const { positionId } = req.params;
    const activities = await DailyActivity.find({ position: positionId })
      .populate('ta', 'name status color')
      .populate('assignment', 'assignmentId status')
      .populate('originalSourcingActivity', 'activityId activityDateStr workType profilesSearched')
      .sort({ activityDate: -1, createdAt: -1 })
      .lean();

    const assignments = await WorkAssignment.find({ position: positionId })
      .populate('ta', 'name status color')
      .populate('reassignedTo', 'assignmentId ta assignedDateStr status')
      .populate('reassignedFrom', 'assignmentId ta assignedDateStr status')
      .sort({ assignedDate: -1, createdAt: -1 })
      .lean();

    res.json({
      activities,
      assignments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-activity/positions/:positionId/sourcing-options
// Returns prior 100% Work and Add-on activities to link as original sourcing activity
async function getSourcingOptions(req, res) {
  try {
    const { positionId } = req.params;
    const sourcingActivities = await DailyActivity.find({
      position: positionId,
      workType: { $in: ['100% Work', 'Add-on'] }
    })
      .select('activityId activityDateStr workType profilesSearched additionalProfilesSourced cvsShared ta createdAt')
      .populate('ta', 'name color')
      .sort({ activityDate: -1 })
      .lean();

    res.json(sourcingActivities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  getPlannedVsActual,
  getPositionActivityHistory,
  getSourcingOptions
};
