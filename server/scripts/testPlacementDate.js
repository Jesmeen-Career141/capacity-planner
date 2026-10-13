/**
 * Focused test suite for Phase 1, Task 3: Placement-Date Handling
 *
 * Verifies:
 * 1. Transition non-Placed -> Placed sets placedAt to current timestamp.
 * 2. Transition non-Placed -> Placed with explicit valid date uses that date.
 * 3. Editing unrelated fields on already Placed position preserves existing placedAt (no auto-refresh).
 * 4. Resubmitting status: 'Placed' on already Placed position preserves existing placedAt.
 * 5. Transition Placed -> non-Placed (A&P, Hold, Lost) clears placedAt to null while preserving history.
 * 6. Direct create with status: 'Placed' without explicit date leaves placedAt null.
 * 7. Direct create with status: 'Placed' with explicit date sets placedAt to that date.
 * 8. Direct create with non-Placed status leaves placedAt null.
 * 9. Invalid date string returns 400 Bad Request on both create and update.
 * 10. Existing 15 Placed positions in DB remain un-backfilled (strict rule compliance).
 * 11. Simulated verification of the four UI pathways.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
require('../models/Client');
require('../models/TA');
const Position = require('../models/Position');
const PositionHistory = require('../models/PositionHistory');
const Client = require('../models/Client');
const positionController = require('../controllers/positionController');

// Mock Express req and res
function mockReqRes(body = {}, params = {}) {
  const req = { body, params };
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return { req, res };
}

let testClientId = null;
const createdPositionIds = [];

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  let client = await Client.findOne();
  if (!client) {
    client = await Client.create({ clientId: 'TEST-CLI', clientName: 'Test Client' });
  }
  testClientId = client._id;
}

async function cleanup() {
  try {
    await Position.deleteMany({ jobOrderId: { $regex: /^TEST-/ } });
    if (createdPositionIds.length > 0) {
      await PositionHistory.deleteMany({ position: { $in: createdPositionIds } });
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

async function runTests() {
  console.log('--- Starting Placement Date Test Suite ---');
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

    // Verify existing placed records are un-backfilled
    const existingPlaced = await Position.find({ status: 'Placed' }).lean();
    console.log(`\nInitial check: Found ${existingPlaced.length} existing Placed positions in database.`);
    const existingWithPlacedAt = existingPlaced.filter(p => p.placedAt !== null && p.placedAt !== undefined);
    assert(
      existingWithPlacedAt.length === 0,
      `Rule 6: Existing placed positions must remain un-backfilled (0 of ${existingPlaced.length} have placedAt)`
    );

    // Test 1: Transition A&P -> Placed without explicit placedAt sets placedAt to now
    console.log('\nTest 1: Transition A&P -> Placed sets placedAt to current timestamp');
    const pos1 = await Position.create({
      jobOrderId: 'TEST-PL-001',
      client: testClientId,
      position: 'Senior Engineer',
      pLevel: 'P3',
      status: 'A&P'
    });
    createdPositionIds.push(pos1._id);

    const beforeTime = new Date(Date.now() - 1000);
    const { req: req1, res: res1 } = mockReqRes({ status: 'Placed' }, { id: pos1._id.toString() });
    await positionController.updatePosition(req1, res1);
    const afterTime = new Date(Date.now() + 1000);

    assert(res1.statusCode === 200, 'updatePosition returned 200');
    assert(res1.data.status === 'Placed', 'Status updated to Placed');
    assert(res1.data.placedAt instanceof Date, 'placedAt is a Date instance');
    const placedTime = new Date(res1.data.placedAt).getTime();
    assert(
      placedTime >= beforeTime.getTime() && placedTime <= afterTime.getTime(),
      'placedAt is accurately set to the current timestamp'
    );

    const history1 = await PositionHistory.find({ position: pos1._id }).lean();
    const placedAtHistory = history1.find(h => h.field === 'placedAt');
    const statusHistory = history1.find(h => h.field === 'status');
    assert(statusHistory && statusHistory.oldValue === 'A&P' && statusHistory.newValue === 'Placed', 'PositionHistory logged status transition');
    assert(placedAtHistory && placedAtHistory.newValue === new Date(res1.data.placedAt).toISOString(), 'PositionHistory logged placedAt creation');

    // Test 2: Transition A&P -> Placed with explicit valid date
    console.log('\nTest 2: Transition A&P -> Placed with explicit date');
    const pos2 = await Position.create({
      jobOrderId: 'TEST-PL-002',
      client: testClientId,
      position: 'Data Scientist',
      pLevel: 'P4',
      status: 'A&P'
    });
    createdPositionIds.push(pos2._id);

    const explicitDateStr = '2026-09-15T10:30:00.000Z';
    const { req: req2, res: res2 } = mockReqRes(
      { status: 'Placed', placedAt: explicitDateStr },
      { id: pos2._id.toString() }
    );
    await positionController.updatePosition(req2, res2);

    assert(res2.statusCode === 200, 'updatePosition returned 200');
    assert(
      new Date(res2.data.placedAt).toISOString() === explicitDateStr,
      `placedAt matches explicit date ${explicitDateStr}`
    );

    // Test 3: Updating unrelated fields on already Placed position preserves existing placedAt
    console.log('\nTest 3: Unrelated edits on already Placed position preserve placedAt');
    const initialPlacedAt = res2.data.placedAt;
    // Wait briefly to ensure clock ticks
    await new Promise(r => setTimeout(r, 50));

    const { req: req3, res: res3 } = mockReqRes(
      { remarks: 'Client finalized contract terms' },
      { id: pos2._id.toString() }
    );
    await positionController.updatePosition(req3, res3);

    assert(res3.statusCode === 200, 'updatePosition returned 200');
    assert(res3.data.remarks === 'Client finalized contract terms', 'remarks updated');
    assert(
      new Date(res3.data.placedAt).toISOString() === new Date(initialPlacedAt).toISOString(),
      'placedAt was NOT refreshed and preserved original timestamp'
    );

    // Test 4: Form resubmission with status: 'Placed' preserves placedAt
    console.log('\nTest 4: Resubmitting status: "Placed" without placedAt preserves placedAt');
    const { req: req4, res: res4 } = mockReqRes(
      { status: 'Placed', remarks: 'Another remark update' },
      { id: pos2._id.toString() }
    );
    await positionController.updatePosition(req4, res4);

    assert(res4.statusCode === 200, 'updatePosition returned 200');
    assert(
      new Date(res4.data.placedAt).toISOString() === new Date(initialPlacedAt).toISOString(),
      'placedAt remains identical when status "Placed" is resubmitted'
    );

    // Test 5: Transition Placed -> A&P clears placedAt and preserves history
    console.log('\nTest 5: Transition Placed -> A&P clears placedAt and preserves history');
    const historyCountBefore = await PositionHistory.countDocuments({ position: pos2._id });

    const { req: req5, res: res5 } = mockReqRes(
      { status: 'A&P' },
      { id: pos2._id.toString() }
    );
    await positionController.updatePosition(req5, res5);

    assert(res5.statusCode === 200, 'updatePosition returned 200');
    assert(res5.data.status === 'A&P', 'status updated to A&P');
    assert(res5.data.placedAt === null, 'placedAt cleared to null');

    const historyAfter = await PositionHistory.find({ position: pos2._id }).lean();
    assert(historyAfter.length > historyCountBefore, 'PositionHistory entries were appended, never deleted');
    const clearPlacedAtHist = historyAfter.find(h => h.field === 'placedAt' && h.newValue === '');
    assert(
      clearPlacedAtHist && clearPlacedAtHist.oldValue === new Date(initialPlacedAt).toISOString(),
      'PositionHistory preserved the prior placement timestamp in oldValue'
    );

    // Test 6: Transition Placed -> Hold clears placedAt
    console.log('\nTest 6: Transition Placed -> Hold clears placedAt');
    const pos6 = await Position.create({
      jobOrderId: 'TEST-PL-006',
      client: testClientId,
      position: 'Product Manager',
      pLevel: 'P2',
      status: 'Placed',
      placedAt: new Date('2026-08-01T00:00:00.000Z')
    });
    createdPositionIds.push(pos6._id);

    const { req: req6, res: res6 } = mockReqRes({ status: 'Hold' }, { id: pos6._id.toString() });
    await positionController.updatePosition(req6, res6);
    assert(res6.statusCode === 200, 'updatePosition returned 200');
    assert(res6.data.status === 'Hold', 'Status updated to Hold');
    assert(res6.data.placedAt === null, 'placedAt cleared to null');

    // Test 7: Direct creation with status: 'Placed' without explicit date leaves placedAt null
    console.log('\nTest 7: Direct create as Placed without date leaves placedAt null (Rule 5)');
    const { req: req7, res: res7 } = mockReqRes({
      jobOrderId: 'TEST-PL-007',
      client: testClientId.toString(),
      position: 'DevOps Lead',
      pLevel: 'P4',
      status: 'Placed'
    });
    await positionController.createPosition(req7, res7);
    if (res7.data && res7.data._id) createdPositionIds.push(res7.data._id);

    assert(res7.statusCode === 201, 'createPosition returned 201');
    assert(res7.data.status === 'Placed', 'Status is Placed');
    assert(res7.data.placedAt === null, 'placedAt is null (not automatically assumed today)');

    // Test 8: Direct creation with status: 'Placed' WITH explicit date sets placedAt
    console.log('\nTest 8: Direct create as Placed with explicit date sets placedAt');
    const { req: req8, res: res8 } = mockReqRes({
      jobOrderId: 'TEST-PL-008',
      client: testClientId.toString(),
      position: 'QA Architect',
      pLevel: 'P3',
      status: 'Placed',
      placedAt: '2026-07-20T14:00:00.000Z'
    });
    await positionController.createPosition(req8, res8);
    if (res8.data && res8.data._id) createdPositionIds.push(res8.data._id);

    assert(res8.statusCode === 201, 'createPosition returned 201');
    assert(
      new Date(res8.data.placedAt).toISOString() === '2026-07-20T14:00:00.000Z',
      'placedAt equals explicit date'
    );

    // Test 9: Direct creation with non-Placed status leaves placedAt null
    console.log('\nTest 9: Direct create with non-Placed status leaves placedAt null');
    const { req: req9, res: res9 } = mockReqRes({
      jobOrderId: 'TEST-PL-009',
      client: testClientId.toString(),
      position: 'Backend Developer',
      pLevel: 'P2',
      status: 'Yet to Activate'
    });
    await positionController.createPosition(req9, res9);
    if (res9.data && res9.data._id) createdPositionIds.push(res9.data._id);

    assert(res9.statusCode === 201, 'createPosition returned 201');
    assert(res9.data.placedAt === null, 'placedAt is null');

    // Test 10: Invalid date in createPosition returns 400
    console.log('\nTest 10: Invalid date string in createPosition returns 400');
    const { req: req10, res: res10 } = mockReqRes({
      jobOrderId: 'TEST-PL-010',
      client: testClientId.toString(),
      position: 'Invalid Date Pos',
      pLevel: 'P1',
      status: 'Placed',
      placedAt: 'invalid-not-a-real-date'
    });
    await positionController.createPosition(req10, res10);

    assert(res10.statusCode === 400, 'createPosition returned 400');
    assert(res10.data.error === 'Invalid placedAt date', 'Returned clear validation error');

    // Test 11: Invalid date in updatePosition returns 400
    console.log('\nTest 11: Invalid date string in updatePosition returns 400');
    const { req: req11, res: res11 } = mockReqRes(
      { status: 'Placed', placedAt: 'gibberish-date' },
      { id: pos1._id.toString() }
    );
    await positionController.updatePosition(req11, res11);

    assert(res11.statusCode === 400, 'updatePosition returned 400');
    assert(res11.data.error === 'Invalid placedAt date', 'Returned clear validation error');

    // Test 12: Boolean or object passed as placedAt returns 400
    console.log('\nTest 12: Boolean placedAt returns 400');
    const { req: req12, res: res12 } = mockReqRes(
      { placedAt: true },
      { id: pos1._id.toString() }
    );
    await positionController.updatePosition(req12, res12);
    assert(res12.statusCode === 400, 'updatePosition returned 400 on boolean date');

    // Test 13: Simulated Four UI Pathways
    console.log('\nTest 13: Four UI Pathways Validation');

    // Pathway 1: Positions.jsx row dropdown: updatePosition(pos._id, { status: 'Placed' })
    const pathwayPos1 = await Position.create({
      jobOrderId: 'TEST-PW-001',
      client: testClientId,
      position: 'UI Pathway 1',
      pLevel: 'P1',
      status: 'Focus'
    });
    createdPositionIds.push(pathwayPos1._id);
    const { req: pwReq1, res: pwRes1 } = mockReqRes({ status: 'Placed' }, { id: pathwayPos1._id.toString() });
    await positionController.updatePosition(pwReq1, pwRes1);
    assert(pwRes1.statusCode === 200 && pwRes1.data.status === 'Placed' && pwRes1.data.placedAt != null, 'Pathway 1 (Positions.jsx row status dropdown) succeeds and sets placedAt');

    // Pathway 2: PositionDetails.jsx header dropdown: updatePosition(id, { status: 'Placed' })
    const pathwayPos2 = await Position.create({
      jobOrderId: 'TEST-PW-002',
      client: testClientId,
      position: 'UI Pathway 2',
      pLevel: 'P1',
      status: 'Client Decision'
    });
    createdPositionIds.push(pathwayPos2._id);
    const { req: pwReq2, res: pwRes2 } = mockReqRes({ status: 'Placed' }, { id: pathwayPos2._id.toString() });
    await positionController.updatePosition(pwReq2, pwRes2);
    assert(pwRes2.statusCode === 200 && pwRes2.data.status === 'Placed' && pwRes2.data.placedAt != null, 'Pathway 2 (PositionDetails.jsx dropdown) succeeds and sets placedAt');

    // Pathway 3: PositionDetails.jsx full edit form: updatePosition(id, payload)
    const existingPlacedTimestamp = pwRes2.data.placedAt;
    const formPayload = {
      status: 'Placed',
      remarks: 'Pathway 3 form update',
      thisWeekFocus: 'Completed',
      cvCount: 8
    };
    const { req: pwReq3, res: pwRes3 } = mockReqRes(formPayload, { id: pathwayPos2._id.toString() });
    await positionController.updatePosition(pwReq3, pwRes3);
    assert(
      pwRes3.statusCode === 200 &&
      pwRes3.data.remarks === 'Pathway 3 form update' &&
      new Date(pwRes3.data.placedAt).toISOString() === new Date(existingPlacedTimestamp).toISOString(),
      'Pathway 3 (PositionDetails.jsx edit form modal) preserves existing placedAt without refreshing'
    );

    // Pathway 4: Archive.jsx status dropdown: updatePosition(pos._id, { status: 'A&P' })
    const { req: pwReq4, res: pwRes4 } = mockReqRes({ status: 'A&P' }, { id: pathwayPos2._id.toString() });
    await positionController.updatePosition(pwReq4, pwRes4);
    assert(
      pwRes4.statusCode === 200 &&
      pwRes4.data.status === 'A&P' &&
      pwRes4.data.placedAt === null,
      'Pathway 4 (Archive.jsx unarchive / status dropdown) clears placedAt when moving away from Placed'
    );

    // Final database audit: Check again that existing 15 positions were NOT touched
    const finalExistingPlaced = await Position.find({ status: 'Placed', jobOrderId: { $not: /^TEST-/ } }).lean();
    const finalWithPlacedAt = finalExistingPlaced.filter(p => p.placedAt !== null && p.placedAt !== undefined);
    assert(
      finalExistingPlaced.length === existingPlaced.length && finalWithPlacedAt.length === 0,
      `Final safety check: All ${finalExistingPlaced.length} original Placed records remain completely untouched`
    );

  } catch (err) {
    console.error('Unexpected error during testing:', err);
    failed++;
  } finally {
    await cleanup();
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
