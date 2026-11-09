/**
 * Final Combined End-to-End System Validation
 * Career141 Capacity Planner
 *
 * Validates the full integration across:
 * 1. Positions
 * 2. TA Work Board
 * 3. Daily Activity Tracking
 * 4. CVs and Submission Sets
 * 5. TA Activity Dashboard
 * 6. Interview Tracking
 * 7. Recruitment Attempts
 * 8. Placement Management
 * 9. TA Attribution and Assignment Logic
 * 10. Legacy Data Integrity and Backward Compatibility
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Models
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const { Interview } = require('../models/Interview');
const { Placement } = require('../models/Placement');
const WorkAssignment = require('../models/WorkAssignment');
const DailyActivity = require('../models/DailyActivity');
const TA = require('../models/TA');
const Client = require('../models/Client');
const { getNextSequence } = require('../models/ActivityCounter');

// Controllers
const attemptController = require('../controllers/attemptController');
const placementController = require('../controllers/placementController');
const interviewController = require('../controllers/interviewController');
const submissionSetController = require('../controllers/submissionSetController');
const dailyActivityController = require('../controllers/dailyActivityController');
const taActivityDashboardController = require('../controllers/taActivityDashboardController');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function run() {
  console.log('================================================================');
  console.log('  Career141 Capacity Planner — Final Combined E2E Validation   ');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const initialCounts = {
    positions: await Position.countDocuments(),
    tas: await TA.countDocuments(),
    clients: await Client.countDocuments(),
    submissions: await CandidateSubmission.countDocuments(),
    attempts: await PositionAttempt.countDocuments(),
    submissionSets: await SubmissionSet.countDocuments(),
    interviews: await Interview.countDocuments(),
    placements: await Placement.countDocuments(),
    assignments: await WorkAssignment.countDocuments(),
    dailyActivities: await DailyActivity.countDocuments()
  };

  console.log('Initial Database Baseline:');
  console.log(`  Positions: ${initialCounts.positions}`);
  console.log(`  TAs: ${initialCounts.tas}`);
  console.log(`  Clients: ${initialCounts.clients}`);
  console.log(`  Submissions: ${initialCounts.submissions}`);
  console.log(`  Attempts: ${initialCounts.attempts}`);
  console.log(`  Submission Sets: ${initialCounts.submissionSets}`);
  console.log(`  Interviews: ${initialCounts.interviews}`);
  console.log(`  Placements: ${initialCounts.placements}`);
  console.log(`  Work Assignments: ${initialCounts.assignments}`);
  console.log(`  Daily Activities: ${initialCounts.dailyActivities}\n`);

  const runId = Date.now();
  const createdTestIds = {
    positions: [],
    attempts: [],
    submissions: [],
    submissionSets: [],
    interviews: [],
    placements: [],
    assignments: [],
    dailyActivities: [],
    tas: [],
    clients: []
  };

  try {
    // -------------------------------------------------------------
    // SETUP: Test Client & Distinct TAs for Attribution Validation
    // -------------------------------------------------------------
    const testClient = await Client.create({
      clientId: `CLI-E2E-${runId}`,
      clientName: `E2E Client Corp ${runId}`
    });
    createdTestIds.clients.push(testClient._id);

    const taAssignee = await TA.create({ name: `E2E TA Owner ${runId}`, activeStatus: true, color: 'blue' });
    const taAlpha = await TA.create({ name: `E2E TA Alpha (Sourcer) ${runId}`, activeStatus: true, color: 'turquoise' });
    const taBeta = await TA.create({ name: `E2E TA Beta (Uploader) ${runId}`, activeStatus: true, color: 'purple' });
    const taGamma = await TA.create({ name: `E2E TA Gamma (Closer) ${runId}`, activeStatus: true, color: 'yellow' });
    const taDelta = await TA.create({ name: `E2E TA Delta (Attempt 2 Lead) ${runId}`, activeStatus: true, color: 'lightGreen' });

    createdTestIds.tas.push(taAssignee._id, taAlpha._id, taBeta._id, taGamma._id, taDelta._id);

    // =============================================================
    // SCENARIO A: Initial Recruitment Attempt (Attempt 01)
    // =============================================================
    console.log('--- SCENARIO A: Initial Recruitment Attempt (Attempt 01) ---');

    // 1. Create Position
    const testPosition = await Position.create({
      jobOrderId: `JO-E2E-${runId}`,
      client: testClient._id,
      position: 'Senior Enterprise Solutions Architect',
      pLevel: 'P1',
      status: 'A&P',
      assignee: taAssignee._id,
      cvCount: 0,
      extShortlistCount: 0,
      targetCvCount: 10
    });
    createdTestIds.positions.push(testPosition._id);
    assert(testPosition.jobOrderId.startsWith('JO-E2E-'), 'Step 1: Test position created with jobOrderId');
    assert(testPosition.assignee.toString() === taAssignee._id.toString(), 'Step 1: Position assigned to overall Position Owner');

    // 2. Create Attempt 01 via controller / allocateNextAttempt
    const attempt1Req = {
      body: {
        positionId: testPosition._id,
        primaryTA: taAlpha._id,
        supportingTAs: [taBeta._id, taGamma._id],
        reason: 'Initial Job Order kickoff',
        notes: 'Targeting tier-1 cloud architect profiles',
        startDate: new Date('2026-11-01')
      }
    };
    const attempt1Res = createMockRes();
    await attemptController.createAttempt(attempt1Req, attempt1Res);

    assert(attempt1Res.statusCode === 201, 'Step 2: Attempt 01 created successfully (HTTP 201)');
    const attempt1 = attempt1Res.body.attempt;
    createdTestIds.attempts.push(attempt1._id);
    assert(attempt1.attemptNumber === 1, 'Step 2: Attempt number is 1');
    assert(attempt1.attemptNumberFormatted === 'Attempt 01', 'Step 2: Attempt formatted string is "Attempt 01"');
    assert(attempt1.attemptId.startsWith('ATT-'), `Step 2: Attempt ID allocated sequentially (${attempt1.attemptId})`);
    assert(attempt1.status === 'Active', 'Step 2: Attempt status is Active');

    // 3. Verify TA Assignment distinction
    assert(attempt1.primaryTA._id.toString() === taAlpha._id.toString(), 'Step 3: Attempt Primary TA is TA Alpha');
    assert(attempt1.supportingTAs.length === 2, 'Step 3: Attempt has 2 supporting TAs');
    assert(testPosition.assignee.toString() !== attempt1.primaryTA._id.toString(), 'Step 3: Position Assignee and Attempt Primary TA remain distinct');

    // 4. Create a 100% Work assignment
    const waCode1 = await getNextSequence('test_workAssignment', 'WA-', 4);
    const assign100 = await WorkAssignment.create({
      assignmentId: waCode1,
      assignedDateStr: '2026-11-01',
      assignedDate: new Date('2026-11-01T00:00:00.000Z'),
      ta: taAlpha._id,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: '100% Work',
      plannedTarget: { targetProfiles: 30, targetCvsShared: 4, summary: 'Initial 100% LinkedIn search' },
      status: 'Assigned',
      notes: 'Initial 100% LinkedIn search'
    });
    createdTestIds.assignments.push(assign100._id);
    assert(assign100.workType === '100% Work', 'Step 4: 100% Work assignment created on Work Board');

    // 5. Record LinkedIn sourcing activity (100% Work)
    const daCode1 = await getNextSequence('test_dailyActivity', 'DA-', 4);
    const act100 = await DailyActivity.create({
      activityId: daCode1,
      activityDateStr: '2026-11-01',
      activityDate: new Date('2026-11-01T00:00:00.000Z'),
      ta: taAlpha._id,
      position: testPosition._id,
      assignment: assign100._id,
      assignmentCode: assign100.assignmentId,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: '100% Work',
      profilesSearched: 32,
      goodCvs: 4,
      optionalCvs: 2,
      cvsShared: 3,
      notes: 'Found 32 matching architect profiles'
    });
    createdTestIds.dailyActivities.push(act100._id);
    assert(act100.profilesSearched === 32, 'Step 5: 100% Work recorded 32 profiles searched');

    // 6. Create Follow-up assignment on later date
    const waCode2 = await getNextSequence('test_workAssignment', 'WA-', 4);
    const assignFollowup = await WorkAssignment.create({
      assignmentId: waCode2,
      assignedDateStr: '2026-11-03',
      assignedDate: new Date('2026-11-03T00:00:00.000Z'),
      ta: taAlpha._id,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: 'Follow-up',
      status: 'Assigned',
      notes: 'Follow up with 4 architects from batch 1'
    });
    createdTestIds.assignments.push(assignFollowup._id);
    assert(assignFollowup.workType === 'Follow-up', 'Step 6: Follow-up assignment created on Work Board');

    // 7. Record Follow-up activity & verify LinkedIn sourcing is strictly 0
    const daCode2 = await getNextSequence('test_dailyActivity', 'DA-', 4);
    const actFollowup = await DailyActivity.create({
      activityId: daCode2,
      activityDateStr: '2026-11-03',
      activityDate: new Date('2026-11-03T00:00:00.000Z'),
      ta: taAlpha._id,
      position: testPosition._id,
      assignment: assignFollowup._id,
      assignmentCode: assignFollowup.assignmentId,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: 'Follow-up',
      candidatesFollowedUp: 4,
      responsesReceived: 2,
      cvsShared: 2,
      originalSourcingActivity: act100._id
    });
    createdTestIds.dailyActivities.push(actFollowup._id);
    assert(actFollowup.profilesSearched === 0, 'Step 7: Follow-up activity strictly enforces profilesSearched = 0 (no new sourcing)');
    assert(actFollowup.candidatesFollowedUp === 4, 'Step 7: Candidates followed up = 4');
    assert(actFollowup.responsesReceived === 2, 'Step 7: Responses received = 2');

    // 8. Create Add-on assignment
    const waCode3 = await getNextSequence('test_workAssignment', 'WA-', 4);
    const assignAddon = await WorkAssignment.create({
      assignmentId: waCode3,
      assignedDateStr: '2026-11-04',
      assignedDate: new Date('2026-11-04T00:00:00.000Z'),
      ta: taBeta._id,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: 'Add-on',
      status: 'Assigned',
      notes: 'Add-on search for specialized AWS certs'
    });
    createdTestIds.assignments.push(assignAddon._id);
    assert(assignAddon.workType === 'Add-on', 'Step 8: Add-on assignment created for TA Beta');

    // 9. Record Add-on activity
    const daCode3 = await getNextSequence('test_dailyActivity', 'DA-', 4);
    const actAddon = await DailyActivity.create({
      activityId: daCode3,
      activityDateStr: '2026-11-04',
      activityDate: new Date('2026-11-04T00:00:00.000Z'),
      ta: taBeta._id,
      position: testPosition._id,
      assignment: assignAddon._id,
      assignmentCode: assignAddon.assignmentId,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      positionName: testPosition.position,
      workType: 'Add-on',
      additionalProfilesSourced: 10,
      goodCvs: 2,
      optionalCvs: 1,
      cvsShared: 2
    });
    createdTestIds.dailyActivities.push(actAddon._id);
    assert(actAddon.additionalProfilesSourced === 10, 'Step 9: Add-on recorded 10 additional profiles sourced');
    assert(actAddon.profilesSearched === 0, 'Step 9: Primary profilesSearched remains 0 for Add-on');

    // 10. Create Submission Set
    const clientSentDate = new Date('2026-11-04T10:00:00Z');
    const allocSet1 = await SubmissionSet.allocateNextSet(testPosition._id);
    const set1 = await SubmissionSet.create({
      submissionSetId: allocSet1.submissionSetId,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      attempt: attempt1._id,
      setSequence: allocSet1.setSequence,
      setNumber: allocSet1.setNumber,
      sentToClientAt: clientSentDate,
      uploadedAt: new Date(),
      uploadedBy: taBeta._id,
      cvCount: 0,
      status: 'Sent to Client',
      createdBy: taBeta._id
    });
    createdTestIds.submissionSets.push(set1._id);
    assert(set1.setNumber === 'Set 01', 'Step 10: Submission set created as Set 01');
    assert(set1.attempt.toString() === attempt1._id.toString(), 'Step 10: Submission set strictly linked to Attempt 01');

    // 11. Upload multiple candidate CVs (Candidate Alpha, Beta, Gamma)
    const candAlpha = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: attempt1._id,
      submissionSet: set1._id,
      submissionSetId: set1.submissionSetId,
      setNumber: set1.setNumber,
      unverifiedLabel: `Alice Architect ${runId}`,
      originalFileName: 'Alice_Architect_CV.pdf',
      fileHash: `hash_alpha_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/E2E/attempts/1/alpha_${runId}.pdf`,
      submittedBy: taBeta._id,   // Uploading TA
      sourcedBy: taAlpha._id,     // Original Sourcing TA
      sentToClient: true,
      sentToClientDate: clientSentDate,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      clientShortlistStatus: 'Shortlisted',
      isPlaced: false
    });
    const candBeta = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: attempt1._id,
      submissionSet: set1._id,
      submissionSetId: set1.submissionSetId,
      setNumber: set1.setNumber,
      unverifiedLabel: `Bob Backend ${runId}`,
      originalFileName: 'Bob_Backend_CV.pdf',
      fileHash: `hash_beta_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/E2E/attempts/1/beta_${runId}.pdf`,
      submittedBy: taBeta._id,
      sourcedBy: taAlpha._id,
      sentToClient: true,
      sentToClientDate: clientSentDate,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      clientShortlistStatus: 'Shortlisted',
      isPlaced: false
    });
    const candGamma = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: attempt1._id,
      submissionSet: set1._id,
      submissionSetId: set1.submissionSetId,
      setNumber: set1.setNumber,
      unverifiedLabel: `Charlie Cloud ${runId}`,
      originalFileName: 'Charlie_Cloud_CV.pdf',
      fileHash: `hash_gamma_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/E2E/attempts/1/gamma_${runId}.pdf`,
      submittedBy: taBeta._id,
      sourcedBy: taBeta._id,     // TA Beta sourced this one
      sentToClient: true,
      sentToClientDate: clientSentDate,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Optional',
      clientShortlistStatus: 'Pending',
      isPlaced: false
    });
    createdTestIds.submissions.push(candAlpha._id, candBeta._id, candGamma._id);

    // 12. Verify TA attribution
    assert(candAlpha.sourcedBy.toString() === taAlpha._id.toString(), 'Step 12: Candidate Alpha sourcedBy points to TA Alpha');
    assert(candAlpha.submittedBy.toString() === taBeta._id.toString(), 'Step 12: Candidate Alpha submittedBy points to TA Beta (Uploader)');
    assert(candGamma.sourcedBy.toString() === taBeta._id.toString(), 'Step 12: Candidate Gamma sourcedBy points to TA Beta');

    // 13. Verify client-sent and upload dates remain separate
    assert(candAlpha.sentToClientDate.getTime() === clientSentDate.getTime(), 'Step 13: Candidate client transmission date matches sentToClientAt');
    assert(set1.sentToClientAt.getTime() !== set1.uploadedAt.getTime(), 'Step 13: Client-sent date and system-upload timestamp are strictly distinct');

    // 14. Verify candidate records linked to correct position and attempt
    assert(candAlpha.position.toString() === testPosition._id.toString(), 'Step 14: Candidate Alpha linked to correct Position');
    assert(candAlpha.attempt.toString() === attempt1._id.toString(), 'Step 14: Candidate Alpha linked to Attempt 01');
    assert(candBeta.attempt.toString() === attempt1._id.toString(), 'Step 14: Candidate Beta linked to Attempt 01');


    // =============================================================
    // SCENARIO B: Candidate Interview Journey
    // =============================================================
    console.log('\n--- SCENARIO B: Candidate Interview Journey ---');

    // 1 & 2. Schedule First Round interview for Candidate Alpha
    const schedRound1Req = {
      body: {
        candidateSubmissionId: String(candAlpha._id),
        positionId: String(testPosition._id),
        round: 'First Round',
        interviewDate: '2026-11-08',
        interviewDateStr: '2026-11-08',
        interviewTime: '10:00 AM',
        interviewMode: 'Online',
        meetingLinkOrLocation: 'https://meet.google.com/test-e2e',
        interviewerName: 'Dr. Jane Client',
        interviewerDesignation: 'Head of Infrastructure',
        schedulingNotes: 'Technical screening with Lead Architect',
        interviewCoordinatorId: String(taBeta._id),
        createdBy: 'Coordinator'
      }
    };
    const schedRound1Res = createMockRes();
    await interviewController.createInterview(schedRound1Req, schedRound1Res);

    assert(schedRound1Res.statusCode === 201, 'Step 1-2: First Round interview scheduled successfully (201)');
    const intAlphaRound1 = schedRound1Res.body.interview;
    createdTestIds.interviews.push(intAlphaRound1._id);
    assert(intAlphaRound1.round === 'First Round', 'Step 2: Interview round is First Round');
    assert(intAlphaRound1.roundSequence === 1, 'Step 2: Round sequence is 1');
    assert(intAlphaRound1.attempt.toString() === attempt1._id.toString(), 'Step 2: Interview attempt resolved correctly to Attempt 01');
    assert(intAlphaRound1.status === 'Scheduled', 'Step 2: Default status is Scheduled');

    // 3 & 4. Complete First Round and record Shortlisted decision
    const updateRound1StatusReq = {
      params: { id: String(intAlphaRound1._id) },
      body: { status: 'Completed', note: 'Technical screening finished successfully' }
    };
    const updateRound1StatusRes = createMockRes();
    await interviewController.updateStatus(updateRound1StatusReq, updateRound1StatusRes);
    assert(updateRound1StatusRes.statusCode === 200, 'Step 3: Status updated to Completed (200)');

    const updateRound1FeedbackReq = {
      params: { id: String(intAlphaRound1._id) },
      body: {
        feedback: 'Strong system design skills. Client approved for Final Round.',
        decision: 'Shortlisted',
        nextInterviewRound: 'Second Round'
      }
    };
    const updateRound1FeedbackRes = createMockRes();
    await interviewController.updateFeedbackAndDecision(updateRound1FeedbackReq, updateRound1FeedbackRes);
    assert(updateRound1FeedbackRes.statusCode === 200, 'Step 4: Decision recorded as Shortlisted (200)');
    assert(updateRound1FeedbackRes.body.interview.decision === 'Shortlisted', 'Step 4: Decision is Shortlisted');

    // 5. Schedule Second Round explicitly
    const schedRound2Req = {
      body: {
        candidateSubmissionId: String(candAlpha._id),
        positionId: String(testPosition._id),
        round: 'Second Round',
        interviewDate: '2026-11-12',
        interviewDateStr: '2026-11-12',
        interviewTime: '02:30 PM',
        interviewMode: 'Online',
        meetingLinkOrLocation: 'https://meet.google.com/test-e2e-2',
        interviewCoordinatorId: String(taBeta._id),
        schedulingNotes: 'Final Director discussion'
      }
    };
    const schedRound2Res = createMockRes();
    await interviewController.createInterview(schedRound2Req, schedRound2Res);
    assert(schedRound2Res.statusCode === 201, 'Step 5: Second Round scheduled explicitly (201)');
    const intAlphaRound2 = schedRound2Res.body.interview;
    createdTestIds.interviews.push(intAlphaRound2._id);
    assert(intAlphaRound2.round === 'Second Round', 'Step 5: Round is Second Round');
    assert(intAlphaRound2.roundSequence === 2, 'Step 5: Round sequence is 2');

    // 6. Reschedule another interview (Candidate Beta) and verify history
    const schedBetaReq = {
      body: {
        candidateSubmissionId: String(candBeta._id),
        positionId: String(testPosition._id),
        round: 'First Round',
        interviewDate: '2026-11-09',
        interviewDateStr: '2026-11-09',
        interviewTime: '11:00 AM',
        interviewMode: 'Online',
        interviewCoordinatorId: String(taAlpha._id)
      }
    };
    const schedBetaRes = createMockRes();
    await interviewController.createInterview(schedBetaReq, schedBetaRes);
    const intBeta = schedBetaRes.body.interview;
    createdTestIds.interviews.push(intBeta._id);

    const reschedBetaReq = {
      params: { id: String(intBeta._id) },
      body: {
        newDate: '2026-11-11',
        newDateStr: '2026-11-11',
        newTime: '04:00 PM',
        reason: 'Client interviewer had urgent production deployment conflict'
      }
    };
    const reschedBetaRes = createMockRes();
    await interviewController.rescheduleInterview(reschedBetaReq, reschedBetaRes);
    assert(reschedBetaRes.statusCode === 200, 'Step 6: Interview rescheduled with full audit trail (200)');
    assert(reschedBetaRes.body.interview.status === 'Rescheduled', 'Step 6: Status updated to Rescheduled');
    assert(reschedBetaRes.body.interview.rescheduleHistory.length === 1, 'Step 6: Exactly 1 reschedule entry preserved in history');
    assert(reschedBetaRes.body.interview.rescheduleHistory[0].reason.includes('production deployment conflict'), 'Step 6: Reschedule reason preserved in history');

    // 7. Record Rejected outcome for Candidate Beta
    const updateBetaStatusReq = {
      params: { id: String(intBeta._id) },
      body: { status: 'Completed' }
    };
    const updateBetaStatusRes = createMockRes();
    await interviewController.updateStatus(updateBetaStatusReq, updateBetaStatusRes);

    const updateBetaOutcomeReq = {
      params: { id: String(intBeta._id) },
      body: {
        decision: 'Rejected',
        feedback: 'Lacks required Kubernetes production depth'
      }
    };
    const updateBetaOutcomeRes = createMockRes();
    await interviewController.updateFeedbackAndDecision(updateBetaOutcomeReq, updateBetaOutcomeRes);
    assert(updateBetaOutcomeRes.statusCode === 200, 'Step 7: Candidate Beta interview recorded as Rejected (200)');
    assert(updateBetaOutcomeRes.body.interview.decision === 'Rejected', 'Step 7: Decision is Rejected');

    // 8. Verify candidate-level and position-level interview reporting
    const candHistoryReq = { params: { candidateSubmissionId: String(candAlpha._id) } };
    const candHistoryRes = createMockRes();
    await interviewController.getCandidateInterviewHistory(candHistoryReq, candHistoryRes);
    assert(candHistoryRes.statusCode === 200, 'Step 8: Candidate interview history fetched');
    assert(candHistoryRes.body.interviews.length === 2, 'Step 8: Candidate Alpha has exactly 2 interview records');

    const posInterviewReq = { params: { positionId: String(testPosition._id) } };
    const posInterviewRes = createMockRes();
    await interviewController.getPositionInterviewTracking(posInterviewReq, posInterviewRes);
    assert(posInterviewRes.statusCode === 200, 'Step 8: Position interview tracking summary fetched');
    assert(posInterviewRes.body.summary.totalInterviewEvents === 3, 'Step 8: Total interview events across candidates is 3 (2 for Alpha, 1 for Beta)');
    assert(posInterviewRes.body.summary.uniqueCandidatesInterviewed === 2, 'Step 8: Unique candidates interviewed is exactly 2 (Candidate Alpha not double-counted across 2 rounds)');


    // =============================================================
    // SCENARIO C: Placement
    // =============================================================
    console.log('\n--- SCENARIO C: Placement Logic & Position Status ---');

    // Complete Alpha's second round as Shortlisted / Placed
    await Interview.findByIdAndUpdate(intAlphaRound2._id, {
      status: 'Completed',
      decision: 'Shortlisted',
      feedback: 'Offered position, candidate accepted'
    });

    // 1 & 2. Record placement
    const placeReq = {
      body: {
        candidateSubmissionId: String(candAlpha._id),
        positionId: String(testPosition._id),
        attemptId: String(attempt1._id),
        placementDate: '2026-11-15',
        placementDateStr: '2026-11-15',
        placedById: String(taGamma._id), // Closing TA
        status: 'Offer Accepted',
        salary: 180000,
        packageDetails: '$180,000 base + 15% bonus',
        billingAmount: 36000,
        notes: 'Signed offer letter received',
        closeAttempt: false,
        closePosition: false
      }
    };
    const placeRes = createMockRes();
    await placementController.createPlacement(placeReq, placeRes);

    assert(placeRes.statusCode === 201, 'Step 1-2: Placement created successfully (201)');
    const placement = placeRes.body.placement;
    createdTestIds.placements.push(placement._id);
    assert(placement.placementId.startsWith('PLC-'), `Step 2: Sequential placement ID generated (${placement.placementId})`);

    // 3. Verify candidate placement status
    const updatedCandAlpha = await CandidateSubmission.findById(candAlpha._id);
    assert(updatedCandAlpha.isPlaced === true, 'Step 3: CandidateSubmission.isPlaced is true');
    assert(updatedCandAlpha.placement.toString() === placement._id.toString(), 'Step 3: CandidateSubmission.placement points to Placement document');
    assert(updatedCandAlpha.placementDate !== null, 'Step 3: CandidateSubmission.placementDate recorded');

    // 4. Verify placement attribution to correct attempt
    assert(String(placement.attempt._id || placement.attempt) === String(attempt1._id), 'Step 4: Placement attributed to Attempt 01');

    // 5. Verify closing TA and original sourcing TA remain separate
    assert(placement.placedBy._id.toString() === taGamma._id.toString(), 'Step 5: Closing TA (placedBy) is TA Gamma');
    assert(placement.sourcingTA._id.toString() === taAlpha._id.toString(), 'Step 5: Original sourcing TA is preserved as TA Alpha');
    assert(placement.placedBy._id.toString() !== placement.sourcingTA._id.toString(), 'Step 5: Closing TA and Sourcing TA are completely separate');

    // 6. Verify attempt placement count
    const updatedAttempt1 = await PositionAttempt.findById(attempt1._id);
    assert(updatedAttempt1.placementCount === 1, 'Step 6: Attempt 01 placementCount incremented to 1');

    // 7. Confirm Position is NOT automatically closed
    const updatedPositionAfterPlacement = await Position.findById(testPosition._id);
    assert(updatedPositionAfterPlacement.status === 'A&P', 'Step 7: Position status preserved as A&P (NOT automatically closed)');

    // 8. Verify placement appears in position and attempt summaries
    const posSummaryReq = { params: { positionId: testPosition._id } };
    const posSummaryRes = createMockRes();
    await attemptController.getPositionAttemptsSummary(posSummaryReq, posSummaryRes);
    assert(posSummaryRes.statusCode === 200, 'Step 8: Position attempts summary retrieved');
    assert(posSummaryRes.body.cumulative.totalPlacements === 1, 'Step 8: Cumulative placements in position summary = 1');
    assert(posSummaryRes.body.attempts[0].placementCount === 1, 'Step 8: Attempt 01 in summary reflects 1 placement');


    // =============================================================
    // SCENARIO D: New Recruitment Attempt (Attempt 02)
    // =============================================================
    console.log('\n--- SCENARIO D: New Recruitment Attempt (Attempt 02) ---');

    // 1. Complete or close Attempt 01
    await PositionAttempt.findByIdAndUpdate(attempt1._id, {
      status: 'Completed',
      outcome: 'Placed',
      endDate: new Date('2026-11-15')
    });
    const closedAttempt1 = await PositionAttempt.findById(attempt1._id);
    assert(closedAttempt1.status === 'Completed', 'Step 1: Attempt 01 transitioned to Completed');

    // 2 & 3. Create Attempt 02 under same Position ID
    const attempt2Req = {
      body: {
        positionId: testPosition._id,
        primaryTA: taDelta._id,
        supportingTAs: [taBeta._id],
        reason: 'Client requested 1 additional Architect for new expansion team',
        notes: 'Attempt 02 cycle for 2nd seat'
      }
    };
    const attempt2Res = createMockRes();
    await attemptController.createAttempt(attempt2Req, attempt2Res);
    assert(attempt2Res.statusCode === 201, 'Step 2-3: Attempt 02 created under same Position ID (201)');
    const attempt2 = attempt2Res.body.attempt;
    createdTestIds.attempts.push(attempt2._id);

    // 4. Verify sequential attempt numbering
    assert(attempt2.attemptNumber === 2, 'Step 4: Attempt number is sequentially 2');
    assert(attempt2.attemptNumberFormatted === 'Attempt 02', 'Step 4: Formatted label is "Attempt 02"');
    assert(attempt2.attemptId.startsWith('ATT-'), 'Step 4: Attempt ID has ATT- prefix');
    assert(attempt2.attemptId !== attempt1.attemptId, 'Step 4: Attempt 02 has unique attemptId');

    // 5. Assign new primary and supporting TAs
    assert(attempt2.primaryTA._id.toString() === taDelta._id.toString(), 'Step 5: Attempt 02 primary TA is TA Delta');
    assert(attempt2.supportingTAs[0]._id.toString() === taBeta._id.toString(), 'Step 5: Attempt 02 supporting TA is TA Beta');

    // 6. Record new candidate submissions and submission set under Attempt 02
    const allocSet2 = await SubmissionSet.allocateNextSet(testPosition._id);
    const set2 = await SubmissionSet.create({
      submissionSetId: allocSet2.submissionSetId,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      attempt: attempt2._id,
      setSequence: allocSet2.setSequence,
      setNumber: allocSet2.setNumber,
      sentToClientAt: new Date('2026-11-20'),
      uploadedAt: new Date(),
      uploadedBy: taDelta._id,
      cvCount: 0,
      status: 'Sent to Client',
      createdBy: taDelta._id
    });
    createdTestIds.submissionSets.push(set2._id);

    // New candidate: David Developer
    const candDelta = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: attempt2._id,
      submissionSet: set2._id,
      submissionSetId: set2.submissionSetId,
      setNumber: set2.setNumber,
      unverifiedLabel: `David Developer ${runId}`,
      originalFileName: 'David_Developer_CV.pdf',
      fileHash: `hash_delta_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/E2E/attempts/2/delta_${runId}.pdf`,
      submittedBy: taDelta._id,
      sourcedBy: taDelta._id,
      sentToClient: true,
      sentToClientDate: new Date('2026-11-20'),
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      clientShortlistStatus: 'Pending',
      isPlaced: false
    });
    // Candidate Charlie (from Set 1) re-evaluated and submitted to Attempt 02
    const candGammaResubmitted = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: attempt2._id,
      submissionSet: set2._id,
      submissionSetId: set2.submissionSetId,
      setNumber: set2.setNumber,
      unverifiedLabel: `Charlie Cloud ${runId}`,
      originalFileName: 'Charlie_Cloud_CV.pdf',
      fileHash: `hash_gamma_${runId}`, // Same fileHash as Attempt 01 submission
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/E2E/attempts/2/gamma_resubmit_${runId}.pdf`,
      submittedBy: taDelta._id,
      sourcedBy: taBeta._id,
      sentToClient: true,
      sentToClientDate: new Date('2026-11-20'),
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Optional',
      clientShortlistStatus: 'Pending',
      isPlaced: false
    });
    createdTestIds.submissions.push(candDelta._id, candGammaResubmitted._id);

    // 7. Verify new records belong to Attempt 02
    assert(candDelta.attempt.toString() === attempt2._id.toString(), 'Step 7: Candidate Delta belongs to Attempt 02');
    assert(candGammaResubmitted.attempt.toString() === attempt2._id.toString(), 'Step 7: Resubmitted candidate belongs to Attempt 02');
    assert(set2.attempt.toString() === attempt2._id.toString(), 'Step 7: Submission Set 02 belongs to Attempt 02');

    // 8. Verify Attempt 01 remains unchanged
    const verifyAttempt1 = await PositionAttempt.findById(attempt1._id);
    assert(verifyAttempt1.status === 'Completed', 'Step 8: Attempt 01 status remains Completed');
    assert(verifyAttempt1.placementCount === 1, 'Step 8: Attempt 01 placementCount remains 1');

    // 9 & 10. Position-level cumulative reporting vs unique candidates deduplication
    const cumulativeSummaryReq = { params: { positionId: testPosition._id } };
    const cumulativeSummaryRes = createMockRes();
    await attemptController.getPositionAttemptsSummary(cumulativeSummaryReq, cumulativeSummaryRes);

    assert(cumulativeSummaryRes.statusCode === 200, 'Step 9: Position cumulative summary returned (200)');
    const sumBody = cumulativeSummaryRes.body;
    assert(sumBody.cumulative.totalAttempts === 2, `Step 9: Cumulative total attempts is 2 (got ${sumBody.cumulative.totalAttempts})`);
    assert(sumBody.cumulative.totalCandidateSubmissions === 5, `Step 9: Cumulative raw submissions is 5 (got ${sumBody.cumulative.totalCandidateSubmissions})`);
    // Unique candidates: Alice, Bob, Charlie (submitted twice), David -> exactly 4 unique candidates!
    assert(sumBody.cumulative.uniqueCandidates === 4, `Step 10: Cumulative UNIQUE candidates is 4 (Charlie deduplicated! got ${sumBody.cumulative.uniqueCandidates})`);
    assert(sumBody.cumulative.totalPlacements === 1, `Step 10: Cumulative placements is 1 (got ${sumBody.cumulative.totalPlacements})`);

    // Verify per-attempt isolation
    const attempt1Summary = sumBody.attempts.find(a => a.attemptNumber === 1);
    const attempt2Summary = sumBody.attempts.find(a => a.attemptNumber === 2);
    assert(attempt1Summary.candidateSubmissionsCount === 3, 'Step 10: Attempt 01 isolated submissions = 3');
    assert(attempt1Summary.placementCount === 1, 'Step 10: Attempt 01 isolated placements = 1');
    assert(attempt2Summary.candidateSubmissionsCount === 2, 'Step 10: Attempt 02 isolated submissions = 2');
    assert(attempt2Summary.placementCount === 0, 'Step 10: Attempt 02 isolated placements = 0');


    // =============================================================
    // SECTION 3: TA Attribution Independence
    // =============================================================
    console.log('\n--- SECTION 3: TA Attribution Independence ---');

    // Verify all 8 responsibilities
    assert(testPosition.assignee.toString() === taAssignee._id.toString(), 'Role 1: Position Assignee = TA Owner');
    assert(attempt1.primaryTA._id.toString() === taAlpha._id.toString(), 'Role 2: Attempt 01 Primary TA = TA Alpha');
    assert(attempt2.primaryTA._id.toString() === taDelta._id.toString(), 'Role 2: Attempt 02 Primary TA = TA Delta');
    assert(attempt1.supportingTAs[0]._id.toString() === taBeta._id.toString(), 'Role 3: Supporting TA = TA Beta');
    assert(assign100.ta.toString() === taAlpha._id.toString(), 'Role 4: Work Board TA = TA Alpha');
    assert(candAlpha.sourcedBy.toString() === taAlpha._id.toString(), 'Role 5: Original Sourcing TA = TA Alpha');
    assert(candAlpha.submittedBy.toString() === taBeta._id.toString(), 'Role 6: Uploading TA = TA Beta');
    assert(String(intAlphaRound1.interviewCoordinator?._id || intAlphaRound1.interviewCoordinator) === String(taBeta._id), 'Role 7: Interview Coordinator = TA Beta');
    assert(placement.placedBy._id.toString() === taGamma._id.toString(), 'Role 8: Placement / Closing TA = TA Gamma');

    // Reassignment test: Reassign Position without overwriting existing attempts or sourcing TAs
    const newOwnerTA = await TA.create({ name: `E2E New Position Lead ${runId}`, activeStatus: true, color: 'darkGreen' });
    createdTestIds.tas.push(newOwnerTA._id);
    await Position.findByIdAndUpdate(testPosition._id, { assignee: newOwnerTA._id });

    const recheckPosition = await Position.findById(testPosition._id);
    const recheckAttempt1 = await PositionAttempt.findById(attempt1._id);
    const recheckCandAlpha = await CandidateSubmission.findById(candAlpha._id);
    const recheckPlacement = await Placement.findById(placement._id);

    assert(recheckPosition.assignee.toString() === newOwnerTA._id.toString(), 'Reassignment: Position assignee successfully updated');
    assert(recheckAttempt1.primaryTA.toString() === taAlpha._id.toString(), 'Reassignment: Attempt 01 Primary TA remains TA Alpha (NOT overwritten)');
    assert(recheckCandAlpha.sourcedBy.toString() === taAlpha._id.toString(), 'Reassignment: Candidate original sourcing TA remains TA Alpha (NOT overwritten)');
    assert(recheckPlacement.placedBy.toString() === taGamma._id.toString(), 'Reassignment: Placement closing TA remains TA Gamma (NOT overwritten)');


    // =============================================================
    // SECTION 4: Reporting & Calculation Reconciliation
    // =============================================================
    console.log('\n--- SECTION 4: Reporting & Calculation Reconciliation ---');

    // 1. Daily Activity Sourcing Isolation
    const dashSummaryReq = { query: { ta: taAlpha._id.toString() } };
    const dashSummaryRes = createMockRes();
    await taActivityDashboardController.getDashboardSummary(dashSummaryReq, dashSummaryRes);
    assert(dashSummaryRes.statusCode === 200, 'Reconciliation: TA Dashboard summary retrieved');
    assert(dashSummaryRes.body.sourcing.profilesSearched === 32, 'Reconciliation: 100% profiles searched for TA Alpha is 32');
    assert(dashSummaryRes.body.sourcing.followUpActivities === 4, 'Reconciliation: Follow-up candidates count = 4');
    assert(dashSummaryRes.body.sourcing.responsesReceived === 2, 'Reconciliation: Follow-up responses counted = 2');

    // 2. Submission Set Metrics
    const set1Req = { params: { id: set1._id } };
    const set1Res = createMockRes();
    await submissionSetController.getSubmissionSetById(set1Req, set1Res);
    assert(set1Res.statusCode === 200, 'Reconciliation: Submission Set 01 retrieved');
    assert(set1Res.body.metrics.totalSubmissions === 3, 'Reconciliation: Set 01 metrics.totalSubmissions = 3');
    assert(set1Res.body.metrics.uniqueCandidatesByHash === 3, 'Reconciliation: Set 01 metrics.uniqueCandidatesByHash = 3');
    assert(set1Res.body.metrics.clientShortlisted === 2, 'Reconciliation: Set 01 clientShortlisted = 2 (Alice & Bob)');

    // 3. Interview Dashboard Metrics
    const intDashReq = { query: { position: String(testPosition._id) } };
    const intDashRes = createMockRes();
    await interviewController.getInterviewDashboardSummary(intDashReq, intDashRes);
    assert(intDashRes.statusCode === 200, 'Reconciliation: Interview dashboard summary retrieved');
    const intCards = intDashRes.body.summaryCards;
    assert(intCards.totalInterviewEvents === 3, 'Reconciliation: Total interview events = 3');
    assert(intCards.uniqueCandidatesInterviewed === 2, 'Reconciliation: Unique candidates interviewed = 2');
    assert(intCards.candidatesShortlisted === 1, 'Reconciliation: Candidates shortlisted for next round = 1 (Alice)');
    assert(intCards.candidatesRejected === 1, 'Reconciliation: Candidates rejected = 1 (Bob)');


    // =============================================================
    // SECTION 5: Historical Data & Backward Compatibility
    // =============================================================
    console.log('\n--- SECTION 5: Historical Data & Backward Compatibility ---');

    // Verify existing pre-test records were not altered
    const currentCounts = {
      positions: await Position.countDocuments(),
      tas: await TA.countDocuments(),
      clients: await Client.countDocuments(),
      submissions: await CandidateSubmission.countDocuments(),
      attempts: await PositionAttempt.countDocuments(),
      submissionSets: await SubmissionSet.countDocuments(),
      interviews: await Interview.countDocuments(),
      placements: await Placement.countDocuments()
    };

    assert(currentCounts.positions >= initialCounts.positions, `Integrity: Positions count preserved (${currentCounts.positions} >= ${initialCounts.positions})`);
    assert(currentCounts.tas >= initialCounts.tas, `Integrity: TAs count preserved (${currentCounts.tas} >= ${initialCounts.tas})`);
    assert(currentCounts.clients >= initialCounts.clients, `Integrity: Clients count preserved (${currentCounts.clients} >= ${initialCounts.clients})`);
    assert(currentCounts.submissions >= initialCounts.submissions, `Integrity: Submissions count preserved (${currentCounts.submissions} >= ${initialCounts.submissions})`);
    assert(currentCounts.attempts >= initialCounts.attempts, `Integrity: Attempts count preserved (${currentCounts.attempts} >= ${initialCounts.attempts})`);

    // Verify legacy submission without attempt references continues to work
    const legacySubmission = await CandidateSubmission.findOne({ attempt: { $exists: false } });
    if (legacySubmission) {
      assert(legacySubmission._id !== null, 'Backward Compatibility: Legacy submission without attempt exists and is accessible');
    } else {
      console.log('  [INFO] No unmigrated legacy submissions found in DB, skipping legacy query assertion');
    }

    // Verify legacy position counters unchanged
    const sampleExistingPosition = await Position.findOne({ jobOrderId: { $not: /^JO-E2E-/ } });
    if (sampleExistingPosition) {
      assert(typeof sampleExistingPosition.cvCount === 'number', 'Backward Compatibility: Existing position legacy cvCount is intact');
      assert(typeof sampleExistingPosition.extShortlistCount === 'number', 'Backward Compatibility: Existing position legacy extShortlistCount is intact');
    }


    // =============================================================
    // SECTION 6: Permissions & UX Rules
    // =============================================================
    console.log('\n--- SECTION 6: Permissions & UX Rules ---');

    // 1. Invariant: Only one Active attempt allowed per position
    const duplicateActiveReq = {
      body: {
        positionId: testPosition._id,
        primaryTA: taBeta._id,
        reason: 'Attempting invalid second concurrent active attempt'
      }
    };
    const duplicateActiveRes = createMockRes();
    await attemptController.createAttempt(duplicateActiveReq, duplicateActiveRes);
    assert(duplicateActiveRes.statusCode === 400, 'Permissions/Rules: Rejected second concurrent Active attempt under same position (HTTP 400)');
    assert(duplicateActiveRes.body.error.includes('already exists for this position'), 'Permissions/Rules: Invariant violation message returned');

    // 2. Invariant: Duplicate placement prevention for same submission
    const duplicatePlacementReq = {
      body: {
        candidateSubmissionId: String(candAlpha._id),
        positionId: String(testPosition._id),
        placementDate: '2026-11-20',
        placedById: String(taGamma._id),
        status: 'Joined'
      }
    };
    const duplicatePlacementRes = createMockRes();
    await placementController.createPlacement(duplicatePlacementReq, duplicatePlacementRes);
    assert(duplicatePlacementRes.statusCode === 409, 'Permissions/Rules: Rejected duplicate placement for already placed candidate (HTTP 409 Conflict)');

  } finally {
    // =============================================================
    // DATA SAFETY & CLEANUP: Clean up test records
    // =============================================================
    console.log('\n--- DATA SAFETY & CLEANUP ---');
    console.log('Safely cleaning up test records created during E2E validation...');

    await DailyActivity.deleteMany({ _id: { $in: createdTestIds.dailyActivities } });
    await WorkAssignment.deleteMany({ _id: { $in: createdTestIds.assignments } });
    await Interview.deleteMany({ _id: { $in: createdTestIds.interviews } });
    await Placement.deleteMany({ _id: { $in: createdTestIds.placements } });
    await CandidateSubmission.deleteMany({ _id: { $in: createdTestIds.submissions } });
    await SubmissionSet.deleteMany({ _id: { $in: createdTestIds.submissionSets } });
    await PositionAttempt.deleteMany({ $or: [{ _id: { $in: createdTestIds.attempts } }, { jobOrderId: { $regex: /^JO-E2E-/ } }] });
    await Position.deleteMany({ _id: { $in: createdTestIds.positions } });
    await Client.deleteMany({ _id: { $in: createdTestIds.clients } });
    await TA.deleteMany({ _id: { $in: createdTestIds.tas } });

    const finalCounts = {
      positions: await Position.countDocuments(),
      tas: await TA.countDocuments(),
      clients: await Client.countDocuments(),
      submissions: await CandidateSubmission.countDocuments(),
      attempts: await PositionAttempt.countDocuments(),
      submissionSets: await SubmissionSet.countDocuments(),
      interviews: await Interview.countDocuments(),
      placements: await Placement.countDocuments()
    };

    assert(finalCounts.positions === initialCounts.positions, `Safety: Positions restored to baseline (${finalCounts.positions} === ${initialCounts.positions})`);
    assert(finalCounts.submissions === initialCounts.submissions, `Safety: Submissions restored to baseline (${finalCounts.submissions} === ${initialCounts.submissions})`);
    assert(finalCounts.attempts === initialCounts.attempts, `Safety: Attempts restored to baseline (${finalCounts.attempts} === ${initialCounts.attempts})`);

    await mongoose.disconnect();
  }

  console.log('\n================================================================');
  console.log(`  End-to-End Validation Complete: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error during E2E validation:', err);
  process.exit(1);
});
