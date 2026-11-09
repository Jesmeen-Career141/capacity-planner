const mongoose = require('mongoose');
const { Interview, ROUND_VALUES, STATUS_VALUES, DECISION_VALUES, MODE_VALUES } = require('../models/Interview');
const CandidateSubmission = require('../models/CandidateSubmission');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const Client = require('../models/Client');
const TA = require('../models/TA');
const { getNextSequence } = require('../models/ActivityCounter');

const ROUND_SEQUENCE_MAP = {
  'First Round': 1,
  'Second Round': 2,
  'Third Round': 3,
  'Final Round': 4
};

/**
 * 1. Get Interviews with Server-Side Filtering, Sorting & Pagination
 */
exports.getInterviews = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      client,
      position,
      ta,
      candidate,
      round,
      status,
      decision,
      search,
      sortBy = 'interviewDate',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    // Date range filter
    if (dateFrom || dateTo) {
      query.interviewDate = {};
      if (dateFrom) query.interviewDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const dTo = new Date(dateTo);
        dTo.setHours(23, 59, 59, 999);
        query.interviewDate.$lte = dTo;
      }
    }

    // Specific entity filters
    if (client && mongoose.Types.ObjectId.isValid(client)) query.client = client;
    if (position && mongoose.Types.ObjectId.isValid(position)) query.position = position;
    if (req.query.attempt && mongoose.Types.ObjectId.isValid(req.query.attempt)) query.attempt = req.query.attempt;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      query.$or = [{ sourcingTA: ta }, { interviewCoordinator: ta }];
    }
    if (round && ROUND_VALUES.includes(round)) query.round = round;
    if (status && STATUS_VALUES.includes(status)) query.status = status;
    if (decision && DECISION_VALUES.includes(decision)) query.decision = decision;

    // Candidate filter (by ID or name regex)
    if (candidate) {
      if (mongoose.Types.ObjectId.isValid(candidate)) {
        query.candidateSubmission = candidate;
      } else {
        query.candidateName = { $regex: candidate.trim(), $options: 'i' };
      }
    }

    // Free text search
    if (search && search.trim()) {
      const s = search.trim();
      const searchRegex = { $regex: s, $options: 'i' };
      const searchConditions = [
        { candidateName: searchRegex },
        { jobOrderId: searchRegex },
        { clientName: searchRegex },
        { positionName: searchRegex },
        { interviewerName: searchRegex },
        { interviewId: searchRegex }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortField = sortBy || 'interviewDate';
    const sortObj = { [sortField]: sortDir };
    if (sortField !== '_id') sortObj._id = -1;

    const [interviews, total] = await Promise.all([
      Interview.find(query)
        .populate('client', 'clientName')
        .populate('position', 'jobOrderId position pLevel status')
        .populate('sourcingTA', 'name color')
        .populate('interviewCoordinator', 'name color')
        .populate('submissionSet', 'submissionSetId setNumber')
        .populate('candidateSubmission', 'originalFileName unverifiedLabel clientShortlistStatus qualityRating')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Interview.countDocuments(query)
    ]);

    res.json({
      interviews,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (err) {
    console.error('Error fetching interviews:', err);
    res.status(500).json({ error: 'Failed to fetch interviews', details: err.message });
  }
};

/**
 * 2. Get Single Interview by ID
 */
exports.getInterviewById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { interviewId: id };

    const interview = await Interview.findOne(query)
      .populate('client', 'clientName')
      .populate('position', 'jobOrderId position pLevel status assignee')
      .populate('sourcingTA', 'name color')
      .populate('interviewCoordinator', 'name color')
      .populate('submissionSet', 'submissionSetId setNumber sentToClientAt')
      .populate('candidateSubmission', 'originalFileName unverifiedLabel clientShortlistStatus qualityRating internalShortlistStatus')
      .lean();

    if (!interview) {
      return res.status(404).json({ error: 'Interview record not found' });
    }

    res.json(interview);
  } catch (err) {
    console.error('Error fetching interview by ID:', err);
    res.status(500).json({ error: 'Failed to retrieve interview', details: err.message });
  }
};

/**
 * 3. Schedule New Interview
 */
exports.createInterview = async (req, res) => {
  try {
    const {
      candidateSubmissionId,
      positionId,
      round = 'First Round',
      interviewDate,
      interviewDateStr,
      interviewTime,
      interviewMode = 'Online',
      meetingLinkOrLocation = '',
      interviewerName = '',
      interviewerDesignation = '',
      schedulingNotes = '',
      interviewCoordinatorId = null,
      createdBy = null,
      candidateName: customCandidateName
    } = req.body;

    if (!candidateSubmissionId) {
      return res.status(400).json({ error: 'candidateSubmissionId is required' });
    }
    if (!positionId) {
      return res.status(400).json({ error: 'positionId is required' });
    }
    if (!interviewDate || (!interviewDateStr && isNaN(new Date(interviewDate).getTime()))) {
      return res.status(400).json({ error: 'Valid interviewDate is required' });
    }
    if (!interviewTime || !interviewTime.trim()) {
      return res.status(400).json({ error: 'interviewTime is required' });
    }
    if (!ROUND_VALUES.includes(round)) {
      return res.status(400).json({ error: `Invalid round. Must be one of: ${ROUND_VALUES.join(', ')}` });
    }

    // Retrieve Candidate Submission and Position
    const [candidateSub, pos] = await Promise.all([
      CandidateSubmission.findById(candidateSubmissionId),
      Position.findById(positionId).populate('client', 'clientName').populate('assignee', 'name')
    ]);

    if (!candidateSub) {
      return res.status(404).json({ error: 'Candidate submission not found' });
    }
    if (!pos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Resolve candidate name
    const resolvedCandidateName = customCandidateName?.trim() ||
      candidateSub.unverifiedLabel ||
      candidateSub.originalFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    // Resolve date and dateStr
    const actualDate = new Date(interviewDate);
    const dateStr = interviewDateStr || actualDate.toISOString().split('T')[0];

    // Generate unique sequential Interview ID
    const interviewId = await getNextSequence('interview', 'INT-', 4);

    const roundSequence = ROUND_SEQUENCE_MAP[round] || 1;

    // Check if an interview for this candidate and this exact round already exists
    const existingSameRound = await Interview.findOne({
      candidateSubmission: candidateSub._id,
      round
    });

    if (existingSameRound) {
      return res.status(409).json({
        error: `An interview for ${round} is already scheduled or recorded for this candidate (${existingSameRound.interviewId}). Use reschedule or edit instead.`
      });
    }

    let attemptRef = candidateSub.attempt || null;
    let attemptIdVal = null;
    let attemptNumVal = null;
    if (attemptRef) {
      const att = await PositionAttempt.findById(attemptRef).lean();
      if (att) {
        attemptIdVal = att.attemptId || null;
        attemptNumVal = att.attemptNumber || null;
      }
    }

    const newInterview = new Interview({
      interviewId,
      candidateSubmission: candidateSub._id,
      candidateName: resolvedCandidateName,
      position: pos._id,
      jobOrderId: pos.jobOrderId,
      client: pos.client?._id || candidateSub.position,
      clientName: pos.client?.clientName || 'Unknown Client',
      positionName: pos.position,
      attempt: attemptRef,
      attemptId: attemptIdVal,
      attemptNumber: attemptNumVal,
      submissionSet: candidateSub.submissionSet || null,
      submissionSetId: candidateSub.submissionSetId || null,
      sourcingTA: candidateSub.sourcedBy || candidateSub.submittedBy || pos.assignee?._id || null,
      interviewCoordinator: interviewCoordinatorId || pos.assignee?._id || null,
      round,
      roundSequence,
      interviewDate: actualDate,
      interviewDateStr: dateStr,
      interviewTime: interviewTime.trim(),
      interviewMode,
      meetingLinkOrLocation: meetingLinkOrLocation.trim(),
      interviewerName: interviewerName.trim(),
      interviewerDesignation: interviewerDesignation.trim(),
      schedulingNotes: schedulingNotes.trim(),
      status: 'Scheduled',
      decision: 'Pending',
      auditTrail: [
        {
          action: 'Created',
          changedBy: createdBy || 'Coordinator',
          changedAt: new Date(),
          details: `Scheduled ${round} on ${dateStr} at ${interviewTime.trim()}`
        }
      ],
      createdBy: createdBy || null
    });

    await newInterview.save();

    res.status(201).json({
      message: 'Interview successfully scheduled',
      interview: newInterview
    });
  } catch (err) {
    console.error('Error creating interview:', err);
    res.status(500).json({ error: 'Failed to schedule interview', details: err.message });
  }
};

/**
 * 4. Update General Interview Details
 */
exports.updateInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      interviewMode,
      meetingLinkOrLocation,
      interviewerName,
      interviewerDesignation,
      schedulingNotes,
      interviewCoordinatorId,
      updatedBy = 'Coordinator'
    } = req.body;

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interviewMode && MODE_VALUES.includes(interviewMode)) {
      interview.interviewMode = interviewMode;
    }
    if (meetingLinkOrLocation !== undefined) interview.meetingLinkOrLocation = meetingLinkOrLocation.trim();
    if (interviewerName !== undefined) interview.interviewerName = interviewerName.trim();
    if (interviewerDesignation !== undefined) interview.interviewerDesignation = interviewerDesignation.trim();
    if (schedulingNotes !== undefined) interview.schedulingNotes = schedulingNotes.trim();
    if (interviewCoordinatorId !== undefined) interview.interviewCoordinator = interviewCoordinatorId || null;

    interview.auditTrail.push({
      action: 'Details Updated',
      changedBy: updatedBy,
      changedAt: new Date(),
      details: 'Updated interview scheduling/interviewer details'
    });

    await interview.save();
    res.json({ message: 'Interview updated successfully', interview });
  } catch (err) {
    console.error('Error updating interview:', err);
    res.status(500).json({ error: 'Failed to update interview', details: err.message });
  }
};

