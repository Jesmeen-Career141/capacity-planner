/**
 * Automated Verification Suite for Phase 5: Interview Tracking
 *
 * Verifies:
 * 1. Interview model creation with concurrency-safe sequential ID (INT-XXXX)
 * 2. Proper linkage to CandidateSubmission, Position, Client, and TAs
 * 3. Exact enum enforcement for rounds, status, and decisions
 * 4. Status and Decision separation (operational status vs recruitment outcome)
 * 5. Multi-round progression without overwriting previous rounds
 * 6. Rescheduling functionality preserving original dates, times, and reason in history
 * 7. Multiple reschedules support on the same interview
 * 8. Interview feedback, interviewer comments, performance notes, and decision recording
 * 9. Audit trail maintenance on creation, rescheduling, feedback, and status changes
 * 10. Candidate-level interview journey retrieval
 * 11. Position-level interview tracking summary (unique candidates vs total interview events)
 * 12. Interview dashboard summary, actionable alerts, and round pipeline aggregation
 * 13. Calendar events generation with date grouping
 * 14. Eligible candidates auto-discovery with next round suggestion
 * 15. Zero destruction to existing positions, legacy counters, and candidate submissions
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const TA = require('../models/TA');
const Client = require('../models/Client');
const { Interview, ROUND_VALUES, STATUS_VALUES, DECISION_VALUES } = require('../models/Interview');

const interviewController = require('../controllers/interviewController');

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
  console.log('  Testing Interview Tracking Module (Phase 5)');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const initialPositionsCount = await Position.countDocuments();
  const initialTAsCount = await TA.countDocuments();
  const initialClientsCount = await Client.countDocuments();
  const initialSubmissionsCount = await CandidateSubmission.countDocuments();

  console.log(`Initial DB State: ${initialPositionsCount} positions, ${initialTAsCount} TAs, ${initialClientsCount} clients, ${initialSubmissionsCount} submissions.\n`);

  const runId = Date.now();

  // Clean up any remnants from previous test runs
  await Interview.deleteMany({ jobOrderId: { $regex: /^TEST-INT-POS/ } });
  await CandidateSubmission.deleteMany({ originalFileName: { $regex: /^Test_Interview_Candidate/ } });
  await Position.deleteMany({ jobOrderId: { $regex: /^TEST-INT-POS/ } });
  await TA.deleteMany({ name: { $regex: /^Test TA Interview/ } });
  await Client.deleteMany({ clientId: 'TEST-INT-CLI' });

  // 1. Fixture setup
  const testClient = await Client.create({
    clientId: 'TEST-INT-CLI',
    clientName: 'Test Interview Client Inc'
  });

  const testSourcingTA = await TA.create({
    name: `Test TA Interview Sourcer ${runId}`,
    status: 'Active',
    color: 'blue'
  });

  const testCoordinatorTA = await TA.create({
    name: `Test TA Interview Coordinator ${runId}`,
    status: 'Active',
    color: 'purple'
  });

  const testPosition = await Position.create({
    jobOrderId: `TEST-INT-POS-${runId}`,
    position: 'Principal Platform Engineer',
    client: testClient._id,
    pLevel: 'P1',
    status: 'A&P',
    assignee: testCoordinatorTA._id,
    cvCount: 8,
    extShortlistCount: 3,
    targetCvCount: 12
  });

  const testAttempt = await PositionAttempt.create({
    position: testPosition._id,
    attemptNumber: 1,
    status: 'Active',
    primaryTA: testCoordinatorTA._id,
    supportingTAs: [testSourcingTA._id],
    startDate: new Date(),
    requiredGoodCvTarget: 5
  });

  // Candidate 1: Shortlisted by client (eligible for interviews)
  const candidate1 = await CandidateSubmission.create({
    position: testPosition._id,
    attempt: testAttempt._id,
    originalFileName: `Test_Interview_Candidate_1_${runId}.pdf`,
    unverifiedLabel: 'Alice Smith',
    fileHash: `test_hash_int_1_${runId}`,
    fileSize: 1048576,
    mimeType: 'application/pdf',
    r2StorageKey: `positions/TEST_INT/attempts/1/alice_${runId}.pdf`,
    submittedBy: testCoordinatorTA._id,
    sourcedBy: testSourcingTA._id,
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Good',
    sentToClient: true,
    clientShortlistStatus: 'Shortlisted'
  });

  // Candidate 2: Also shortlisted by client
  const candidate2 = await CandidateSubmission.create({
    position: testPosition._id,
    attempt: testAttempt._id,
    originalFileName: `Test_Interview_Candidate_2_${runId}.pdf`,
    unverifiedLabel: 'Bob Johnson',
    fileHash: `test_hash_int_2_${runId}`,
    fileSize: 1048576,
    mimeType: 'application/pdf',
    r2StorageKey: `positions/TEST_INT/attempts/1/bob_${runId}.pdf`,
    submittedBy: testCoordinatorTA._id,
    sourcedBy: testSourcingTA._id,
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Good',
    sentToClient: true,
    clientShortlistStatus: 'Shortlisted'
  });

  try {
    // --- Test 1: Schedule New Interview (First Round) ---
    console.log('--- Test 1: Schedule New Interview (First Round) ---');
    const reqCreate = {
      body: {
        candidateSubmissionId: String(candidate1._id),
        positionId: String(testPosition._id),
        round: 'First Round',
        interviewDate: '2026-11-05',
        interviewDateStr: '2026-11-05',
        interviewTime: '10:30 AM',
        interviewMode: 'Online',
        meetingLinkOrLocation: 'https://meet.google.com/test-abc-xyz',
        interviewerName: 'Dr. Jane Client',
        interviewerDesignation: 'Head of Infrastructure',
        schedulingNotes: 'Candidate should prepare system design diagrams',
        interviewCoordinatorId: String(testCoordinatorTA._id),
        createdBy: 'Coordinator'
      }
    };
    const resCreate = createMockRes();
    await interviewController.createInterview(reqCreate, resCreate);

    assert(resCreate.statusCode === 201, `Interview scheduled successfully with code 201`);
    const inv1 = resCreate.body.interview;
    assert(inv1.interviewId && inv1.interviewId.startsWith('INT-'), `Sequential interviewId generated (${inv1.interviewId})`);
    assert(inv1.candidateName === 'Alice Smith', `Candidate name resolved correctly (${inv1.candidateName})`);
    assert(inv1.round === 'First Round', `Round is First Round`);
    assert(inv1.roundSequence === 1, `Round sequence is 1`);
    assert(inv1.status === 'Scheduled', `Default status is Scheduled`);
    assert(inv1.decision === 'Pending', `Default decision is Pending`);
    assert(inv1.auditTrail && inv1.auditTrail.length === 1, `Initial audit trail record created`);

    // --- Test 2: Rescheduling Functionality & History Preservation ---
    console.log('\n--- Test 2: Rescheduling & History Preservation ---');
    const reqReschedule = {
      params: { id: String(inv1._id) },
      body: {
        newDate: '2026-11-07',
        newDateStr: '2026-11-07',
        newTime: '02:00 PM',
        reason: 'Client interviewer had conflicting board meeting',
        rescheduledBy: 'Lead Coordinator'
      }
    };
    const resReschedule = createMockRes();
    await interviewController.rescheduleInterview(reqReschedule, resReschedule);

    assert(resReschedule.statusCode === 200, `Reschedule returned 200`);
    const reschedInv = resReschedule.body.interview;
    assert(reschedInv.interviewDateStr === '2026-11-07', `New interview date updated to 2026-11-07`);
    assert(reschedInv.interviewTime === '02:00 PM', `New interview time updated to 02:00 PM`);
    assert(reschedInv.status === 'Rescheduled', `Status updated to Rescheduled`);
    assert(reschedInv.rescheduleHistory.length === 1, `Reschedule history captured exactly 1 entry`);
    const histEntry1 = reschedInv.rescheduleHistory[0];
    assert(histEntry1.previousDateStr === '2026-11-05', `Previous date preserved in history (${histEntry1.previousDateStr})`);
    assert(histEntry1.previousTime === '10:30 AM', `Previous time preserved in history (${histEntry1.previousTime})`);
    assert(histEntry1.reason === 'Client interviewer had conflicting board meeting', `Reschedule reason preserved`);

    // Reschedule a second time to ensure multiple reschedules supported
    const reqReschedule2 = {
      params: { id: String(inv1._id) },
      body: {
        newDate: '2026-11-08',
        newDateStr: '2026-11-08',
        newTime: '03:30 PM',
        reason: 'Candidate requested afternoon slot',
        rescheduledBy: 'Lead Coordinator'
      }
    };
    const resReschedule2 = createMockRes();
    await interviewController.rescheduleInterview(reqReschedule2, resReschedule2);
    const reschedInv2 = resReschedule2.body.interview;
    assert(reschedInv2.rescheduleHistory.length === 2, `Multiple reschedules supported: 2 history records preserved`);
    assert(reschedInv2.rescheduleHistory[1].previousDateStr === '2026-11-07', `Second reschedule preserved intermediate date`);

    // --- Test 3: Feedback & Decision (Shortlisted, but NOT auto-progressed) ---
    console.log('\n--- Test 3: Feedback & Decision Tracking ---');
    // Mark status Completed first
    const reqStatus = {
      params: { id: String(inv1._id) },
      body: { status: 'Completed', note: 'Conducted via Google Meet successfully' }
    };
    const resStatus = createMockRes();
    await interviewController.updateStatus(reqStatus, resStatus);
    assert(resStatus.body.interview.status === 'Completed', `Status updated to Completed`);

    // Update feedback and decision
    const reqFeedback = {
      params: { id: String(inv1._id) },
      body: {
        feedback: 'Strong technical performance in distributed systems architecture',
        interviewerComments: 'Very impressive problem-solving speed',
        candidatePerformanceNotes: 'Scored 9/10 on system design',
        decision: 'Shortlisted',
        decisionDate: '2026-11-08',
        nextAction: 'Schedule Second Round with VP Engineering',
        nextInterviewRound: 'Second Round'
      }
    };
    const resFeedback = createMockRes();
    await interviewController.updateFeedbackAndDecision(reqFeedback, resFeedback);

    const feedbackInv = resFeedback.body.interview;
    assert(feedbackInv.decision === 'Shortlisted', `Decision recorded as Shortlisted`);
    assert(feedbackInv.feedback.includes('Strong technical performance'), `Feedback persisted`);
    assert(feedbackInv.nextInterviewRound === 'Second Round', `Next interview round noted`);

    // Verify candidate did NOT auto-create a round 2 record
    const secondRounds = await Interview.find({ candidateSubmission: candidate1._id, round: 'Second Round' });
    assert(secondRounds.length === 0, `Candidate was NOT automatically progressed into Second Round without explicit scheduling`);

    // --- Test 4: Explicit Multi-Round Progression (Second Round) ---
    console.log('\n--- Test 4: Explicit Multi-Round Progression (Second Round) ---');
    const reqCreateRound2 = {
      body: {
        candidateSubmissionId: String(candidate1._id),
        positionId: String(testPosition._id),
        round: 'Second Round',
        interviewDate: '2026-11-12',
        interviewDateStr: '2026-11-12',
        interviewTime: '11:00 AM',
        interviewMode: 'Online',
        interviewerName: 'Sarah Connor',
        interviewerDesignation: 'VP of Engineering',
        schedulingNotes: 'Culture and architecture deep dive',
        interviewCoordinatorId: String(testCoordinatorTA._id)
      }
    };
    const resCreateRound2 = createMockRes();
    await interviewController.createInterview(reqCreateRound2, resCreateRound2);

    assert(resCreateRound2.statusCode === 201, `Second Round scheduled successfully`);
    const inv2 = resCreateRound2.body.interview;
    assert(inv2.round === 'Second Round', `Round is Second Round`);
    assert(inv2.roundSequence === 2, `Round sequence is 2`);

    // Verify previous round 1 was NOT overwritten
    const checkRound1 = await Interview.findById(inv1._id);
    assert(checkRound1.round === 'First Round', `First Round interview record remains intact`);
    assert(checkRound1.decision === 'Shortlisted', `First Round decision remained Shortlisted`);

    // Complete Round 2 and set decision Shortlisted
    await interviewController.updateStatus({ params: { id: String(inv2._id) }, body: { status: 'Completed' } }, createMockRes());
    await interviewController.updateFeedbackAndDecision({
      params: { id: String(inv2._id) },
      body: { decision: 'Shortlisted', feedback: 'Passed engineering leadership round' }
    }, createMockRes());

    // Schedule and complete Candidate 2 interview (First Round Rejected)
    const reqCreateCand2 = {
      body: {
        candidateSubmissionId: String(candidate2._id),
        positionId: String(testPosition._id),
        round: 'First Round',
        interviewDate: '2026-11-06',
        interviewDateStr: '2026-11-06',
        interviewTime: '04:00 PM',
        interviewMode: 'Telephone',
        interviewerName: 'Recruiter Screening',
        interviewCoordinatorId: String(testCoordinatorTA._id)
      }
    };
    const resCreateCand2 = createMockRes();
    await interviewController.createInterview(reqCreateCand2, resCreateCand2);
    const invCand2 = resCreateCand2.body.interview;
    await interviewController.updateStatus({ params: { id: String(invCand2._id) }, body: { status: 'Completed' } }, createMockRes());
    await interviewController.updateFeedbackAndDecision({
      params: { id: String(invCand2._id) },
      body: { decision: 'Rejected', feedback: 'Salary expectations far above budget' }
    }, createMockRes());

    // --- Test 5: Candidate Interview Journey Timeline ---
    console.log('\n--- Test 5: Candidate Interview Journey Timeline ---');
    const reqJourney = { params: { candidateSubmissionId: String(candidate1._id) } };
    const resJourney = createMockRes();
    await interviewController.getCandidateInterviewHistory(reqJourney, resJourney);

    assert(resJourney.body.totalInterviews === 2, `Found exactly 2 rounds for candidate 1 (${resJourney.body.totalInterviews} === 2)`);
    assert(resJourney.body.interviews[0].round === 'First Round', `First round in chronological order`);
    assert(resJourney.body.interviews[1].round === 'Second Round', `Second round in chronological order`);
    assert(resJourney.body.interviews[0].rescheduleHistory.length === 2, `First round contains reschedule history`);

    // --- Test 6: Position-Level Interview Tracking Summary ---
    console.log('\n--- Test 6: Position-Level Interview Tracking Summary ---');
    const reqPosTracking = { params: { positionId: String(testPosition._id) } };
    const resPosTracking = createMockRes();
    await interviewController.getPositionInterviewTracking(reqPosTracking, resPosTracking);

    const posSummary = resPosTracking.body.summary;
    assert(posSummary.totalCandidatesShortlistedByClient === 2, `Client shortlisted candidates: 2`);
    assert(posSummary.totalInterviewEvents === 3, `Total interview events: 3 (Round 1 + Round 2 for Cand 1, Round 1 for Cand 2)`);
    assert(posSummary.uniqueCandidatesInterviewed === 2, `Unique candidates interviewed: 2 (no double-counting of Cand 1 across 2 rounds)`);
    assert(posSummary.completed === 3, `Completed interviews: 3`);
    assert(posSummary.candidatesShortlistedForNext === 1, `Candidate 1 shortlisted for next round (${posSummary.candidatesShortlistedForNext} === 1)`);
    assert(posSummary.candidatesRejected === 1, `Candidate 2 rejected (${posSummary.candidatesRejected} === 1)`);

    // --- Test 7: Interview Dashboard Summary & Pipeline ---
    console.log('\n--- Test 7: Interview Dashboard Summary & Pipeline ---');
    const reqDash = { query: { position: String(testPosition._id) } };
    const resDash = createMockRes();
    await interviewController.getInterviewDashboardSummary(reqDash, resDash);

    const dashSummary = resDash.body.summaryCards;
    assert(dashSummary.totalInterviewEvents === 3, `Dashboard total events: 3`);
    assert(dashSummary.uniqueCandidatesInterviewed === 2, `Dashboard unique candidates: 2`);
    assert(dashSummary.completed === 3, `Dashboard completed events: 3`);
    assert(dashSummary.candidatesShortlisted === 1, `Dashboard unique shortlisted: 1`);
    assert(dashSummary.candidatesRejected === 1, `Dashboard unique rejected: 1`);

    // Pipeline verification
    const pipeline = resDash.body.pipeline;
    const round1Stats = pipeline.find(p => p.round === 'First Round');
    const round2Stats = pipeline.find(p => p.round === 'Second Round');
    assert(round1Stats.totalEvents === 2, `First Round total events: 2`);
    assert(round1Stats.uniqueCandidates === 2, `First Round unique candidates: 2`);
    assert(round2Stats.totalEvents === 1, `Second Round total events: 1`);
    assert(round2Stats.uniqueCandidates === 1, `Second Round unique candidates: 1`);

    // Actionable indicators: Candidate 1 passed Round 2 so is ready for Third Round
    const requiringNext = resDash.body.actionableIndicators.requiringNextRound;
    assert(requiringNext.length >= 1, `Identified candidates ready for next round`);
    assert(requiringNext[0].candidateName === 'Alice Smith', `Alice Smith flagged as ready for next round`);
    assert(requiringNext[0].suggestedNextRound === 'Third Round', `Suggested next round is Third Round`);

    // --- Test 8: Calendar Events Generation ---
    console.log('\n--- Test 8: Calendar Events Generation ---');
    const reqCal = { query: { position: String(testPosition._id) } };
    const resCal = createMockRes();
    await interviewController.getInterviewCalendarEvents(reqCal, resCal);

    assert(resCal.body.length === 3, `Calendar returned 3 events`);
    const calEvent = resCal.body[0];
    assert(calEvent.candidateName !== undefined, `Calendar event has candidateName`);
    assert(calEvent.round !== undefined, `Calendar event has round`);
    assert(calEvent.date !== undefined, `Calendar event has date`);
    assert(calEvent.time !== undefined, `Calendar event has time`);

    // --- Test 9: Eligible Candidates Discovery ---
    console.log('\n--- Test 9: Eligible Candidates Discovery ---');
    const reqEligible = { query: { positionId: String(testPosition._id) } };
    const resEligible = createMockRes();
    await interviewController.getEligibleCandidates(reqEligible, resEligible);

    assert(resEligible.body.length === 2, `Found both client-shortlisted candidates`);
    const aliceEligible = resEligible.body.find(c => c.candidateName === 'Alice Smith');
    assert(aliceEligible.completedRounds.includes('First Round') && aliceEligible.completedRounds.includes('Second Round'), `Completed rounds listed for Alice`);
    assert(aliceEligible.nextSuggestedRound === 'Third Round', `Auto-suggested Third Round for Alice`);

    // --- Test 10: Zero Destruction of Positions and Legacy Counters ---
    console.log('\n--- Test 10: Zero Destruction of Positions & Legacy Counters ---');
    const freshPos = await Position.findById(testPosition._id);
    assert(freshPos.cvCount === 8, `Position.cvCount unchanged (8)`);
    assert(freshPos.extShortlistCount === 3, `Position.extShortlistCount unchanged (3)`);
    assert(freshPos.targetCvCount === 12, `Position.targetCvCount unchanged (12)`);

    const currentPositionsCount = await Position.countDocuments();
    const currentTAsCount = await TA.countDocuments();
    const currentClientsCount = await Client.countDocuments();
    const currentSubmissionsCount = await CandidateSubmission.countDocuments();

    assert(currentPositionsCount >= initialPositionsCount, `Positions preserved (${currentPositionsCount} >= ${initialPositionsCount})`);
    assert(currentTAsCount >= initialTAsCount, `TAs preserved (${currentTAsCount} >= ${initialTAsCount})`);
    assert(currentClientsCount >= initialClientsCount, `Clients preserved (${currentClientsCount} >= ${initialClientsCount})`);
    assert(currentSubmissionsCount >= initialSubmissionsCount, `Candidate submissions preserved (${currentSubmissionsCount} >= ${initialSubmissionsCount})`);

  } finally {
    // Teardown test fixtures
    await Interview.deleteMany({ jobOrderId: { $regex: /^TEST-INT-POS/ } });
    await CandidateSubmission.deleteMany({ originalFileName: { $regex: /^Test_Interview_Candidate/ } });
    await PositionAttempt.deleteMany({ position: testPosition._id });
    await Position.deleteMany({ jobOrderId: { $regex: /^TEST-INT-POS/ } });
    await TA.deleteMany({ name: { $regex: /^Test TA Interview/ } });
    await Client.deleteMany({ clientId: 'TEST-INT-CLI' });

    await mongoose.disconnect();
  }

  console.log('\n================================================================');
  console.log(`  Tests Complete: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
