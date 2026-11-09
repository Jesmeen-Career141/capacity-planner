const mongoose = require('mongoose');
const Position = require('../models/Position');
const WorkAssignment = require('../models/WorkAssignment');
const DailyActivity = require('../models/DailyActivity');
const SubmissionSet = require('../models/SubmissionSet');
const CandidateSubmission = require('../models/CandidateSubmission');
const TA = require('../models/TA');
const Client = require('../models/Client');

/**
 * Builds base filter queries for WorkAssignment, DailyActivity, and CandidateSubmission
 * based on incoming request query parameters.
 */
function buildDashboardFilters(query) {
  const { dateFrom, dateTo, ta, client, position, workType, status } = query;

  const asgFilter = {};
  const actFilter = {};
  const setFilter = {};
  const subFilter = {};

  // Date filters
  if (dateFrom || dateTo) {
    const dFrom = dateFrom ? new Date(dateFrom) : null;
    let dTo = dateTo ? new Date(dateTo) : null;
    if (dTo) {
      dTo.setHours(23, 59, 59, 999);
    }

    // WorkAssignment dates
    asgFilter.assignedDate = {};
    if (dFrom) asgFilter.assignedDate.$gte = dFrom;
    if (dTo) asgFilter.assignedDate.$lte = dTo;

    // DailyActivity dates
    actFilter.activityDate = {};
    if (dFrom) actFilter.activityDate.$gte = dFrom;
    if (dTo) actFilter.activityDate.$lte = dTo;

    // SubmissionSet dates (sent to client)
    setFilter.sentToClientAt = {};
    if (dFrom) setFilter.sentToClientAt.$gte = dFrom;
    if (dTo) setFilter.sentToClientAt.$lte = dTo;

    // CandidateSubmission dates
    subFilter.uploadedAt = {};
    if (dFrom) subFilter.uploadedAt.$gte = dFrom;
    if (dTo) subFilter.uploadedAt.$lte = dTo;
  }

  // TA filter
  if (ta && mongoose.Types.ObjectId.isValid(ta)) {
    asgFilter.ta = new mongoose.Types.ObjectId(ta);
    actFilter.ta = new mongoose.Types.ObjectId(ta);
    setFilter.uploadedBy = new mongoose.Types.ObjectId(ta);
    subFilter.$or = [
      { sourcedBy: new mongoose.Types.ObjectId(ta) },
      { submittedBy: new mongoose.Types.ObjectId(ta) }
    ];
  }

  // Position filter
  if (position && mongoose.Types.ObjectId.isValid(position)) {
    asgFilter.position = new mongoose.Types.ObjectId(position);
    actFilter.position = new mongoose.Types.ObjectId(position);
    setFilter.position = new mongoose.Types.ObjectId(position);
    subFilter.position = new mongoose.Types.ObjectId(position);
  }

  // Work Type filter
  if (workType) {
    asgFilter.workType = workType;
    actFilter.workType = workType;
  }

  // Status filter (for assignments)
  if (status) {
    asgFilter.status = status;
  }

  return { asgFilter, actFilter, setFilter, subFilter, client };
}

/**
 * Resolves matching position IDs if client filter is specified
 */