/**
 * 5. Reschedule Interview (Preserving History)
 */
exports.rescheduleInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      newDate,
      newDateStr,
      newTime,
      reason,
      rescheduledBy = 'Coordinator',
      meetingLinkOrLocation
    } = req.body;

    if (!newDate) {
      return res.status(400).json({ error: 'newDate is required' });
    }
    if (!newTime || !newTime.trim()) {
      return res.status(400).json({ error: 'newTime is required' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Rescheduling reason is strictly required' });
    }

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const nextDate = new Date(newDate);
    const nextDateStr = newDateStr || nextDate.toISOString().split('T')[0];

    // Record historical schedule in rescheduleHistory
    interview.rescheduleHistory.push({
      previousDate: interview.interviewDate,
      previousDateStr: interview.interviewDateStr,
      previousTime: interview.interviewTime,
      newDate: nextDate,
      newDateStr: nextDateStr,
      newTime: newTime.trim(),
      reason: reason.trim(),
      rescheduledBy,
      rescheduledAt: new Date()
    });

    // Update active schedule
    const previousDateText = `${interview.interviewDateStr} ${interview.interviewTime}`;
    interview.interviewDate = nextDate;
    interview.interviewDateStr = nextDateStr;
    interview.interviewTime = newTime.trim();
    interview.status = 'Rescheduled';
    if (meetingLinkOrLocation !== undefined) {
      interview.meetingLinkOrLocation = meetingLinkOrLocation.trim();
    }

    // Append audit log
    interview.auditTrail.push({
      action: 'Rescheduled',
      changedBy: rescheduledBy,
      changedAt: new Date(),
      details: `Rescheduled from ${previousDateText} to ${nextDateStr} ${newTime.trim()}. Reason: ${reason.trim()}`,
      previousValues: {
        date: previousDateText,
        status: interview.status
      },
      newValues: {
        date: `${nextDateStr} ${newTime.trim()}`,
        status: 'Rescheduled'
      }
    });

    await interview.save();

    res.json({
      message: 'Interview successfully rescheduled and history preserved',
      interview
    });
  } catch (err) {
    console.error('Error rescheduling interview:', err);
    res.status(500).json({ error: 'Failed to reschedule interview', details: err.message });
  }
};

