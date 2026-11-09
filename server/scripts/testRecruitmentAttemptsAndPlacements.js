/**
 * Automated Verification Suite for Phase 6: Recruitment Attempts, Placement Logic & TA Assignment Integration
 *
 * Verifies:
 * 1. Safe sequential attempt numbering and unique Attempt ID (ATT-XXXX) under same Position
 * 2. Multiple recruitment attempts under one Position without creating duplicate Position records
 * 3. Candidate submissions traceability to attempt, sourcing TA, and uploading TA
 * 4. Submission sets traceability to attempt
 * 5. Interviews traceability to attempt and candidate
 * 6. Placement creation, traceability to attempt, candidate, and TA attribution
 * 7. Candidate placement does NOT automatically close Position or overwrite previous attempts
 * 8. TA assignment distinction across position, attempt, work board, sourcing, and interviews
 * 9. Position-level cumulative reporting vs attempt-level metrics (deduplicating multi-attempt candidates)
 * 10. Zero destruction of positions, attempts, legacy counters, and historical records
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const { Interview } = require('../models/Interview');
const { Placement } = require('../models/Placement');
const TA = require('../models/TA');
const Client = require('../models/Client');

const attemptController = require('../controllers/attemptController');
const placementController = require('../controllers/placementController');

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
  console.log('  Testing Recruitment Attempts, Placement Logic & TA Integration');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const initialPositionsCount = await Position.countDocuments();
  const initialTAsCount = await TA.countDocuments();
  const initialClientsCount = await Client.countDocuments();
  const initialSubmissionsCount = await CandidateSubmission.countDocuments();

  console.log(`Initial DB State: ${initialPositionsCount} positions, ${initialTAsCount} TAs, ${initialClientsCount} clients, ${initialSubmissionsCount} submissions.\n`);

  const runId = Date.now();

  // Clean up any remnants from previous test runs
  await Placement.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
  await Interview.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
  await SubmissionSet.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
  await CandidateSubmission.deleteMany({ originalFileName: { $regex: /^Test_Attempt_Candidate/ } });
  await PositionAttempt.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
  await Position.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
  await TA.deleteMany({ name: { $regex: /^Test TA Attempt/ } });
  await Client.deleteMany({ clientId: 'TEST-ATT-CLI' });

  // 1. Fixture setup
  const testClient = await Client.create({
    clientId: 'TEST-ATT-CLI',
    clientName: 'Global Enterprise Corp'
  });

  const testPositionAssignee = await TA.create({
    name: `Test TA Attempt Owner ${runId}`,
    status: 'Active',
    color: 'blue'
  });

  const testPrimaryTA_Attempt2 = await TA.create({
    name: `Test TA Attempt Lead ${runId}`,
    status: 'Active',
    color: 'turquoise'
  });

  const testSourcingTA = await TA.create({
    name: `Test TA Attempt Sourcer ${runId}`,
    status: 'Active',
    color: 'purple'
  });

  const testPosition = await Position.create({
    jobOrderId: `TEST-ATT-POS-${runId}`,
    position: 'Director of Cloud Engineering',
    client: testClient._id,
    pLevel: 'P1',
    status: 'A&P',
    assignee: testPositionAssignee._id,
    cvCount: 14,
    extShortlistCount: 5,
    targetCvCount: 20
  });

  try {
    // --- Test 1: Concurrency-Safe Sequential Attempt Numbering ---
    console.log('--- Test 1: Concurrency-Safe Sequential Attempt Numbering ---');
    const alloc1 = await PositionAttempt.allocateNextAttempt(testPosition._id);
    assert(alloc1.attemptNumber === 1, `First attempt allocated sequence number 1`);
    assert(alloc1.attemptNumberFormatted === 'Attempt 01', `Formatted string is Attempt 01`);
    assert(alloc1.attemptId && alloc1.attemptId.startsWith('ATT-'), `Sequential attemptId has ATT- prefix (${alloc1.attemptId})`);

    // Create Attempt 01
    const reqCreateAtt1 = {
      body: {
        positionId: String(testPosition._id),
        primaryTA: String(testPositionAssignee._id),
        supportingTAs: [String(testSourcingTA._id)],
        requiredGoodCvTarget: 5,
        reason: 'Initial recruitment cycle for Director position'
      }
    };
    const resCreateAtt1 = createMockRes();
    await attemptController.createAttempt(reqCreateAtt1, resCreateAtt1);

    assert(resCreateAtt1.statusCode === 201, `Attempt 01 created successfully with code 201`);
    const att1 = resCreateAtt1.body.attempt;
    assert(att1.attemptNumber === 1, `Attempt number is 1`);
    assert(att1.attemptNumberFormatted === 'Attempt 01', `Attempt 01 formatted label set`);
    assert(att1.status === 'Active', `Status defaults to Active`);
    assert(att1.primaryTA && att1.primaryTA.name === testPositionAssignee.name, `Primary TA is Position Owner`);

    // --- Test 2: Invariant Check (Duplicate Active Attempt Rejected) ---
    console.log('\n--- Test 2: Invariant Check (Duplicate Active Attempt Rejected) ---');
    const reqCreateAttDup = {
      body: {
        positionId: String(testPosition._id),
        primaryTA: String(testPositionAssignee._id),
        reason: 'Attempting to create another active attempt without concluding Attempt 01'
      }
    };
    const resCreateAttDup = createMockRes();
    await attemptController.createAttempt(reqCreateAttDup, resCreateAttDup);
    assert(resCreateAttDup.statusCode === 400, `Rejected concurrent active attempt (code 400)`);

    // --- Test 3: Candidate & Submission Set Traceability to Attempt 01 ---
    console.log('\n--- Test 3: Candidate & Submission Set Traceability to Attempt 01 ---');
    const set1 = await SubmissionSet.create({
      submissionSetId: `SET-ATT1-${runId}`,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      attempt: att1._id,
      setNumber: 'Set 01',
      setSequence: 1,
      sentToClientAt: new Date('2026-11-01'),
      uploadedAt: new Date(),
      uploadedBy: testPositionAssignee._id,
      cvCount: 2
    });

    const cand1 = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: att1._id,
      submissionSet: set1._id,
      submissionSetId: set1.submissionSetId,
      setNumber: set1.setNumber,
      originalFileName: `Test_Attempt_Candidate_1_${runId}.pdf`,
      unverifiedLabel: 'Carol Danvers',
      fileHash: `test_hash_att_cand1_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/TEST_ATT/cand1_${runId}.pdf`,
      submittedBy: testPositionAssignee._id,
      sourcedBy: testSourcingTA._id,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      sentToClient: true,
      clientShortlistStatus: 'Shortlisted'
    });

    assert(String(cand1.attempt) === String(att1._id), `Candidate 1 traceable to Attempt 01`);
    assert(String(set1.attempt) === String(att1._id), `Set 01 traceable to Attempt 01`);
    assert(String(cand1.sourcedBy) === String(testSourcingTA._id), `Original sourcing TA attribution preserved`);
    assert(String(cand1.submittedBy) === String(testPositionAssignee._id), `Uploading TA attribution preserved`);

    // --- Test 4: Interview Linked to Candidate and Attempt 01 ---
    console.log('\n--- Test 4: Interview Linked to Candidate and Attempt 01 ---');
    const inv1 = await Interview.create({
      interviewId: `INT-ATT1-${runId}`,
      candidateSubmission: cand1._id,
      candidateName: cand1.unverifiedLabel,
      position: testPosition._id,
      jobOrderId: testPosition.jobOrderId,
      client: testClient._id,
      clientName: testClient.clientName,
      attempt: att1._id,
      attemptId: att1.attemptId,
      attemptNumber: att1.attemptNumber,
      round: 'First Round',
      roundSequence: 1,
      interviewDate: new Date('2026-11-03'),
      interviewDateStr: '2026-11-03',
      interviewTime: '10:00 AM',
      status: 'Completed',
      decision: 'Shortlisted',
      sourcingTA: testSourcingTA._id,
      interviewCoordinator: testPositionAssignee._id
    });

    assert(String(inv1.attempt) === String(att1._id), `Interview 1 traceable to Attempt 01`);
    assert(inv1.attemptNumber === 1, `Interview records attemptNumber 1`);

    // --- Test 5: Placement Creation Under Attempt 01 ---
    console.log('\n--- Test 5: Placement Creation Under Attempt 01 ---');
    const reqPlacement = {
      body: {
        candidateSubmissionId: String(cand1._id),
        positionId: String(testPosition._id),
        attemptId: String(att1._id),
        placementDate: '2026-11-04',
        placementDateStr: '2026-11-04',
        status: 'Joined',
        salary: 2200000,
        packageDetails: '22 LPA Fixed + Bonus',
        billingAmount: 180000,
        notes: 'Joining date confirmed for 1st Dec',
        closeAttempt: true,    // Closes Attempt 01
        closePosition: false   // Leaves Position open for subsequent demands!
      }
    };
    const resPlacement = createMockRes();
    await placementController.createPlacement(reqPlacement, resPlacement);

    assert(resPlacement.statusCode === 201, `Placement recorded successfully with code 201`);
    const plc1 = resPlacement.body.placement;
    assert(plc1.placementId && plc1.placementId.startsWith('PLC-'), `Sequential placementId generated (${plc1.placementId})`);
    assert(plc1.candidateName === 'Carol Danvers', `Candidate name matches (${plc1.candidateName})`);
    assert(String(plc1.attempt._id || plc1.attempt) === String(att1._id), `Placement traceable to Attempt 01`);

    // Verify Candidate updated with placement reference
    const freshCand1 = await CandidateSubmission.findById(cand1._id);
    assert(freshCand1.isPlaced === true, `CandidateSubmission.isPlaced set to true`);
    assert(String(freshCand1.placement) === String(plc1._id), `CandidateSubmission.placement points to Placement record`);

    // Verify Attempt 01 concluded
    const freshAtt1 = await PositionAttempt.findById(att1._id);
    assert(freshAtt1.status === 'Completed', `Attempt 01 status transitioned to Completed`);
    assert(freshAtt1.outcome === 'Placed', `Attempt 01 outcome marked Placed`);
    assert(freshAtt1.placementCount === 1, `Attempt 01 placementCount incremented to 1`);

    // Verify Position was NOT automatically closed
    const freshPosAfterPlc = await Position.findById(testPosition._id);
    assert(freshPosAfterPlc.status === 'A&P', `Position status preserved as A&P (not closed automatically)`);
    assert(freshPosAfterPlc.placedAt !== null, `Position.placedAt recorded (${freshPosAfterPlc.placedAt})`);

    // --- Test 6: Create Attempt 02 Under the Exact Same Position ---
    console.log('\n--- Test 6: Create Attempt 02 Under Same Position ---');
    const reqCreateAtt2 = {
      body: {
        positionId: String(testPosition._id),
        primaryTA: String(testPrimaryTA_Attempt2._id),
        supportingTAs: [],
        requiredGoodCvTarget: 3,
        reason: 'Client requested second Director opening for new division'
      }
    };
    const resCreateAtt2 = createMockRes();
    await attemptController.createAttempt(reqCreateAtt2, resCreateAtt2);

    assert(resCreateAtt2.statusCode === 201, `Attempt 02 created successfully`);
    const att2 = resCreateAtt2.body.attempt;
    assert(att2.attemptNumber === 2, `Attempt 02 allocated sequence number 2`);
    assert(att2.attemptNumberFormatted === 'Attempt 02', `Formatted label is Attempt 02`);
    assert(att2.status === 'Active', `Attempt 02 is now the active recruitment cycle`);
    assert(att2.primaryTA.name === testPrimaryTA_Attempt2.name, `Attempt 02 assigned to new primary TA without affecting Position ownership`);

    // Verify Position ID is retained and no new Position record was created
    const positionsWithJobOrderId = await Position.find({ jobOrderId: testPosition.jobOrderId });
    assert(positionsWithJobOrderId.length === 1, `Exactly 1 Position record retained for ${testPosition.jobOrderId}`);

    // Verify Attempt 01 records remain completely intact
    const verifyAtt1 = await PositionAttempt.findById(att1._id);
    assert(verifyAtt1.status === 'Completed', `Attempt 01 remains Completed`);
    assert(verifyAtt1.placementCount === 1, `Attempt 01 placement remains intact`);

    // Submit new candidate in Attempt 02
    const cand2 = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: att2._id,
      originalFileName: `Test_Attempt_Candidate_2_${runId}.pdf`,
      unverifiedLabel: 'David Banner',
      fileHash: `test_hash_att_cand2_${runId}`,
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/TEST_ATT/cand2_${runId}.pdf`,
      submittedBy: testPrimaryTA_Attempt2._id,
      sourcedBy: testPrimaryTA_Attempt2._id,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      sentToClient: true,
      clientShortlistStatus: 'Shortlisted'
    });

    assert(String(cand2.attempt) === String(att2._id), `Candidate 2 traceable to Attempt 02`);

    // --- Test 7: Position-Level Cumulative vs Attempt-Level Metrics ---
    console.log('\n--- Test 7: Position-Level Cumulative vs Attempt-Level Metrics ---');
    const reqPosSummary = { params: { positionId: String(testPosition._id) } };
    const resPosSummary = createMockRes();
    await attemptController.getPositionAttemptsSummary(reqPosSummary, resPosSummary);

    const posSummary = resPosSummary.body;
    assert(posSummary.cumulative.totalAttempts === 2, `Cumulative total attempts: 2`);
    assert(posSummary.cumulative.totalCandidateSubmissions === 2, `Cumulative submissions: 2`);
    assert(posSummary.cumulative.uniqueCandidates === 2, `Cumulative unique candidates: 2`);
    assert(posSummary.cumulative.totalSubmissionSets === 1, `Cumulative sets: 1`);
    assert(posSummary.cumulative.totalPlacements === 1, `Cumulative placements: 1`);

    // Check individual attempt metrics inside the array
    assert(posSummary.attempts.length === 2, `Attempts array contains 2 attempts`);
    const att2Summary = posSummary.attempts.find(a => a.attemptNumber === 2);
    const att1Summary = posSummary.attempts.find(a => a.attemptNumber === 1);
    assert(att1Summary.placementCount === 1, `Attempt 01 has 1 placement`);
    assert(att2Summary.placementCount === 0, `Attempt 02 has 0 placements`);
    assert(att1Summary.candidateSubmissionsCount === 1, `Attempt 01 has 1 submission`);
    assert(att2Summary.candidateSubmissionsCount === 1, `Attempt 02 has 1 submission`);

    // --- Test 8: Deduplication Invariant Across Attempts ---
    console.log('\n--- Test 8: Multi-Attempt Candidate Deduplication ---');
    // If Candidate 1 is also re-submitted or considered under Attempt 2
    const cand1ReSubmission = await CandidateSubmission.create({
      position: testPosition._id,
      attempt: att2._id,
      originalFileName: `Test_Attempt_Candidate_1_Resub_${runId}.pdf`,
      unverifiedLabel: 'Carol Danvers', // Exact same candidate
      fileHash: cand1.fileHash,          // Exact same fileHash / identity
      fileSize: 1048576,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/TEST_ATT/cand1_resub_${runId}.pdf`,
      submittedBy: testPrimaryTA_Attempt2._id,
      sourcedBy: testPrimaryTA_Attempt2._id,
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good'
    });

    const resPosSummaryAfterResub = createMockRes();
    await attemptController.getPositionAttemptsSummary(reqPosSummary, resPosSummaryAfterResub);
    const updatedCumulative = resPosSummaryAfterResub.body.cumulative;
    assert(updatedCumulative.totalCandidateSubmissions === 3, `Total submissions count increased to 3`);
    assert(updatedCumulative.uniqueCandidates === 2, `Position-level unique candidates remained 2 (deduplicated!)`);

    // --- Test 9: TA Assignment Separation Verification ---
    console.log('\n--- Test 9: TA Assignment Separation Verification ---');
    // Position assignee remains testPositionAssignee
    const currentPosition = await Position.findById(testPosition._id).populate('assignee');
    assert(currentPosition.assignee.name === testPositionAssignee.name, `Position Assignee is Test TA Attempt Owner`);
    // Attempt 1 primaryTA is testPositionAssignee
    assert(att1Summary.primaryTA.name === testPositionAssignee.name, `Attempt 01 Primary TA is Test TA Attempt Owner`);
    // Attempt 2 primaryTA is testPrimaryTA_Attempt2
    assert(att2Summary.primaryTA.name === testPrimaryTA_Attempt2.name, `Attempt 02 Primary TA is Test TA Attempt Lead`);
    // Sourcing TA on Candidate 1 is testSourcingTA
    assert(String(cand1.sourcedBy) === String(testSourcingTA._id), `Sourcing TA is Test TA Attempt Sourcer`);

    // --- Test 10: Zero Destruction of Positions and Legacy Counters ---
    console.log('\n--- Test 10: Zero Destruction of Positions & Legacy Counters ---');
    const freshPos = await Position.findById(testPosition._id);
    assert(freshPos.cvCount === 14, `Position.cvCount unchanged (14)`);
    assert(freshPos.extShortlistCount === 5, `Position.extShortlistCount unchanged (5)`);
    assert(freshPos.targetCvCount === 20, `Position.targetCvCount unchanged (20)`);

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
    await Placement.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
    await Interview.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
    await SubmissionSet.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
    await CandidateSubmission.deleteMany({ originalFileName: { $regex: /^Test_Attempt_Candidate/ } });
    await PositionAttempt.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
    await Position.deleteMany({ jobOrderId: { $regex: /^TEST-ATT-POS/ } });
    await TA.deleteMany({ name: { $regex: /^Test TA Attempt/ } });
    await Client.deleteMany({ clientId: 'TEST-ATT-CLI' });

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
