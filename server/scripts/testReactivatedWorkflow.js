/**
 * testReactivatedWorkflow.js
 * Comprehensive Verification and Regression Test Suite for Phase 2:
 * Reactivated Position Status and Workflow
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

require('../models/Client');
require('../models/TA');
const Position = require('../models/Position');
const Client = require('../models/Client');
const PositionHistory = require('../models/PositionHistory');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const { createPosition, updatePosition } = require('../controllers/positionController');

const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];

// Helper to create mock Express response
function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('  Running Phase 2: Reactivated Workflow Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`✓ Passed: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`✗ Failed: ${desc}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function testAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ Passed: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`✗ Failed: ${desc}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // --- 1. Frontend Invariants & Text Integrity ---
  test('Positions.jsx preserves legacy STATUS_OPTIONS literal array and provides ALL_STATUS_OPTIONS', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Positions.jsx'), 'utf8');
    assert(
      code.includes("const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];"),
      'Must preserve exact 9-item STATUS_OPTIONS for testStatusNavigation compatibility'
    );
    assert(
      code.includes("const ALL_STATUS_OPTIONS = [...STATUS_OPTIONS, 'Reactivated'];"),
      'Must provide ALL_STATUS_OPTIONS including Reactivated'
    );
    assert(code.includes("'Reactivated': { bg: '#ccfbf1', text: '#0f766e' }"), 'Must define Reactivated color');
  });

  test('Archive.jsx includes prominent Reactivated action option and removes reactivated positions from view', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Archive.jsx'), 'utf8');
    assert(code.includes("ALL_STATUS_OPTIONS"), 'Archive.jsx must reference ALL_STATUS_OPTIONS');
    assert(code.includes("arch-status-option--reactivate"), 'Archive.jsx must style Reactivated option');
    assert(code.includes("↻ Reactivated"), 'Archive.jsx must display Reactivated label');
    assert(code.includes("if (!ARCHIVE_STATUSES.includes(newStatus))"), 'Must remove reactivated position from archive view');
  });

  test('NewPosition.jsx supports marking as Reactivated and detects possible matches without blocking', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/NewPosition.jsx'), 'utf8');
    assert(code.includes("isReactivated: false"), 'Form data must include isReactivated default');
    assert(code.includes("Mark as Reactivated Requirement"), 'Must include checkbox label');
    assert(code.includes("possibleMatches"), 'Must calculate possible matches for duplicate warning');
    assert(code.includes("possible-matches-callout"), 'Must render possible matches callout banner');
  });

  test('PositionDetails.jsx and PositionDetailModal.jsx support Reactivated status and tags', () => {
    const detailsCode = fs.readFileSync(path.join(__dirname, '../../client/src/pages/PositionDetails.jsx'), 'utf8');
    assert(detailsCode.includes("const ALL_STATUS_OPTIONS = [...STATUS_OPTIONS, 'Reactivated'];"), 'PositionDetails must have ALL_STATUS_OPTIONS');
    assert(detailsCode.includes("reactivated-tag"), 'PositionDetails must render reactivated badge');

    const modalCode = fs.readFileSync(path.join(__dirname, '../../client/src/components/PositionDetailModal.jsx'), 'utf8');
    assert(modalCode.includes("reactivated-tag"), 'PositionDetailModal must render reactivated badge');
  });

  // --- Database Operations ---
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/capacity-planner';
  await mongoose.connect(mongoUri);

  let testClient = null;
  const createdPositionIds = [];

  try {
    // Setup temporary client
    testClient = await Client.create({
      clientId: `CLI_REACT_${Date.now()}`,
      clientName: `Test_Client_Reactivation_${Date.now()}`,
      isActive: true,
    });

    // --- 2. Scenario A: Existing Archived Position Reactivation ---
    await testAsync('Scenario A: Archived position (Hold) transitions to Reactivated with audit history and persistent flag', async () => {
      const position = await Position.create({
        jobOrderId: 'TEST-REACT-001',
        position: 'Senior Software Engineer',
        client: testClient._id,
        pLevel: 'P2',
        status: 'Hold',
        remarks: 'Original archived remarks',
      });
      createdPositionIds.push(position._id);

      assert.strictEqual(position.isReactivated, false);
      assert.strictEqual(position.reactivatedAt, null);
      assert(ARCHIVE_STATUSES.includes(position.status), 'Initial status must be archived');

      // Update position to Reactivated via updatePosition controller
      const req = {
        params: { id: position._id.toString() },
        body: { status: 'Reactivated' },
      };
      const res = createMockRes();

      await updatePosition(req, res);
      assert.strictEqual(res.statusCode, 200);

      const updated = await Position.findById(position._id);
      assert.strictEqual(updated.status, 'Reactivated');
      assert.strictEqual(updated.isReactivated, true, 'isReactivated must be set to true');
      assert(updated.reactivatedAt instanceof Date, 'reactivatedAt must be populated');
      assert.strictEqual(updated.remarks, 'Original archived remarks', 'Original remarks must be preserved');
      assert.strictEqual(updated.jobOrderId, position.jobOrderId, 'Original JO ID must be preserved');
      assert(!ARCHIVE_STATUSES.includes(updated.status), 'Reactivated status must NOT be in ARCHIVE_STATUSES');

      // Verify audit history was recorded
      const history = await PositionHistory.find({ position: position._id, field: 'status' });
      assert(history.length >= 1, 'Status change must be recorded in PositionHistory');
      const lastHistory = history[history.length - 1];
      assert.strictEqual(lastHistory.oldValue, 'Hold');
      assert.strictEqual(lastHistory.newValue, 'Reactivated');
    });

    await testAsync('Scenario A: Transition from Placed to Reactivated clears placedAt and preserves history', async () => {
      const originalPlacedDate = new Date('2026-08-15T00:00:00.000Z');
      const position = await Position.create({
        jobOrderId: 'TEST-REACT-002',
        position: 'Data Analyst',
        client: testClient._id,
        pLevel: 'P3',
        status: 'Placed',
        placedAt: originalPlacedDate,
      });
      createdPositionIds.push(position._id);

      const req = {
        params: { id: position._id.toString() },
        body: { status: 'Reactivated' },
      };
      const res = createMockRes();

      await updatePosition(req, res);
      assert.strictEqual(res.statusCode, 200);

      const updated = await Position.findById(position._id);
      assert.strictEqual(updated.status, 'Reactivated');
      assert.strictEqual(updated.isReactivated, true);
      assert.strictEqual(updated.placedAt, null, 'placedAt must be cleared when reactivating from Placed');

      // Check history records placedAt transition
      const placedHistory = await PositionHistory.find({ position: position._id, field: 'placedAt' });
      assert(placedHistory.length >= 1, 'placedAt clearing must be recorded in history');
      const lastPlacedHistory = placedHistory[placedHistory.length - 1];
      assert(
        lastPlacedHistory.newValue === '' || lastPlacedHistory.newValue === null,
        'placedAt clearing should record null/empty in history'
      );
    });

    await testAsync('Scenario A: Candidate submissions, attempts, and allocations are preserved upon reactivation', async () => {
      const position = await Position.create({
        jobOrderId: 'TEST-REACT-003',
        position: 'Product Designer',
        client: testClient._id,
        pLevel: 'P1',
        status: 'Lost',
        allocationRounds: [
          { ta: null, reason: 'Initial round', dateAssigned: new Date() },
        ],
      });
      createdPositionIds.push(position._id);

      // Create an attempt and a candidate submission for this position
      const attempt = await PositionAttempt.create({
        position: position._id,
        attemptNumber: 1,
        status: 'Completed',
        requiredGoodCvTarget: 2,
      });

      const testRunId = Date.now();
      const candidate = await CandidateSubmission.create({
        position: position._id,
        attempt: attempt._id,
        unverifiedLabel: 'Jane Designer',
        originalFileName: 'Jane_Designer_CV.pdf',
        fileHash: `hash_jane_designer_${testRunId}`,
        fileSize: 125000,
        mimeType: 'application/pdf',
        r2StorageKey: `positions/${position.jobOrderId}/attempts/1/jane_designer_${testRunId}.pdf`,
        internalShortlistStatus: 'Shortlisted',
        qualityRating: 'Good',
        sentToClient: true,
        sentToClientDate: new Date(),
        clientShortlistStatus: 'Shortlisted',
        clientShortlistDate: new Date(),
      });

      // Reactivate position
      const req = {
        params: { id: position._id.toString() },
        body: { status: 'Reactivated' },
      };
      const res = createMockRes();
      await updatePosition(req, res);
      assert.strictEqual(res.statusCode, 200);

      // Verify position preserved allocation rounds
      const updated = await Position.findById(position._id);
      assert.strictEqual(updated.allocationRounds.length, 1);
      assert.strictEqual(updated.allocationRounds[0].reason, 'Initial round');

      // Verify attempts and candidate submissions remain intact and unmutated
      const attemptsCount = await PositionAttempt.countDocuments({ position: position._id });
      assert.strictEqual(attemptsCount, 1, 'Attempt count must not change');

      const savedCandidate = await CandidateSubmission.findById(candidate._id);
      assert.strictEqual(savedCandidate.originalFileName, 'Jane_Designer_CV.pdf');
      assert.strictEqual(savedCandidate.unverifiedLabel, 'Jane Designer');
      assert.strictEqual(savedCandidate.qualityRating, 'Good');
      assert.strictEqual(savedCandidate.clientShortlistStatus, 'Shortlisted');

      // Clean up attempt and candidate
      await CandidateSubmission.findByIdAndDelete(candidate._id);
      await PositionAttempt.findByIdAndDelete(attempt._id);
    });

    await testAsync('Scenario A: Moving from Reactivated to another active status (A&P) preserves isReactivated flag', async () => {
      const position = await Position.create({
        jobOrderId: 'TEST-REACT-004',
        position: 'Backend Developer',
        client: testClient._id,
        pLevel: 'P2',
        status: 'Hold',
      });
      createdPositionIds.push(position._id);

      // Step 1: Reactivate
      await updatePosition(
        { params: { id: position._id.toString() }, body: { status: 'Reactivated' } },
        createMockRes()
      );

      let pos = await Position.findById(position._id);
      assert.strictEqual(pos.status, 'Reactivated');
      assert.strictEqual(pos.isReactivated, true);
      const reactivatedTime = pos.reactivatedAt;

      // Step 2: Transition from Reactivated to A&P
      await updatePosition(
        { params: { id: position._id.toString() }, body: { status: 'A&P' } },
        createMockRes()
      );

      pos = await Position.findById(position._id);
      assert.strictEqual(pos.status, 'A&P');
      assert.strictEqual(pos.isReactivated, true, 'isReactivated must remain true');
      assert.strictEqual(pos.reactivatedAt.getTime(), reactivatedTime.getTime(), 'reactivatedAt must be preserved');
    });

    // --- 3. Scenario B: New Position Marked as Reactivated ---
    await testAsync('Scenario B: Creating a brand-new position with status Reactivated sets isReactivated: true', async () => {
      const req = {
        body: {
          jobOrderId: 'TEST-REACT-005',
          position: 'DevOps Engineer',
          client: testClient._id.toString(),
          pLevel: 'P3',
          status: 'Reactivated',
        },
      };
      const res = createMockRes();

      await createPosition(req, res);
      assert.strictEqual(res.statusCode, 201);
      assert(res.data._id);
      createdPositionIds.push(res.data._id);

      const created = await Position.findById(res.data._id);
      assert.strictEqual(created.status, 'Reactivated');
      assert.strictEqual(created.isReactivated, true);
      assert(created.reactivatedAt instanceof Date);
    });

    await testAsync('Scenario B: Creating a new position with isReactivated flag and status A&P preserves flag', async () => {
      const req = {
        body: {
          jobOrderId: 'TEST-REACT-006',
          position: 'Cloud Architect',
          client: testClient._id.toString(),
          pLevel: 'P1',
          status: 'A&P',
          isReactivated: true,
        },
      };
      const res = createMockRes();

      await createPosition(req, res);
      assert.strictEqual(res.statusCode, 201);
      createdPositionIds.push(res.data._id);

      const created = await Position.findById(res.data._id);
      assert.strictEqual(created.status, 'A&P');
      assert.strictEqual(created.isReactivated, true);
      assert(created.reactivatedAt instanceof Date);
    });

  } finally {
    // Clean up created test positions, client, attempts and submissions
    if (createdPositionIds.length > 0) {
      await CandidateSubmission.deleteMany({ position: { $in: createdPositionIds } });
      await PositionAttempt.deleteMany({ position: { $in: createdPositionIds } });
      await PositionHistory.deleteMany({ position: { $in: createdPositionIds } });
      await Position.deleteMany({ _id: { $in: createdPositionIds } });
    }
    // Clean up any dangling test submission from earlier runs
    await CandidateSubmission.deleteMany({ r2StorageKey: { $regex: /TEST-REACT/ } });
    if (testClient) {
      await Client.findByIdAndDelete(testClient._id);
    }
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`  All Phase 2 Tests Completed: ${passed}/${total} Passed!`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