/**
 * 6. Update Interview Feedback and Recruitment Decision
 */
exports.updateFeedbackAndDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      feedback,
      interviewerComments,
      candidatePerformanceNotes,
      decision,
      decisionDate,
      nextAction,
      nextInterviewRound,
      nextInterviewDate,
      nextInterviewDateStr,
      updatedBy = 'Coordinator'
    } = req.body;

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (decision && !DECISION_VALUES.includes(decision)) {
      return res.status(400).json({ error: `Invalid decision. Must be one of: ${DECISION_VALUES.join(', ')}` });
    }

    const prevDecision = interview.decision;

    if (feedback !== undefined) interview.feedback = feedback.trim();
    if (interviewerComments !== undefined) interview.interviewerComments = interviewerComments.trim();
    if (candidatePerformanceNotes !== undefined) interview.candidatePerformanceNotes = candidatePerformanceNotes.trim();
    if (nextAction !== undefined) interview.nextAction = nextAction.trim();
    if (nextInterviewRound !== undefined) interview.nextInterviewRound = nextInterviewRound;
    if (nextInterviewDate !== undefined) {
      interview.nextInterviewDate = nextInterviewDate ? new Date(nextInterviewDate) : null;
      interview.nextInterviewDateStr = nextInterviewDateStr || (nextInterviewDate ? new Date(nextInterviewDate).toISOString().split('T')[0] : null);
    }

    if (decision) {
      interview.decision = decision;
      interview.decisionDate = decisionDate ? new Date(decisionDate) : new Date();
    }

    interview.auditTrail.push({
      action: 'Feedback and Decision Updated',
      changedBy: updatedBy,
      changedAt: new Date(),
      details: `Decision: ${prevDecision} -> ${interview.decision}. Feedback updated.`,
      previousValues: { decision: prevDecision },
      newValues: { decision: interview.decision }
    });

    await interview.save();

    res.json({
      message: 'Interview feedback and decision updated successfully',
      interview
    });
  } catch (err) {
    console.error('Error updating feedback and decision:', err);
    res.status(500).json({ error: 'Failed to update feedback and decision', details: err.message });
  }
};