async function applyClientFilter(filters, clientId) {
  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    const pos = await Position.find({ client: clientId }).select('_id').lean();
    const posIds = pos.map(p => p._id);
    
    // Intersect or apply
    if (filters.asgFilter.position) {
      if (!posIds.some(id => id.equals(filters.asgFilter.position))) {
        filters.asgFilter.position = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    } else {
      filters.asgFilter.position = { $in: posIds };
    }

    if (filters.actFilter.position) {
      if (!posIds.some(id => id.equals(filters.actFilter.position))) {
        filters.actFilter.position = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    } else {
      filters.actFilter.position = { $in: posIds };
    }

    if (filters.setFilter.position) {
      if (!posIds.some(id => id.equals(filters.setFilter.position))) {
        filters.setFilter.position = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    } else {
      filters.setFilter.position = { $in: posIds };
    }

    if (filters.subFilter.position) {
      if (!posIds.some(id => id.equals(filters.subFilter.position))) {
        filters.subFilter.position = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    } else {
      filters.subFilter.position = { $in: posIds };
    }
  }
}

/**
 * GET /api/ta-dashboard/summary
 * Consolidated summary cards across Workload, Sourcing, and Recruitment Output
 */
async function getDashboardSummary(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { asgFilter, actFilter, subFilter } = filters;

    // 1. Workload Metrics from WorkAssignment
    // Note: To avoid double counting reassigned assignments in total workload metrics,
    // we aggregate by status while keeping original assignments visible.
    const asgStats = await WorkAssignment.aggregate([
      { $match: asgFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    let totalAssignments = 0;
    let completedAssignments = 0;
    let inProgressAssignments = 0;
    let missedAssignments = 0;
    let assignedCount = 0;

    for (const s of asgStats) {
      totalAssignments += s.count;
      if (s._id === 'Completed') completedAssignments = s.count;
      else if (s._id === 'In Progress') inProgressAssignments = s.count;
      else if (s._id === 'Missed') missedAssignments = s.count;
      else if (s._id === 'Assigned') assignedCount = s.count;
    }

    const completionRate = totalAssignments > 0
      ? Number(((completedAssignments / totalAssignments) * 100).toFixed(1))
      : 0;

    // 2. Sourcing Activity Metrics from DailyActivity
    // Strictly separates 100% Work, Add-on, and Follow-ups
    const actStats = await DailyActivity.aggregate([
      { $match: actFilter },
      {
        $group: {
          _id: null,
          totalProfilesSearched: { $sum: '$profilesSearched' },
          totalAdditionalProfiles: { $sum: '$additionalProfilesSourced' },
          totalFollowUps: { $sum: '$candidatesFollowedUp' },
          totalResponses: { $sum: '$responsesReceived' },
          totalCvsShared: { $sum: '$cvsShared' },
          totalInternallyShortlisted: { $sum: '$internallyShortlisted' },
          totalGoodCvs: { $sum: '$goodCvs' },
          totalOptionalCvs: { $sum: '$optionalCvs' },
          activityCount: { $sum: 1 }
        }
      }
    ]);

    const sourcing = actStats[0] || {
      totalProfilesSearched: 0,
      totalAdditionalProfiles: 0,
      totalFollowUps: 0,
      totalResponses: 0,
      totalCvsShared: 0,
      totalInternallyShortlisted: 0,
      totalGoodCvs: 0,
      totalOptionalCvs: 0,
      activityCount: 0
    };

    // 3. Recruitment Output Metrics from CandidateSubmission
    const subPipeline = [
      { $match: subFilter },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: null,
                totalSubmissions: { $sum: 1 },
                internallyShortlisted: {
                  $sum: { $cond: [{ $eq: ['$internalShortlistStatus', 'Shortlisted'] }, 1, 0] }
                },
                goodCvs: {
                  $sum: { $cond: [{ $eq: ['$qualityRating', 'Good'] }, 1, 0] }
                },
                optionalCvs: {
                  $sum: { $cond: [{ $eq: ['$qualityRating', 'Optional'] }, 1, 0] }
                },
                clientShortlisted: {
                  $sum: { $cond: [{ $eq: ['$clientShortlistStatus', 'Shortlisted'] }, 1, 0] }
                },
                withdrawn: {
                  $sum: { $cond: [{ $eq: ['$isWithdrawn', true] }, 1, 0] }
                }
              }
            }
          ],
          uniqueByName: [
            { $group: { _id: { $toLower: { $ifNull: ['$unverifiedLabel', ''] } } } },
            { $count: 'count' }
          ],
          uniqueByHash: [
            { $group: { _id: '$fileHash' } },
            { $count: 'count' }
          ]
        }
      }
    ];

    const [subAgg] = await CandidateSubmission.aggregate(subPipeline);
    const subCounts = subAgg?.counts[0] || {
      totalSubmissions: 0,
      internallyShortlisted: 0,
      goodCvs: 0,
      optionalCvs: 0,
      clientShortlisted: 0,
      withdrawn: 0
    };

    const uniqueCandidates = subAgg?.uniqueByName[0]?.count || 0;

    res.json({
      workload: {
        totalAssignments,
        completedAssignments,
        inProgressAssignments,
        missedAssignments,
        assignedCount,
        completionRate
      },
      sourcing: {
        profilesSearched: sourcing.totalProfilesSearched,
        additionalProfilesSourced: sourcing.totalAdditionalProfiles,
        followUpActivities: sourcing.totalFollowUps,
        responsesReceived: sourcing.totalResponses
      },
      recruitmentOutput: {
        cvsShared: sourcing.totalCvsShared,
        candidateSubmissions: subCounts.totalSubmissions,
        uniqueCandidates,
        internallyShortlisted: subCounts.internallyShortlisted,
        goodCvs: subCounts.goodCvs,
        optionalCvs: subCounts.optionalCvs,
        clientShortlisted: subCounts.clientShortlisted,
        withdrawn: subCounts.withdrawn
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/daily-activities
 * Comprehensive daily activities table with sorting & details
 */
async function getDailyActivitiesOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { actFilter } = filters;
    const { sortBy = 'activityDate', sortOrder = 'desc', limit = 100, page = 1 } = req.query;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    if (sortBy !== 'createdAt') sort.createdAt = -1;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const total = await DailyActivity.countDocuments(actFilter);

    const activities = await DailyActivity.find(actFilter)
      .populate('ta', 'name color status')
      .populate({
        path: 'position',
        select: 'jobOrderId position client pLevel status',
        populate: { path: 'client', select: 'clientName' }
      })
      .populate('assignment', 'assignmentId status plannedTarget')
      .populate('originalSourcingActivity', 'activityId activityDateStr workType')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      activities
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/ta-productivity
 * Per-TA comparison of assigned workload, completed work, sourcing, and shortlist conversion
 */
async function getTaProductivityOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { asgFilter, actFilter, subFilter } = filters;

    // 1. Fetch active TAs (or all TAs if filtered)
    const taQuery = req.query.ta ? { _id: req.query.ta } : { status: 'Active' };
    const tas = await TA.find(taQuery).sort({ order: 1, name: 1 }).lean();

    // 2. Aggregate WorkAssignments by TA
    const asgByTa = await WorkAssignment.aggregate([
      { $match: asgFilter },
      {
        $group: {
          _id: '$ta',
          totalAssigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          missed: { $sum: { $cond: [{ $eq: ['$status', 'Missed'] }, 1, 0] } }
        }
      }
    ]);

    const asgMap = new Map();
    for (const a of asgByTa) {
      if (a._id) asgMap.set(String(a._id), a);
    }

    // 3. Aggregate DailyActivities by TA
    const actByTa = await DailyActivity.aggregate([
      { $match: actFilter },
      {
        $group: {
          _id: '$ta',
          profilesSearched: { $sum: '$profilesSearched' },
          additionalProfiles: { $sum: '$additionalProfilesSourced' },
          followUps: { $sum: '$candidatesFollowedUp' },
          responsesReceived: { $sum: '$responsesReceived' },
          cvsShared: { $sum: '$cvsShared' },
          internallyShortlisted: { $sum: '$internallyShortlisted' },
          goodCvs: { $sum: '$goodCvs' },
          optionalCvs: { $sum: '$optionalCvs' }
        }
      }
    ]);

    const actMap = new Map();
    for (const a of actByTa) {
      if (a._id) actMap.set(String(a._id), a);
    }

    // 4. Aggregate CandidateSubmissions by sourcing TA
    const subByTa = await CandidateSubmission.aggregate([
      { $match: subFilter },
      {
        $group: {
          _id: '$sourcedBy',
          totalSubmissions: { $sum: 1 },
          internallyShortlisted: {
            $sum: { $cond: [{ $eq: ['$internalShortlistStatus', 'Shortlisted'] }, 1, 0] }
          },
          goodCvs: {
            $sum: { $cond: [{ $eq: ['$qualityRating', 'Good'] }, 1, 0] }
          },
          clientShortlisted: {
            $sum: { $cond: [{ $eq: ['$clientShortlistStatus', 'Shortlisted'] }, 1, 0] }
          }
        }
      }
    ]);

    const subMap = new Map();
    for (const s of subByTa) {
      if (s._id) subMap.set(String(s._id), s);
    }

    // Merge for each TA
    const result = tas.map(ta => {
      const taId = String(ta._id);
      const asg = asgMap.get(taId) || { totalAssigned: 0, completed: 0, inProgress: 0, missed: 0 };
      const act = actMap.get(taId) || {
        profilesSearched: 0,
        additionalProfiles: 0,
        followUps: 0,
        responsesReceived: 0,
        cvsShared: 0,
        internallyShortlisted: 0,
        goodCvs: 0,
        optionalCvs: 0
      };
      const sub = subMap.get(taId) || {
        totalSubmissions: 0,
        internallyShortlisted: 0,
        goodCvs: 0,
        clientShortlisted: 0
      };

      const completionRate = asg.totalAssigned > 0
        ? Number(((asg.completed / asg.totalAssigned) * 100).toFixed(1))
        : 0;

      return {
        _id: ta._id,
        name: ta.name,
        color: ta.color,
        status: ta.status,
        workload: {
          totalAssigned: asg.totalAssigned,
          completed: asg.completed,
          inProgress: asg.inProgress,
          missed: asg.missed,
          completionRate
        },
        sourcing: {
          profilesSearched: act.profilesSearched,
          additionalProfiles: act.additionalProfiles,
          followUps: act.followUps,
          responsesReceived: act.responsesReceived
        },
        recruitment: {
          cvsShared: act.cvsShared,
          submissions: sub.totalSubmissions,
          internallyShortlisted: sub.internallyShortlisted || act.internallyShortlisted,
          goodCvs: sub.goodCvs || act.goodCvs,
          clientShortlisted: sub.clientShortlisted
        }
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/position-overview
 * Aggregated position-level performance across all TAs and dates
 */
async function getPositionActivityOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { asgFilter, actFilter, subFilter } = filters;

    // 1. Assignments by position
    const asgByPos = await WorkAssignment.aggregate([
      { $match: asgFilter },
      {
        $group: {
          _id: '$position',
          totalAssignments: { $sum: 1 },
          completedAssignments: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          tas: { $addToSet: '$ta' }
        }
      }
    ]);
    const asgMap = new Map();
    for (const a of asgByPos) {
      if (a._id) asgMap.set(String(a._id), a);
    }

    // 2. Activities by position
    const actByPos = await DailyActivity.aggregate([
      { $match: actFilter },
      {
        $group: {
          _id: '$position',
          profilesSearched: { $sum: '$profilesSearched' },
          additionalProfiles: { $sum: '$additionalProfilesSourced' },
          followUps: { $sum: '$candidatesFollowedUp' },
          responsesReceived: { $sum: '$responsesReceived' },
          cvsShared: { $sum: '$cvsShared' },
          latestActivityDate: { $max: '$activityDate' },
          tas: { $addToSet: '$ta' }
        }
      }
    ]);
    const actMap = new Map();
    for (const a of actByPos) {
      if (a._id) actMap.set(String(a._id), a);
    }

    // 3. Submissions by position
    const subByPos = await CandidateSubmission.aggregate([
      { $match: subFilter },
      {
        $group: {
          _id: '$position',
          totalSubmissions: { $sum: 1 },
          uniqueNames: { $addToSet: { $toLower: { $ifNull: ['$unverifiedLabel', ''] } } },
          internallyShortlisted: {
            $sum: { $cond: [{ $eq: ['$internalShortlistStatus', 'Shortlisted'] }, 1, 0] }
          },
          goodCvs: {
            $sum: { $cond: [{ $eq: ['$qualityRating', 'Good'] }, 1, 0] }
          },
          clientShortlisted: {
            $sum: { $cond: [{ $eq: ['$clientShortlistStatus', 'Shortlisted'] }, 1, 0] }
          }
        }
      }
    ]);
    const subMap = new Map();
    for (const s of subByPos) {
      if (s._id) subMap.set(String(s._id), s);
    }

    // Positions matching query
    const posQuery = {};
    if (asgFilter.position) {
      posQuery._id = asgFilter.position;
    } else if (req.query.client && mongoose.Types.ObjectId.isValid(req.query.client)) {
      posQuery.client = req.query.client;
    }

    const positions = await Position.find(posQuery)
      .populate('client', 'clientName')
      .populate('assignee', 'name color')
      .populate('parallelAssignees', 'name color')
      .sort({ updatedAt: -1 })
      .lean();

    const result = positions.map(pos => {
      const posId = String(pos._id);
      const asg = asgMap.get(posId) || { totalAssignments: 0, completedAssignments: 0, tas: [] };
      const act = actMap.get(posId) || {
        profilesSearched: 0,
        additionalProfiles: 0,
        followUps: 0,
        responsesReceived: 0,
        cvsShared: 0,
        latestActivityDate: null,
        tas: []
      };
      const sub = subMap.get(posId) || {
        totalSubmissions: 0,
        uniqueNames: [],
        internallyShortlisted: 0,
        goodCvs: 0,
        clientShortlisted: 0
      };

      // Collect all assigned TAs (assignee, parallel, and TAs with logged activity)
      const assignedTaMap = new Map();
      if (pos.assignee) assignedTaMap.set(String(pos.assignee._id), pos.assignee);
      if (Array.isArray(pos.parallelAssignees)) {
        pos.parallelAssignees.forEach(t => assignedTaMap.set(String(t._id), t));
      }

      return {
        _id: pos._id,
        jobOrderId: pos.jobOrderId,
        position: pos.position,
        client: pos.client?.clientName || '—',
        clientId: pos.client?._id,
        status: pos.status,
        pLevel: pos.pLevel,
        assignedTAs: Array.from(assignedTaMap.values()),
        totalAssignments: asg.totalAssignments,
        completedAssignments: asg.completedAssignments,
        profilesSearched: act.profilesSearched,
        additionalProfiles: act.additionalProfiles,
        followUps: act.followUps,
        responsesReceived: act.responsesReceived,
        cvsShared: act.cvsShared,
        totalSubmissions: sub.totalSubmissions,
        uniqueCandidates: (sub.uniqueNames || []).length,
        internallyShortlisted: sub.internallyShortlisted,
        goodCvs: sub.goodCvs,
        clientShortlisted: sub.clientShortlisted,
        latestActivityDate: act.latestActivityDate || pos.updatedAt
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/planned-vs-actual
 * Planned targets vs completed work for all matching assignments
 */
async function getPlannedVsActualOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { asgFilter, actFilter } = filters;

    const assignments = await WorkAssignment.find(asgFilter)
      .populate('ta', 'name color status')
      .populate({
        path: 'position',
        select: 'jobOrderId position client',
        populate: { path: 'client', select: 'clientName' }
      })
      .sort({ assignedDate: -1, createdAt: -1 })
      .lean();

    const asgIds = assignments.map(a => a._id);
    const activities = await DailyActivity.find({
      ...actFilter,
      assignment: { $in: asgIds }
    }).lean();

    const activityByAsg = new Map();
    for (const act of activities) {
      const aId = String(act.assignment);
      if (!activityByAsg.has(aId)) activityByAsg.set(aId, []);
      activityByAsg.get(aId).push(act);
    }

    const comparison = assignments.map(asg => {
      const linked = activityByAsg.get(String(asg._id)) || [];

      const actual = {
        profilesSearched: 0,
        additionalProfiles: 0,
        followUps: 0,
        responsesReceived: 0,
        cvsShared: 0,
        goodCvs: 0,
        activityCount: linked.length
      };

      for (const act of linked) {
        actual.profilesSearched += act.profilesSearched || 0;
        actual.additionalProfiles += act.additionalProfilesSourced || 0;
        actual.followUps += act.candidatesFollowedUp || 0;
        actual.responsesReceived += act.responsesReceived || 0;
        actual.cvsShared += act.cvsShared || 0;
        actual.goodCvs += act.goodCvs || 0;
      }

      // Remaining targets
      const targetProfiles = asg.plannedTarget?.targetProfiles || 0;
      const targetCvs = asg.plannedTarget?.targetCvsShared || 0;
      const targetFollowUps = asg.plannedTarget?.targetFollowUps || 0;

      const remainingProfiles = Math.max(0, targetProfiles - actual.profilesSearched);
      const remainingCvs = Math.max(0, targetCvs - actual.cvsShared);
      const remainingFollowUps = Math.max(0, targetFollowUps - actual.followUps);

      return {
        _id: asg._id,
        assignmentId: asg.assignmentId,
        assignedDateStr: asg.assignedDateStr,
        assignedDate: asg.assignedDate,
        ta: asg.ta,
        position: asg.position,
        jobOrderId: asg.jobOrderId,
        positionName: asg.positionName,
        clientName: asg.clientName,
        workType: asg.workType,
        status: asg.status,
        planned: {
          targetProfiles,
          targetCvsShared: targetCvs,
          targetFollowUps,
          summary: asg.plannedTarget?.summary || ''
        },
        actual,
        remaining: {
          profiles: remainingProfiles,
          cvs: remainingCvs,
          followUps: remainingFollowUps
        }
      };
    });

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/submission-sets
 * Submission sets overview and performance
 */
async function getSubmissionSetsOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { setFilter } = filters;

    const sets = await SubmissionSet.find(setFilter)
      .populate({
        path: 'position',
        select: 'jobOrderId position client',
        populate: { path: 'client', select: 'clientName' }
      })
      .populate('uploadedBy', 'name color')
      .sort({ sentToClientAt: -1, createdAt: -1 })
      .lean();

    // Fetch candidate submissions for each set to compute accurate metrics
    const setIds = sets.map(s => s._id);
    const submissions = await CandidateSubmission.find({ submissionSet: { $in: setIds } })
      .select('submissionSet unverifiedLabel fileHash clientShortlistStatus qualityRating')
      .lean();

    const subBySet = new Map();
    for (const sub of submissions) {
      const sId = String(sub.submissionSet);
      if (!subBySet.has(sId)) subBySet.set(sId, []);
      subBySet.get(sId).push(sub);
    }

    const result = sets.map(set => {
      const subs = subBySet.get(String(set._id)) || [];
      const uniqueNames = new Set(subs.map(s => (s.unverifiedLabel || '').trim().toLowerCase()));
      const clientShortlisted = subs.filter(s => s.clientShortlistStatus === 'Shortlisted').length;
      const goodCvs = subs.filter(s => s.qualityRating === 'Good').length;

      return {
        _id: set._id,
        submissionSetId: set.submissionSetId,
        setNumber: set.setNumber,
        setSequence: set.setSequence,
        jobOrderId: set.jobOrderId,
        position: set.position,
        sentToClientAt: set.sentToClientAt,
        uploadedAt: set.uploadedAt,
        uploadedBy: set.uploadedBy,
        cvCount: set.cvCount,
        actualSubmissionsCount: subs.length,
        uniqueCandidateCount: uniqueNames.size,
        clientShortlisted,
        goodCvs,
        notes: set.notes
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/ta-dashboard/trends
 * Aggregated trend data for time-series charts (daily sourcing, daily CVs, workload, conversion)
 */
async function getTrendsOverview(req, res) {
  try {
    const filters = buildDashboardFilters(req.query);
    await applyClientFilter(filters, req.query.client);

    const { actFilter, asgFilter, subFilter } = filters;

    // 1. Daily Sourcing & CV Sharing Timeline
    const dailyActivityTrend = await DailyActivity.aggregate([
      { $match: actFilter },
      {
        $group: {
          _id: '$activityDateStr',
          profilesSearched: { $sum: '$profilesSearched' },
          additionalProfiles: { $sum: '$additionalProfilesSourced' },
          followUps: { $sum: '$candidatesFollowedUp' },
          responsesReceived: { $sum: '$responsesReceived' },
          cvsShared: { $sum: '$cvsShared' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 2. Work Type Distribution
    const workTypeDist = await DailyActivity.aggregate([
      { $match: actFilter },
      {
        $group: {
          _id: '$workType',
          count: { $sum: 1 },
          profilesSearched: { $sum: '$profilesSearched' },
          additionalProfiles: { $sum: '$additionalProfilesSourced' },
          followUps: { $sum: '$candidatesFollowedUp' },
          cvsShared: { $sum: '$cvsShared' }
        }
      }
    ]);

    // 3. Workload by TA
    const workloadByTa = await WorkAssignment.aggregate([
      { $match: asgFilter },
      {
        $group: {
          _id: '$ta',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          missed: { $sum: { $cond: [{ $eq: ['$status', 'Missed'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'tas',
          localField: '_id',
          foreignField: '_id',
          as: 'taInfo'
        }
      },
      { $unwind: '$taInfo' },
      {
        $project: {
          name: '$taInfo.name',
          color: '$taInfo.color',
          total: 1,
          completed: 1,
          inProgress: 1,
          missed: 1
        }
      },
      { $sort: { total: -1 } }
    ]);

    // 4. Candidate Shortlist Conversion Funnel
    const [subCounts] = await CandidateSubmission.aggregate([
      { $match: subFilter },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          internallyShortlisted: {
            $sum: { $cond: [{ $eq: ['$internalShortlistStatus', 'Shortlisted'] }, 1, 0] }
          },
          goodCvs: {
            $sum: { $cond: [{ $eq: ['$qualityRating', 'Good'] }, 1, 0] }
          },
          clientShortlisted: {
            $sum: { $cond: [{ $eq: ['$clientShortlistStatus', 'Shortlisted'] }, 1, 0] }
          },
          withdrawn: {
            $sum: { $cond: [{ $eq: ['$isWithdrawn', true] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      dailyActivityTrend,
      workTypeDist,
      workloadByTa,
      funnel: subCounts || {
        totalSubmissions: 0,
        internallyShortlisted: 0,
        goodCvs: 0,
        clientShortlisted: 0,
        withdrawn: 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getDashboardSummary,
  getDailyActivitiesOverview,
  getTaProductivityOverview,
  getPositionActivityOverview,
  getPlannedVsActualOverview,
  getSubmissionSetsOverview,
  getTrendsOverview
};
