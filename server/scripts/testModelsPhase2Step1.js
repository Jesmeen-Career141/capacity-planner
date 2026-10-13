/**
 * Focused test suite for Phase 2, Step 1:
 * Recruitment Attempt (PositionAttempt) and CV Data Models (CandidateSubmission)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Ensure related models are registered
require('../models/Client');
require('../models/TA');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const Client = require('../models/Client');

let testClientId = null;
const createdPositionIds = [];

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  let client = await Client.findOne();
  if (!client) {
    client = await Client.create({ clientId: 'TEST-CLI-P2', clientName: 'Test Client P2' });
  }
  testClientId = client._id;

  // Ensure indexes are built in MongoDB
  await PositionAttempt.init();
  await CandidateSubmission.init();
}

async function cleanup() {
  try {
    if (createdPositionIds.length > 0) {
      await CandidateSubmission.deleteMany({ position: { $in: createdPositionIds } });
      await PositionAttempt.deleteMany({ position: { $in: createdPositionIds } });
      await Position.deleteMany({ _id: { $in: createdPositionIds } });
    }
    // Also clean up by jobOrderId prefix just in case
    await Position.deleteMany({ jobOrderId: { $regex: /^TEST-P2S1-/ } });
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('  Running Phase 2 Step 1 Models Test Suite');
  console.log('===============================================================\n');

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

  try {
    await setup();

    // 1. Create a test position
    const pos = await Position.create({
      jobOrderId: 'TEST-P2S1-001',
      client: testClientId,
      position: 'Senior Systems Architect',
      pLevel: 'P4',
      status: 'A&P',
      cvCount: 7,
      extShortlistCount: 2
    });
    createdPositionIds.push(pos._id);

    // ==========================================
    // SECTION A: PositionAttempt Model Tests
    // ==========================================
    console.log('--- Testing PositionAttempt Model ---');

    // Test A1: Defaults on creation
    const attempt1 = await PositionAttempt.create({
      position: pos._id,
      attemptNumber: 1,
      legacySnapshot: {
        cvCount: pos.cvCount,
        extShortlistCount: pos.extShortlistCount,
        lsCount: null,
        targetCvCount: null
      }
    });

    assert(attempt1.attemptNumber === 1, 'Attempt number initialized to 1');
    assert(attempt1.status === 'Active', 'Default status is "Active"');
    assert(attempt1.outcome === 'In Progress', 'Default outcome is "In Progress"');
    assert(attempt1.startDate instanceof Date, 'startDate initialized to Date');
    assert(attempt1.endDate === null, 'endDate defaults to null');
    assert(attempt1.primaryTA === null, 'primaryTA defaults to null');
    assert(attempt1.reopenReason === '', 'reopenReason defaults to empty string');
    assert(attempt1.legacySnapshot.cvCount === 7, 'legacySnapshot safely captured cvCount');
    assert(attempt1.legacySnapshot.extShortlistCount === 2, 'legacySnapshot safely captured extShortlistCount');

    // Test A2: Duplicate attemptNumber rejection
    let dupNumberError = null;
    try {
      await PositionAttempt.create({
        position: pos._id,
        attemptNumber: 1,
        status: 'Completed'
      });
    } catch (err) {
      dupNumberError = err;
    }
    assert(
      dupNumberError && (dupNumberError.code === 11000 || dupNumberError.message.includes('duplicate key')),
      'Rejected duplicate attemptNumber on same position'
    );

    // Test A3: Duplicate Active attempt rejection (partialFilterExpression)
    let dupActiveError = null;
    try {
      await PositionAttempt.create({
        position: pos._id,
        attemptNumber: 2,
        status: 'Active' // attempt 1 is already Active!
      });
    } catch (err) {
      dupActiveError = err;
    }
    assert(
      dupActiveError && (dupActiveError.code === 11000 || dupActiveError.message.includes('duplicate key')),
      'Rejected second Active attempt on same position (partial unique index)'
    );

    // Test A4: Reopening position - closing attempt 1 and creating active attempt 2
    attempt1.status = 'Completed';
    attempt1.outcome = 'Placed';
    attempt1.endDate = new Date();
    await attempt1.save();

    const attempt2 = await PositionAttempt.create({
      position: pos._id,
      attemptNumber: 2,
      status: 'Active',
      reopenReason: 'Candidate backed out during probation'
    });
    assert(attempt2.attemptNumber === 2 && attempt2.status === 'Active', 'Created Attempt 2 as Active after closing Attempt 1');
    assert(attempt2.reopenReason === 'Candidate backed out during probation', 'reopenReason recorded on Attempt 2');

    // Confirm Attempt 1 remains intact in history
    const historicalAttempts = await PositionAttempt.find({ position: pos._id }).sort({ attemptNumber: 1 });
    assert(historicalAttempts.length === 2, 'Both historical attempts preserved in database');
    assert(historicalAttempts[0].status === 'Completed' && historicalAttempts[1].status === 'Active', 'Historical attempt 1 is Completed, Attempt 2 is Active');

    // ==========================================
    // SECTION B: CandidateSubmission Model Tests
    // ==========================================
    console.log('\n--- Testing CandidateSubmission Model ---');

    // Test B1: Creation with strict defaults
    const submission1 = await CandidateSubmission.create({
      position: pos._id,
      attempt: attempt2._id,
      originalFileName: 'Jane_Doe_Resume_2026.pdf',
      unverifiedLabel: 'Jane Doe',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSize: 145200,
      mimeType: 'application/pdf',
      r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid1_Jane_Doe_Resume_2026.pdf'
    });

    assert(submission1.internalShortlistStatus === 'Pending', 'Default internalShortlistStatus is "Pending"');
    assert(submission1.qualityRating === 'Not Rated', 'Default qualityRating is "Not Rated"');
    assert(submission1.sentToClient === false, 'Default sentToClient is false');
    assert(submission1.sentToClientDate === null, 'Default sentToClientDate is null');
    assert(submission1.clientShortlistStatus === 'Pending', 'Default clientShortlistStatus is "Pending"');
    assert(submission1.clientShortlistDate === null, 'Default clientShortlistDate is null');
    assert(submission1.nameIsVerified === false, 'Default nameIsVerified is false');
    assert(submission1.uploadedAt instanceof Date, 'uploadedAt is a Date instance');
    assert(submission1.unverifiedLabel === 'Jane Doe', 'unverifiedLabel stored as display helper');
    assert(submission1.originalFileName === 'Jane_Doe_Resume_2026.pdf', 'originalFileName preserved verbatim');

    // Test B2: Missing required fields validation
    let missingFieldError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id
        // missing attempt, originalFileName, fileHash, fileSize, mimeType, r2StorageKey
      });
    } catch (err) {
      missingFieldError = err;
    }
    assert(
      missingFieldError && missingFieldError.name === 'ValidationError',
      'Validation error thrown when required fields are missing'
    );

    // Test B3: Negative file size validation
    let negativeSizeError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id,
        attempt: attempt2._id,
        originalFileName: 'test.pdf',
        fileHash: 'dummyhash1',
        fileSize: -10,
        mimeType: 'application/pdf',
        r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid_neg.pdf'
      });
    } catch (err) {
      negativeSizeError = err;
    }
    assert(
      negativeSizeError && negativeSizeError.errors['fileSize'],
      'Validation error thrown for negative file size'
    );

    // Test B4: Duplicate file detection within the same attempt
    let dupFileInSameAttemptError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id,
        attempt: attempt2._id,
        originalFileName: 'Jane_Doe_Another_Copy.pdf', // Different filename, identical content hash
        fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SAME HASH
        fileSize: 145200,
        mimeType: 'application/pdf',
        r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid2_Jane_Doe_Another.pdf'
      });
    } catch (err) {
      dupFileInSameAttemptError = err;
    }
    assert(
      dupFileInSameAttemptError && (dupFileInSameAttemptError.code === 11000 || dupFileInSameAttemptError.message.includes('duplicate key')),
      'Rejected duplicate file upload within the same attempt based on fileHash compound index'
    );

    // Test B5: Cross-attempt repeat submission allowed
    // The exact same file CAN be submitted to historical Attempt 1 or another attempt
    const submissionInAttempt1 = await CandidateSubmission.create({
      position: pos._id,
      attempt: attempt1._id, // DIFFERENT ATTEMPT
      originalFileName: 'Jane_Doe_Resume_2026.pdf',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SAME HASH
      fileSize: 145200,
      mimeType: 'application/pdf',
      r2StorageKey: 'positions/TEST-P2S1-001/attempts/1/uuid_hist_Jane_Doe.pdf'
    });
    assert(
      submissionInAttempt1._id != null,
      'Legitimate repeat submission of the same CV across different attempts is permitted'
    );

    // Test B6: Unique r2StorageKey enforcement
    let dupR2KeyError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id,
        attempt: attempt2._id,
        originalFileName: 'Other.pdf',
        fileHash: 'different_hash_123',
        fileSize: 50000,
        mimeType: 'application/pdf',
        r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid1_Jane_Doe_Resume_2026.pdf' // DUPLICATE KEY
      });
    } catch (err) {
      dupR2KeyError = err;
    }
    assert(
      dupR2KeyError && (dupR2KeyError.code === 11000 || dupR2KeyError.message.includes('duplicate key')),
      'Enforced global uniqueness on r2StorageKey'
    );

    // ==========================================
    // SECTION C: Workflow Invariants Tests
    // ==========================================
    console.log('\n--- Testing Workflow Invariants ---');

    // Test C1: Cannot set qualityRating without internal shortlist
    let invalidQualityRatingError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id,
        attempt: attempt2._id,
        originalFileName: 'Bob.pdf',
        fileHash: 'bob_hash_001',
        fileSize: 50000,
        mimeType: 'application/pdf',
        r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid_bob.pdf',
        internalShortlistStatus: 'Pending',
        qualityRating: 'Good' // INVARIANT VIOLATION: Cannot be Good while Pending
      });
    } catch (err) {
      invalidQualityRatingError = err;
    }
    assert(
      invalidQualityRatingError && invalidQualityRatingError.errors['qualityRating'],
      'Rejected qualityRating ("Good") when internalShortlistStatus is "Pending"'
    );

    // Test C2: Setting qualityRating when internalShortlistStatus is "Shortlisted" succeeds
    const validShortlistedSubmission = await CandidateSubmission.create({
      position: pos._id,
      attempt: attempt2._id,
      originalFileName: 'Alice.pdf',
      fileHash: 'alice_hash_001',
      fileSize: 60000,
      mimeType: 'application/pdf',
      r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid_alice.pdf',
      internalShortlistStatus: 'Shortlisted',
      internalShortlistDate: new Date(),
      qualityRating: 'Good'
    });
    assert(
      validShortlistedSubmission.qualityRating === 'Good' && validShortlistedSubmission.internalShortlistStatus === 'Shortlisted',
      'Permitted qualityRating ("Good") when internalShortlistStatus is "Shortlisted"'
    );

    // Test C3: Cannot set clientShortlistStatus before sending to client
    let invalidClientShortlistError = null;
    try {
      await CandidateSubmission.create({
        position: pos._id,
        attempt: attempt2._id,
        originalFileName: 'Charlie.pdf',
        fileHash: 'charlie_hash_001',
        fileSize: 70000,
        mimeType: 'application/pdf',
        r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid_charlie.pdf',
        sentToClient: false,
        clientShortlistStatus: 'Shortlisted' // INVARIANT VIOLATION: Cannot be client shortlisted if not sent!
      });
    } catch (err) {
      invalidClientShortlistError = err;
    }
    assert(
      invalidClientShortlistError && invalidClientShortlistError.errors['clientShortlistStatus'],
      'Rejected clientShortlistStatus ("Shortlisted") when sentToClient is false'
    );

    // Test C4: Client shortlist status permitted when sentToClient is true
    const validClientSubmission = await CandidateSubmission.create({
      position: pos._id,
      attempt: attempt2._id,
      originalFileName: 'David.pdf',
      fileHash: 'david_hash_001',
      fileSize: 80000,
      mimeType: 'application/pdf',
      r2StorageKey: 'positions/TEST-P2S1-001/attempts/2/uuid_david.pdf',
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Optional',
      sentToClient: true,
      sentToClientDate: new Date(),
      clientShortlistStatus: 'Shortlisted',
      clientShortlistDate: new Date()
    });
    assert(
      validClientSubmission.sentToClient === true && validClientSubmission.clientShortlistStatus === 'Shortlisted',
      'Permitted clientShortlistStatus when sentToClient is true'
    );

    // ==========================================
    // SECTION D: Legacy Metric Non-Interference
    // ==========================================
    console.log('\n--- Testing Legacy Metric Non-Interference ---');

    const freshPos = await Position.findById(pos._id).lean();
    assert(freshPos.cvCount === 7, 'Position cvCount was untouched and remains 7');
    assert(freshPos.extShortlistCount === 2, 'Position extShortlistCount was untouched and remains 2');
    assert(freshPos.lsCount === null || freshPos.lsCount === undefined, 'Position lsCount was untouched');
    assert(freshPos.targetCvCount === null || freshPos.targetCvCount === undefined, 'Position targetCvCount was untouched');
    assert(freshPos.status === 'A&P', 'Position status was untouched');

  } catch (err) {
    console.error('Unexpected error in test suite:', err);
    failed++;
  } finally {
    await cleanup();
  }

  console.log('\n===============================================================');
  console.log(`  Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