/**
 * 7. Update Operational Status
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note = '', updatedBy = 'Coordinator' } = req.body;

    if (!STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUS_VALUES.join(', ')}` });
    }

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const prevStatus = interview.status;
    interview.status = status;

    interview.auditTrail.push({
      action: 'Status Changed',
      changedBy: updatedBy,
      changedAt: new Date(),
      details: `Status changed from ${prevStatus} to ${status}${note ? ` (${note})` : ''}`,
      previousValues: { status: prevStatus },
      newValues: { status }
    });

    await interview.save();

    res.json({
      message: 'Interview status updated successfully',
      interview
    });
  } catch (err) {
    console.error('Error updating interview status:', err);
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
};

/**
 * 8. Candidate Interview History (Chronological Journey)
 */
exports.getCandidateInterviewHistory = async (req, res) => {
  try {
    const { candidateSubmissionId } = req.params;

    const [candidate, interviews] = await Promise.all([
      CandidateSubmission.findById(candidateSubmissionId)
        .populate('position', 'jobOrderId position pLevel client')
        .populate('sourcedBy', 'name color')
        .populate('submittedBy', 'name color')
        .lean(),
      Interview.find({ candidateSubmission: candidateSubmissionId })
        .populate('interviewCoordinator', 'name color')
        .populate('sourcingTA', 'name color')
        .sort({ roundSequence: 1, interviewDate: 1 })
        .lean()
    ]);

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate submission not found' });
    }

    res.json({
      candidate,
      totalInterviews: interviews.length,
      interviews
    });
  } catch (err) {
    console.error('Error fetching candidate interview history:', err);
    res.status(500).json({ error: 'Failed to retrieve candidate interview history', details: err.message });
  }
};

/**
 * 9. Position-Level Interview Tracking Summary
 */
