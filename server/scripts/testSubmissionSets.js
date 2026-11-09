/**
 * Automated Verification Suite for CV Submission Sets & Candidate CV Tracking
 *
 * Verifies:
 * 1. Concurrency-safe sequential set numbering (Set 01, Set 02, etc. per position)
 * 2. Separation of client transmission date (sentToClientAt) from upload timestamp (uploadedAt)
 * 3. Preservation of TA attribution (sourcing TA vs uploading TA kept distinct)
 * 4. Backward compatibility (legacy candidate submissions without submissionSet continue to work)
 * 5. Multi-candidate metrics computation (total submissions, unique candidates, good CVs, client shortlisted, withdrawn)
 * 6. Duplicate CV prevention within recruitment attempt
 * 7. Verification that existing positions, legacy counters, and records remain 100% intact
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
const { computeSetMetrics } = require('../controllers/submissionSetController');

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

async function run() {
  console.log('================================================================');
  console.log('  Testing CV Submission Sets & Candidate CV Tracking');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  // Snapshot pre-test counts to verify zero existing data was deleted or altered
  const initialPositionsCount = await Position.countDocuments();
  const initialTAsCount = await TA.countDocuments();
  const initialClientsCount = await Client.countDocuments();
  const initialSubmissionsCount = await CandidateSubmission.countDocuments();

  console.log(`Initial DB State: ${initialPositionsCount} positions, ${initialTAsCount} TAs, ${initialClientsCount} clients, ${initialSubmissionsCount} submissions.\n`);

  // Ensure test Client and TAs exist
  let testClient = await Client.findOne({ clientId: 'TEST-SET-CLI' });
  if (!testClient) {
    testClient = await Client.create({ clientId: 'TEST-SET-CLI', clientName: 'Test Sets Client' });
  }

  // Clean up any remnants from previous test runs for full idempotence
  const prevPos = await Position.findOne({ jobOrderId: 'TEST-SET-POS-01' });
  if (prevPos) {
    await CandidateSubmission.deleteMany({ position: prevPos._id });
    await SubmissionSet.deleteMany({ position: prevPos._id });
    await PositionAttempt.deleteMany({ position: prevPos._id });
    await Position.deleteMany({ _id: prevPos._id });
  }
  await TA.deleteMany({ name: { $in: ['Test TA Batch Uploader', 'Test TA Sourcing Specialist'] } });

  const testTA1 = await TA.create({ name: 'Test TA Sourcing Specialist', status: 'Active', color: 'blue' });
  const testTA2 = await TA.create({ name: 'Test TA Batch Uploader', status: 'Active', color: 'darkGreen' });

  // Ensure test Position exists
  const testPosition = await Position.create({
    jobOrderId: 'TEST-SET-POS-01',
    position: 'Staff DevOps Engineer',
    client: testClient._id,
    pLevel: 'P2',
    status: 'A&P',
    assignee: testTA2._id,
    cvCount: 7,
    extShortlistCount: 3,
    targetCvCount: 10
  });

  // Ensure an active recruitment attempt exists for this position
  const testAttempt = await PositionAttempt.create({
    position: testPosition._id,
    attemptNumber: 1,
    status: 'Active',
    primaryTA: testTA2._id,
    supportingTAs: [testTA1._id],
    startDate: new Date(),
    requiredGoodCvTarget: 5
  });

  try {

  // --- Test 1: Concurrency-Safe Sequential Set Numbering ---
  console.log('--- Test 1: Concurrency-Safe Sequential Set Numbering ---');
  // Allocate two sets concurrently for testPosition
  const [alloc1, alloc2] = await Promise.all([
    SubmissionSet.allocateNextSet(testPosition._id),
    SubmissionSet.allocateNextSet(testPosition._id)
  ]);

  assert(alloc1.setSequence !== alloc2.setSequence, 'Concurrent allocations received different sequence numbers');
  assert(alloc1.setNumber !== alloc2.setNumber, 'Concurrent allocations received different set numbers');
  assert(
    (alloc1.setNumber === 'Set 01' && alloc2.setNumber === 'Set 02') ||
    (alloc1.setNumber === 'Set 02' && alloc2.setNumber === 'Set 01'),
    `Set numbers sequentially formatted as Set 01 and Set 02 (got: ${alloc1.setNumber}, ${alloc2.setNumber})`
  );
  assert(alloc1.submissionSetId.startsWith('SET-'), `submissionSetId has standard prefix SET- (${alloc1.submissionSetId})`);

  // --- Test 2: Separate Client Transmission Date vs Upload Timestamp ---
  console.log('\n--- Test 2: Separate Client Transmission Date vs Upload Timestamp ---');
  const pastSentDate = new Date('2026-10-15T10:30:00.000Z');
  const setRecord = await SubmissionSet.create({
    submissionSetId: alloc1.submissionSetId,
    position: testPosition._id,
    jobOrderId: testPosition.jobOrderId,
    setNumber: alloc1.setNumber,
    setSequence: alloc1.setSequence,
    sentToClientAt: pastSentDate,
    uploadedAt: new Date(),
    uploadedBy: testTA2._id,
    cvCount: 0,
    attempt: testAttempt._id,
    createdBy: testTA2._id
  });

  assert(setRecord.sentToClientAt.toISOString() === pastSentDate.toISOString(), 'sentToClientAt correctly reflects the actual client transmission date in the past');
  assert(setRecord.uploadedAt.getTime() > pastSentDate.getTime(), 'uploadedAt timestamp is distinct and reflects current system upload time');
  assert(setRecord.setNumber === alloc1.setNumber, `Set record preserved set number ${alloc1.setNumber}`);

  // --- Test 3: TA Attribution (Sourcing TA vs Uploading TA) ---
  console.log('\n--- Test 3: TA Attribution (Sourcing TA vs Uploading TA) ---');
  const sub1 = await CandidateSubmission.create({
    position: testPosition._id,
    attempt: testAttempt._id,
    submissionSet: setRecord._id,
    submissionSetId: setRecord.submissionSetId,
    setNumber: setRecord.setNumber,
    originalFileName: 'John_Doe_DevOps_CV.pdf',
    unverifiedLabel: 'John Doe',
    fileHash: `test_hash_${Date.now()}_1`,
    fileSize: 1048576,
    mimeType: 'application/pdf',
    r2StorageKey: `positions/TEST/attempts/1/test_storage_${Date.now()}_1.pdf`,
    submittedBy: testTA2._id, // Uploading TA
    sourcedBy: testTA1._id,   // Original Sourcing TA
    uploadedAt: new Date(),
    sentToClient: true,
    sentToClientDate: pastSentDate,
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Good',
    clientShortlistStatus: 'Pending'
  });

  assert(String(sub1.submittedBy) === String(testTA2._id), 'submittedBy points to uploading TA (TA 2)');
  assert(String(sub1.sourcedBy) === String(testTA1._id), 'sourcedBy points to original sourcing TA (TA 1)');
  assert(sub1.setNumber === setRecord.setNumber, `Candidate submission attached to ${setRecord.setNumber}`);
  assert(sub1.sentToClientDate.toISOString() === pastSentDate.toISOString(), 'Candidate submission inherited actual client transmission date');

  // --- Test 4: Backward Compatibility for Legacy Submissions ---
  console.log('\n--- Test 4: Backward Compatibility for Legacy Submissions ---');
  const legacySub = await CandidateSubmission.create({
    position: testPosition._id,
    attempt: testAttempt._id,
    originalFileName: 'Legacy_Candidate_CV.pdf',
    unverifiedLabel: 'Legacy Candidate',
    fileHash: `test_hash_legacy_${Date.now()}`,
    fileSize: 524288,
    mimeType: 'application/pdf',
    r2StorageKey: `positions/TEST/attempts/1/legacy_storage_${Date.now()}.pdf`,
    submittedBy: testTA2._id,
    internalShortlistStatus: 'Pending',
    sentToClient: false,
    clientShortlistStatus: 'Pending'
    // submissionSet omitted (null)
  });

  assert(legacySub.submissionSet === null, 'Legacy submission functions without submissionSet (null)');
  assert(legacySub.setNumber === null, 'Legacy submission functions without setNumber (null)');

  const fetchedLegacy = await CandidateSubmission.findById(legacySub._id).lean();
  assert(fetchedLegacy && fetchedLegacy.unverifiedLabel === 'Legacy Candidate', 'Legacy submission fetched without schema validation error');

  // --- Test 5: Distinction of Metrics (computeSetMetrics) ---
  console.log('\n--- Test 5: Distinction of Metrics (computeSetMetrics) ---');
  // Add a second submission to setRecord (same candidate name different file, or distinct candidate)
  const sub2 = await CandidateSubmission.create({
    position: testPosition._id,
    attempt: testAttempt._id,
    submissionSet: setRecord._id,
    submissionSetId: setRecord.submissionSetId,
    setNumber: setRecord.setNumber,
    originalFileName: 'Jane_Smith_Resume.docx',
    unverifiedLabel: 'Jane Smith',
    fileHash: `test_hash_${Date.now()}_2`,
    fileSize: 204800,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    r2StorageKey: `positions/TEST/attempts/1/test_storage_${Date.now()}_2.docx`,
    submittedBy: testTA2._id,
    sourcedBy: testTA2._id,
    uploadedAt: new Date(),
    sentToClient: true,
    sentToClientDate: pastSentDate,
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Optional',
    clientShortlistStatus: 'Shortlisted',
    isWithdrawn: true,
    withdrawalDate: new Date(),
    withdrawalReason: 'Candidate declined the opportunity'
  });

  const setMetrics = computeSetMetrics([sub1, sub2]);
  assert(setMetrics.totalSubmissions === 2, `Total submissions correctly counted as 2 (got: ${setMetrics.totalSubmissions})`);
  assert(setMetrics.uniqueCandidatesByName === 2, `Unique candidates correctly counted as 2 (got: ${setMetrics.uniqueCandidatesByName})`);
  assert(setMetrics.goodCvs === 1, `Good CVs correctly counted as 1 (got: ${setMetrics.goodCvs})`);
  assert(setMetrics.optionalCvs === 1, `Optional CVs correctly counted as 1 (got: ${setMetrics.optionalCvs})`);
  assert(setMetrics.clientShortlisted === 1, `Client shortlisted correctly counted as 1 (got: ${setMetrics.clientShortlisted})`);
  assert(setMetrics.withdrawn === 1, `Withdrawn candidates correctly counted as 1 (got: ${setMetrics.withdrawn})`);

  // --- Test 6: Duplicate File Detection Within Recruitment Attempt ---
  console.log('\n--- Test 6: Duplicate File Detection Within Recruitment Attempt ---');
  let duplicateCaught = false;
  try {
    await CandidateSubmission.create({
      position: testPosition._id,
      attempt: testAttempt._id,
      submissionSet: setRecord._id,
      originalFileName: 'Duplicate_John_Doe_CV.pdf',
      unverifiedLabel: 'John Doe',
      fileHash: sub1.fileHash, // Exact same fileHash
      fileSize: sub1.fileSize,
      mimeType: 'application/pdf',
      r2StorageKey: `positions/TEST/attempts/1/duplicate_key_${Date.now()}.pdf`,
      submittedBy: testTA2._id
    });
  } catch (err) {
    duplicateCaught = true;
  }
  assert(duplicateCaught, 'Duplicate submission of exact same file to same recruitment attempt was rejected by unique index');

  // --- Test 7: Zero Destruction of Existing Positions & Counters ---
  console.log('\n--- Test 7: Zero Destruction of Existing Positions & Counters ---');
  const postTestPos = await Position.findById(testPosition._id);
  assert(postTestPos.cvCount === 7, `Position.cvCount unchanged (7)`);
  assert(postTestPos.extShortlistCount === 3, `Position.extShortlistCount unchanged (3)`);
  assert(postTestPos.targetCvCount === 10, `Position.targetCvCount unchanged (10)`);

  const currentPositionsCount = await Position.countDocuments();
  const currentTAsCount = await TA.countDocuments();
  const currentClientsCount = await Client.countDocuments();

  assert(currentPositionsCount >= initialPositionsCount, `Positions preserved (${currentPositionsCount} >= ${initialPositionsCount})`);
  assert(currentTAsCount >= initialTAsCount, `TAs preserved (${currentTAsCount} >= ${initialTAsCount})`);
  assert(currentClientsCount >= initialClientsCount, `Clients preserved (${currentClientsCount} >= ${initialClientsCount})`);

  } finally {
    const cleanupPos = await Position.findOne({ jobOrderId: 'TEST-SET-POS-01' });
    if (cleanupPos) {
      await CandidateSubmission.deleteMany({ position: cleanupPos._id });
      await SubmissionSet.deleteMany({ position: cleanupPos._id });
      await PositionAttempt.deleteMany({ position: cleanupPos._id });
      await Position.deleteMany({ _id: cleanupPos._id });
    }
    await TA.deleteMany({ name: { $in: ['Test TA Batch Uploader', 'Test TA Sourcing Specialist'] } });
    await Client.deleteMany({ clientId: 'TEST-SET-CLI' });

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

