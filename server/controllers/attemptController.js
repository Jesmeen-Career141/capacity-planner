const mongoose = require('mongoose');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const { Interview } = require('../models/Interview');
const { Placement } = require('../models/Placement');
const Client = require('../models/Client');
const TA = require('../models/TA');

const ATTEMPT_TA_POPULATE = [
  { path: 'primaryTA', select: 'name status color' },
  { path: 'supportingTAs', select: 'name status color' }
];

/**
 * 1. Position-Level Attempts Overview (Cumulative & Per-Attempt)
 */
exports.getPositionAttemptsSummary = async (req, res) => {
  try {
    const { positionId } = req.params;

    const position = await Position.findById(positionId)
      .populate('client', 'clientName')
      .populate('assignee', 'name color')
      .populate('parallelAssignees', 'name color')
      .lean();

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Retrieve all attempts for this position
    const attempts = await PositionAttempt.find({ position: positionId })
      .populate(ATTEMPT_TA_POPULATE)
      .sort({ attemptNumber: -1 })
      .lean();

    // Retrieve all candidate submissions under this position
    const allSubmissions = await CandidateSubmission.find({ position: positionId })
      .select('_id attempt fileHash unverifiedLabel originalFileName clientShortlistStatus isPlaced createdAt updatedAt')
      .lean();

    // Retrieve all submission sets
    const allSets = await SubmissionSet.find({ position: positionId })
      .select('_id attempt submissionSetId setNumber sentToClientAt cvCount')
      .lean();

    // Retrieve all interviews
    const allInterviews = await Interview.find({ position: positionId })
      .select('_id attempt candidateSubmission round status decision interviewDate createdAt')
      .lean();

    // Retrieve all placements
    const allPlacements = await Placement.find({ position: positionId })
      .select('_id attempt candidateSubmission candidateName status placementDate salary')
      .lean();

    // Cumulative deduplication (candidate identity across all attempts)
    const globalCandidateIdentitySet = new Set(
      allSubmissions.map(s => s.fileHash || s.unverifiedLabel || String(s._id))
    );
    const globalUniqueCandidates = globalCandidateIdentitySet.size;

    const globalInterviewedCandidateIds = new Set(
      allInterviews.map(i => String(i.candidateSubmission))
    );

    // Compute metrics for each attempt
    const attemptsWithMetrics = attempts.map(att => {
      const attIdStr = String(att._id);

      // Submissions in this attempt
      const attSubs = allSubmissions.filter(s => String(s.attempt) === attIdStr);
      const attSubCount = attSubs.length;

      // Unique candidates within this attempt
      const attCandidateIdentitySet = new Set(
        attSubs.map(s => s.fileHash || s.unverifiedLabel || String(s._id))
      );
      const attUniqueCandidates = attCandidateIdentitySet.size;

      // Sets in this attempt
      const attSets = allSets.filter(st => String(st.attempt) === attIdStr);

      // Client shortlisted in this attempt
      const attShortlisted = attSubs.filter(s => s.clientShortlistStatus === 'Shortlisted').length;

      // Interviews in this attempt
      const attInvs = allInterviews.filter(i => String(i.attempt) === attIdStr);
      const attUniqueInterviewed = new Set(attInvs.map(i => String(i.candidateSubmission))).size;

      // Placements in this attempt
      const attPlacements = allPlacements.filter(p => String(p.attempt) === attIdStr);

      // Latest activity calculation
      const dates = [
        att.updatedAt || att.startDate,
        ...attSubs.map(s => s.updatedAt || s.createdAt),
        ...attInvs.map(i => i.createdAt || i.interviewDate),
        ...attPlacements.map(p => p.placementDate)
      ].filter(Boolean);

      const latestActivity = dates.length ? new Date(Math.max(...dates.map(d => new Date(d).getTime()))) : att.startDate;

      return {
        ...att,
        candidateSubmissionsCount: attSubCount,
        uniqueCandidatesCount: attUniqueCandidates,
        submissionSetsCount: attSets.length,
        clientShortlistedCount: attShortlisted,
        interviewEventsCount: attInvs.length,
        uniqueInterviewedCount: attUniqueInterviewed,
        placementCount: attPlacements.length,
        latestActivity
      };
    });

    res.json({
      position: {
        _id: position._id,
        jobOrderId: position.jobOrderId,
        position: position.position,
        clientName: position.client?.clientName || 'Unknown Client',
        status: position.status,
        assignee: position.assignee
      },
      cumulative: {
        totalAttempts: attempts.length,
        totalCandidateSubmissions: allSubmissions.length,
        uniqueCandidates: globalUniqueCandidates,
        totalSubmissionSets: allSets.length,
        totalInterviewEvents: allInterviews.length,
        uniqueCandidatesInterviewed: globalInterviewedCandidateIds.size,
        totalPlacements: allPlacements.length
      },
      attempts: attemptsWithMetrics
    });
  } catch (err) {
    console.error('Error fetching position attempts summary:', err);
    res.status(500).json({ error: 'Failed to retrieve position attempts summary', details: err.message });
  }
};