exports.getPositionInterviewTracking = async (req, res) => {
  try {
    const { positionId } = req.params;

    const [pos, clientShortlistedCount, interviews] = await Promise.all([
      Position.findById(positionId).populate('client', 'clientName').lean(),
      CandidateSubmission.countDocuments({
        position: positionId,
        clientShortlistStatus: 'Shortlisted'
      }),
      Interview.find({ position: positionId })
        .populate('candidateSubmission', 'originalFileName unverifiedLabel clientShortlistStatus')
        .populate('interviewCoordinator', 'name color')
        .populate('sourcingTA', 'name color')
        .sort({ interviewDate: -1 })
        .lean()
    ]);

    if (!pos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Operational event counts
    const totalEvents = interviews.length;
    const scheduled = interviews.filter(i => i.status === 'Scheduled').length;
    const completed = interviews.filter(i => i.status === 'Completed').length;
    const cancelled = interviews.filter(i => i.status === 'Cancelled').length;
    const noShows = interviews.filter(i => i.status === 'No Show').length;
    const rescheduled = interviews.filter(i => i.status === 'Rescheduled').length;
    const withdrew = interviews.filter(i => i.status === 'Withdrew').length;

    // Distinct unique candidates calculations
    const uniqueCandidateIds = new Set(interviews.map(i => String(i.candidateSubmission?._id || i.candidateSubmission)));
    const uniqueCandidatesInterviewed = uniqueCandidateIds.size;

    // Latest interview per candidate to accurately assess current decision state
    const candidateLatestMap = new Map();
    // Interviews are sorted by interviewDate desc, so first seen is latest
    interviews.forEach(inv => {
      const cId = String(inv.candidateSubmission?._id || inv.candidateSubmission);
      if (!candidateLatestMap.has(cId)) {
        candidateLatestMap.set(cId, inv);
      }
    });

    let candidatesShortlistedForNext = 0;
    let candidatesRejected = 0;
    let candidatesDropped = 0;
    let candidatesAwaitingDecision = 0;

    candidateLatestMap.forEach(latestInv => {
      if (latestInv.decision === 'Shortlisted') {
        candidatesShortlistedForNext++;
      } else if (latestInv.decision === 'Rejected') {
        candidatesRejected++;
      } else if (latestInv.decision === 'Dropped' || latestInv.status === 'Withdrew') {
        candidatesDropped++;
      } else if (latestInv.decision === 'Pending' || latestInv.status === 'Completed') {
        candidatesAwaitingDecision++;
      }
    });

    res.json({
      position: {
        _id: pos._id,
        jobOrderId: pos.jobOrderId,
        position: pos.position,
        clientName: pos.client?.clientName || 'Unknown Client',
        status: pos.status
      },
      summary: {
        totalCandidatesShortlistedByClient: clientShortlistedCount,
        totalInterviewEvents: totalEvents,
        uniqueCandidatesInterviewed,
        scheduled,
        completed,
        cancelled,
        noShows,
        rescheduled,
        withdrew,
        candidatesShortlistedForNext,
        candidatesRejected,
        candidatesDropped,
        candidatesAwaitingDecision
      },
      interviews
    });
  } catch (err) {
    console.error('Error fetching position interview tracking:', err);
    res.status(500).json({ error: 'Failed to retrieve position interview tracking', details: err.message });
  }
};

/**
 * 10. Comprehensive Interview Dashboard & Visual Indicators
 */
exports.getInterviewDashboardSummary = async (req, res) => {
  try {
    const { client, position, ta, dateFrom, dateTo } = req.query;

    const filter = {};
    if (client && mongoose.Types.ObjectId.isValid(client)) filter.client = client;
    if (position && mongoose.Types.ObjectId.isValid(position)) filter.position = position;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filter.$or = [{ sourcingTA: ta }, { interviewCoordinator: ta }];
    }
    if (dateFrom || dateTo) {
      filter.interviewDate = {};
      if (dateFrom) filter.interviewDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const dTo = new Date(dateTo);
        dTo.setHours(23, 59, 59, 999);
        filter.interviewDate.$lte = dTo;
      }
    }

    const allInterviews = await Interview.find(filter)
      .populate('candidateSubmission', 'originalFileName unverifiedLabel')
      .populate('position', 'jobOrderId position')
      .populate('client', 'clientName')
      .populate('interviewCoordinator', 'name color')
      .sort({ interviewDate: -1 })
      .lean();

    const totalEvents = allInterviews.length;
    const scheduled = allInterviews.filter(i => i.status === 'Scheduled').length;
    const completed = allInterviews.filter(i => i.status === 'Completed').length;
    const rescheduled = allInterviews.filter(i => i.status === 'Rescheduled').length;
    const cancelled = allInterviews.filter(i => i.status === 'Cancelled').length;
    const noShows = allInterviews.filter(i => i.status === 'No Show').length;
    const withdrew = allInterviews.filter(i => i.status === 'Withdrew').length;

    // Distinct candidate calculations
    const candidateLatestMap = new Map();
    allInterviews.forEach(inv => {
      const cId = String(inv.candidateSubmission?._id || inv.candidateSubmission);
      if (!candidateLatestMap.has(cId)) candidateLatestMap.set(cId, inv);
    });

    const uniqueCandidatesCount = candidateLatestMap.size;
    let shortlistedCandidates = 0;
    let rejectedCandidates = 0;
    let droppedCandidates = 0;
    let pendingDecisions = 0;

    candidateLatestMap.forEach(latestInv => {
      if (latestInv.decision === 'Shortlisted') shortlistedCandidates++;
      else if (latestInv.decision === 'Rejected') rejectedCandidates++;
      else if (latestInv.decision === 'Dropped' || latestInv.status === 'Withdrew') droppedCandidates++;
      else if (latestInv.decision === 'Pending') pendingDecisions++;
    });

    // Actionable visual indicators
    const now = new Date();
    const in7Days = new Date();
    in7Days.setDate(now.getDate() + 7);

    const upcomingInterviews = allInterviews.filter(i =>
      i.status === 'Scheduled' && new Date(i.interviewDate) >= now && new Date(i.interviewDate) <= in7Days
    );

    const awaitingFeedback = allInterviews.filter(i =>
      i.status === 'Completed' && (i.decision === 'Pending' || !i.feedback)
    );

    const pendingDecisionList = allInterviews.filter(i =>
      i.decision === 'Pending'
    );

    // Candidates requiring next round to be arranged:
    // Interview decision is 'Shortlisted' in round 1, 2, or 3, and no higher round scheduled yet
    const candidateRoundsMap = new Map();
    allInterviews.forEach(inv => {
      const cId = String(inv.candidateSubmission?._id || inv.candidateSubmission);
      if (!candidateRoundsMap.has(cId)) candidateRoundsMap.set(cId, []);
      candidateRoundsMap.get(cId).push(inv);
    });

    const requiringNextRound = [];
    candidateRoundsMap.forEach((candidateInvs, cId) => {
      // Sort by roundSequence desc
      candidateInvs.sort((a, b) => b.roundSequence - a.roundSequence);
      const topInv = candidateInvs[0];
      if (topInv.decision === 'Shortlisted' && topInv.roundSequence < 4) {
        requiringNextRound.push({
          candidateSubmissionId: cId,
          candidateName: topInv.candidateName,
          jobOrderId: topInv.jobOrderId,
          clientName: topInv.clientName,
          lastCompletedRound: topInv.round,
          suggestedNextRound: ROUND_VALUES[topInv.roundSequence]
        });
      }
    });

    // Pipeline breakdown by round
    const pipeline = ROUND_VALUES.map(roundName => {
      const roundInvs = allInterviews.filter(i => i.round === roundName);
      const uniqueCandidates = new Set(roundInvs.map(i => String(i.candidateSubmission?._id || i.candidateSubmission))).size;
      return {
        round: roundName,
        totalEvents: roundInvs.length,
        uniqueCandidates,
        scheduled: roundInvs.filter(i => i.status === 'Scheduled').length,
        completed: roundInvs.filter(i => i.status === 'Completed').length,
        shortlisted: roundInvs.filter(i => i.decision === 'Shortlisted').length,
        rejected: roundInvs.filter(i => i.decision === 'Rejected').length,
        pending: roundInvs.filter(i => i.decision === 'Pending').length,
        dropped: roundInvs.filter(i => i.decision === 'Dropped' || i.status === 'Withdrew').length
      };
    });

    res.json({
      summaryCards: {
        totalInterviewEvents: totalEvents,
        uniqueCandidatesInterviewed: uniqueCandidatesCount,
        scheduled,
        completed,
        rescheduled,
        cancelled,
        noShows,
        withdrew,
        pendingDecisions,
        candidatesShortlisted: shortlistedCandidates,
        candidatesRejected: rejectedCandidates,
        candidatesDropped: droppedCandidates
      },
      actionableIndicators: {
        upcomingCount: upcomingInterviews.length,
        awaitingFeedbackCount: awaitingFeedback.length,
        pendingDecisionsCount: pendingDecisionList.length,
        rescheduledCount: rescheduled,
        requiringNextRoundCount: requiringNextRound.length,
        upcomingInterviews: upcomingInterviews.slice(0, 5),
        awaitingFeedback: awaitingFeedback.slice(0, 5),
        requiringNextRound: requiringNextRound.slice(0, 5)
      },
      pipeline
    });
  } catch (err) {
    console.error('Error generating interview dashboard summary:', err);
    res.status(500).json({ error: 'Failed to generate interview dashboard summary', details: err.message });
  }
};

/**
 * 11. Calendar Events (Day / Week / Month Views)
 */
exports.getInterviewCalendarEvents = async (req, res) => {
  try {
    const { start, end, client, position, ta } = req.query;

    const query = {};
    if (start || end) {
      query.interviewDate = {};
      if (start) query.interviewDate.$gte = new Date(start);
      if (end) {
        const dEnd = new Date(end);
        dEnd.setHours(23, 59, 59, 999);
        query.interviewDate.$lte = dEnd;
      }
    }

    if (client && mongoose.Types.ObjectId.isValid(client)) query.client = client;
    if (position && mongoose.Types.ObjectId.isValid(position)) query.position = position;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      query.$or = [{ sourcingTA: ta }, { interviewCoordinator: ta }];
    }

    const interviews = await Interview.find(query)
      .populate('position', 'jobOrderId position')
      .populate('client', 'clientName')
      .populate('interviewCoordinator', 'name color')
      .populate('candidateSubmission', 'originalFileName unverifiedLabel')
      .sort({ interviewDate: 1, interviewTime: 1 })
      .lean();

    const events = interviews.map(inv => ({
      id: inv._id,
      interviewId: inv.interviewId,
      title: `${inv.candidateName} — ${inv.round} (${inv.jobOrderId})`,
      candidateName: inv.candidateName,
      jobOrderId: inv.jobOrderId,
      positionName: inv.positionName,
      clientName: inv.clientName,
      round: inv.round,
      date: inv.interviewDateStr,
      time: inv.interviewTime,
      mode: inv.interviewMode,
      status: inv.status,
      decision: inv.decision,
      interviewer: inv.interviewerName,
      coordinator: inv.interviewCoordinator?.name || 'Unassigned',
      coordinatorColor: inv.interviewCoordinator?.color || 'blue',
      meetingLink: inv.meetingLinkOrLocation
    }));

    res.json(events);
  } catch (err) {
    console.error('Error fetching calendar events:', err);
    res.status(500).json({ error: 'Failed to retrieve calendar events', details: err.message });
  }
};