/**
 * 2. Detailed Drill-Down for a Single Attempt
 */
exports.getAttemptDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const attempt = await PositionAttempt.findById(id)
      .populate('position', 'jobOrderId position client assignee status')
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    if (!attempt) {
      return res.status(404).json({ error: 'Recruitment attempt not found' });
    }

    const [submissions, sets, interviews, placements] = await Promise.all([
      CandidateSubmission.find({ attempt: id })
        .populate('sourcedBy', 'name color')
        .populate('submittedBy', 'name color')
        .sort({ createdAt: -1 })
        .lean(),
      SubmissionSet.find({ attempt: id })
        .populate('uploadedBy', 'name color')
        .sort({ setSequence: 1 })
        .lean(),
      Interview.find({ attempt: id })
        .populate('interviewCoordinator', 'name color')
        .sort({ interviewDate: -1 })
        .lean(),
      Placement.find({ attempt: id })
        .populate('placedBy', 'name color')
        .populate('sourcingTA', 'name color')
        .sort({ placementDate: -1 })
        .lean()
    ]);

    const uniqueCandidates = new Set(
      submissions.map(s => s.fileHash || s.unverifiedLabel || String(s._id))
    ).size;

    const uniqueInterviewed = new Set(
      interviews.map(i => String(i.candidateSubmission))
    ).size;

    res.json({
      attempt,
      metrics: {
        totalSubmissions: submissions.length,
        uniqueCandidates,
        totalSets: sets.length,
        clientShortlisted: submissions.filter(s => s.clientShortlistStatus === 'Shortlisted').length,
        totalInterviews: interviews.length,
        uniqueInterviewed,
        totalPlacements: placements.length
      },
      submissions,
      submissionSets: sets,
      interviews,
      placements
    });
  } catch (err) {
    console.error('Error fetching attempt details:', err);
    res.status(500).json({ error: 'Failed to retrieve attempt details', details: err.message });
  }
};

/**
 * 3. Recruitment Attempt Dashboard & Global Reporting
 */
exports.getAttemptDashboard = async (req, res) => {
  try {
    const { client, position, status, ta, dateFrom, dateTo, search } = req.query;

    const query = {};
    if (position && mongoose.Types.ObjectId.isValid(position)) query.position = position;
    if (status) query.status = status;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      query.$or = [{ primaryTA: ta }, { supportingTAs: ta }];
    }

    if (dateFrom || dateTo) {
      query.startDate = {};
      if (dateFrom) query.startDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const dTo = new Date(dateTo);
        dTo.setHours(23, 59, 59, 999);
        query.startDate.$lte = dTo;
      }
    }

    const attempts = await PositionAttempt.find(query)
      .populate({
        path: 'position',
        select: 'jobOrderId position client status',
        populate: { path: 'client', select: 'clientName' }
      })
      .populate(ATTEMPT_TA_POPULATE)
      .sort({ startDate: -1 })
      .lean();

    // Filter by client if specified
    let filteredAttempts = attempts;
    if (client && mongoose.Types.ObjectId.isValid(client)) {
      filteredAttempts = attempts.filter(a => String(a.position?.client?._id || a.position?.client) === String(client));
    }

    // Filter by search string
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filteredAttempts = filteredAttempts.filter(a =>
        a.jobOrderId?.toLowerCase().includes(s) ||
        a.attemptId?.toLowerCase().includes(s) ||
        a.attemptNumberFormatted?.toLowerCase().includes(s) ||
        a.position?.position?.toLowerCase().includes(s) ||
        a.position?.client?.clientName?.toLowerCase().includes(s)
      );
    }

    // High level metrics
    const totalAttempts = filteredAttempts.length;
    const activeAttempts = filteredAttempts.filter(a => a.status === 'Active').length;
    const completedAttempts = filteredAttempts.filter(a => a.status === 'Completed').length;
    const onHoldAttempts = filteredAttempts.filter(a => a.status === 'On Hold').length;
    const totalPlacements = filteredAttempts.reduce((sum, a) => sum + (a.placementCount || 0), 0);

    res.json({
      summary: {
        totalAttempts,
        activeAttempts,
        completedAttempts,
        onHoldAttempts,
        totalPlacements
      },
      attempts: filteredAttempts
    });
  } catch (err) {
    console.error('Error fetching attempt dashboard:', err);
    res.status(500).json({ error: 'Failed to retrieve attempt dashboard', details: err.message });
  }
};