/**
 * 12. Eligible Candidates for Interview Scheduling
 */
exports.getEligibleCandidates = async (req, res) => {
  try {
    const { positionId } = req.query;

    const filter = {
      clientShortlistStatus: 'Shortlisted',
      isWithdrawn: { $ne: true }
    };

    if (positionId && mongoose.Types.ObjectId.isValid(positionId)) {
      filter.position = positionId;
    }

    const candidates = await CandidateSubmission.find(filter)
      .populate('position', 'jobOrderId position client assignee')
      .populate('submissionSet', 'submissionSetId setNumber')
      .populate('sourcedBy', 'name color')
      .populate('submittedBy', 'name color')
      .sort({ updatedAt: -1 })
      .lean();

    if (!candidates.length) {
      return res.json([]);
    }

    const candidateIds = candidates.map(c => c._id);
    const existingInterviews = await Interview.find({
      candidateSubmission: { $in: candidateIds }
    }).select('candidateSubmission round roundSequence status decision interviewDateStr').lean();

    const candidateInterviewMap = new Map();
    existingInterviews.forEach(inv => {
      const cId = String(inv.candidateSubmission);
      if (!candidateInterviewMap.has(cId)) candidateInterviewMap.set(cId, []);
      candidateInterviewMap.get(cId).push(inv);
    });

    const result = candidates.map(c => {
      const cId = String(c._id);
      const invs = candidateInterviewMap.get(cId) || [];
      const completedRounds = invs.map(i => i.round);
      const maxSequence = invs.reduce((max, i) => Math.max(max, i.roundSequence || 0), 0);
      const nextSuggestedRound = maxSequence < 4 ? ROUND_VALUES[maxSequence] : 'Completed All Rounds';

      return {
        _id: c._id,
        candidateName: c.unverifiedLabel || c.originalFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
        originalFileName: c.originalFileName,
        position: c.position,
        submissionSet: c.submissionSet,
        sourcingTA: c.sourcedBy || c.submittedBy || c.position?.assignee,
        existingInterviews: invs,
        completedRounds,
        nextSuggestedRound
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching eligible candidates:', err);
    res.status(500).json({ error: 'Failed to retrieve eligible candidates', details: err.message });
  }
};