/**
 * 4. Create New Attempt Under Existing Position
 */
exports.createAttempt = async (req, res) => {
  try {
    const { positionId, primaryTA, supportingTAs, requiredGoodCvTarget, reason, reopenReason, createdBy } = req.body;

    if (!positionId) {
      return res.status(400).json({ error: 'positionId is required' });
    }

    const position = await Position.findById(positionId);
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Prevent duplicate Active attempts on the same position
    const existingActive = await PositionAttempt.findOne({ position: positionId, status: 'Active' });
    if (existingActive) {
      return res.status(400).json({
        error: `An active recruitment attempt (${existingActive.attemptNumberFormatted || 'Attempt #' + existingActive.attemptNumber}) already exists for this position. Please conclude or hold the active attempt before starting a new one.`
      });
    }

    // Allocate Attempt ID and sequence number safely
    const alloc = await PositionAttempt.allocateNextAttempt(positionId);

    const effectivePrimary = primaryTA || position.assignee || null;
    const effectiveSupporting = Array.isArray(supportingTAs) ? supportingTAs : [];

    const newAttempt = new PositionAttempt({
      attemptId: alloc.attemptId,
      position: position._id,
      jobOrderId: position.jobOrderId,
      attemptNumber: alloc.attemptNumber,
      attemptNumberFormatted: alloc.attemptNumberFormatted,
      status: 'Active',
      startDate: new Date(),
      primaryTA: effectivePrimary,
      supportingTAs: effectiveSupporting,
      requiredGoodCvTarget: Number(requiredGoodCvTarget) || 0,
      reason: reason || reopenReason || '',
      reopenReason: reopenReason || reason || '',
      createdBy: createdBy || 'Coordinator',
      legacySnapshot: {
        cvCount: position.cvCount,
        extShortlistCount: position.extShortlistCount,
        lsCount: position.lsCount || null,
        targetCvCount: position.targetCvCount || null
      }
    });

    await newAttempt.save();

    const populated = await PositionAttempt.findById(newAttempt._id)
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    res.status(201).json({
      message: 'Recruitment attempt created successfully',
      attempt: populated
    });
  } catch (err) {
    console.error('Error creating attempt:', err);
    res.status(500).json({ error: 'Failed to create recruitment attempt', details: err.message });
  }
};

/**
 * 5. Update Attempt Status & Properties
 */
exports.updateAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, outcome, primaryTA, supportingTAs, requiredGoodCvTarget, reason, notes, endDate } = req.body;

    const attempt = await PositionAttempt.findById(id);
    if (!attempt) {
      return res.status(404).json({ error: 'Recruitment attempt not found' });
    }

    if (status !== undefined) attempt.status = status;
    if (outcome !== undefined) attempt.outcome = outcome;
    if (primaryTA !== undefined) attempt.primaryTA = primaryTA || null;
    if (supportingTAs !== undefined && Array.isArray(supportingTAs)) attempt.supportingTAs = supportingTAs;
    if (requiredGoodCvTarget !== undefined) attempt.requiredGoodCvTarget = Number(requiredGoodCvTarget) || 0;
    if (reason !== undefined) attempt.reason = reason.trim();
    if (notes !== undefined) attempt.notes = notes.trim();
    if (endDate !== undefined) attempt.endDate = endDate ? new Date(endDate) : null;

    if (status === 'Completed' && !attempt.endDate) {
      attempt.endDate = new Date();
    }

    await attempt.save();

    const populated = await PositionAttempt.findById(attempt._id)
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    res.json({
      message: 'Attempt updated successfully',
      attempt: populated
    });
  } catch (err) {
    console.error('Error updating attempt:', err);
    res.status(500).json({ error: 'Failed to update recruitment attempt', details: err.message });
  }
};
