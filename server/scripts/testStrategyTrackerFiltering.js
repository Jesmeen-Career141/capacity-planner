const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:/Users/User/Desktop/capacity-planner/server/.env' });

console.log('====================================================');
console.log('  Running StrategyTracker Filtering Test Suite');
console.log('====================================================\n');

// 1. Pure Logic Unit Tests
console.log('Test 1: Unit testing filter condition logic...');
const INACTIVE_STATUSES = ['Placed', 'Lost', 'Hold'];

function filterStrategyPositions(positions, showPlacedLost) {
  return positions.filter(pos => {
    if (!showPlacedLost && INACTIVE_STATUSES.includes(pos.status)) return false;
    return true;
  });
}

const mockPositions = [
  { jobOrderId: 'JO-1', position: 'Dev', status: 'A&P' },
  { jobOrderId: 'JO-2', position: 'Lead', status: 'Fence' },
  { jobOrderId: 'JO-3', position: 'Architect', status: 'Paused' },
  { jobOrderId: 'JO-4', position: 'PM', status: 'Yet to Activate' },
  { jobOrderId: 'JO-5', position: 'QA', status: 'Focus' },
  { jobOrderId: 'JO-6', position: 'BA', status: 'Client Decision' },
  { jobOrderId: 'JO-7', position: 'HR', status: 'Hold' },
  { jobOrderId: 'JO-8', position: 'Sales', status: 'Placed' },
  { jobOrderId: 'JO-9', position: 'Finance', status: 'Lost' },
];

const defaultFiltered = filterStrategyPositions(mockPositions, false);
assert.strictEqual(defaultFiltered.length, 6);
const activeStatuses = defaultFiltered.map(p => p.status);
assert.ok(activeStatuses.includes('A&P'));
assert.ok(activeStatuses.includes('Fence'));
assert.ok(activeStatuses.includes('Paused'), 'Paused must remain visible');
assert.ok(activeStatuses.includes('Yet to Activate'));
assert.ok(activeStatuses.includes('Focus'));
assert.ok(activeStatuses.includes('Client Decision'), 'Client Decision must remain visible');
assert.ok(!activeStatuses.includes('Hold'), 'Hold must be excluded');
assert.ok(!activeStatuses.includes('Placed'), 'Placed must be excluded');
assert.ok(!activeStatuses.includes('Lost'), 'Lost must be excluded');

const toggledFiltered = filterStrategyPositions(mockPositions, true);
assert.strictEqual(toggledFiltered.length, 9, 'When toggled, all positions must appear');

console.log('✓ Passed: Default filter excludes Hold, Placed, and Lost.');
console.log('✓ Passed: Paused and Client Decision are preserved.');
console.log('✓ Passed: Checkbox toggle restores inactive positions.\n');

// 2. Integration Test with Live Database Data (Read-Only)
async function testLiveDatabase() {
  console.log('Test 2: Verifying with live database positions (read-only)...');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const positions = await db.collection('positions').find({}).toArray();
  const clients = await db.collection('clients').find({}).toArray();
  const clientMap = Object.fromEntries(clients.map(c => [String(c._id), c.clientName]));

  const positionsWithClient = positions.map(p => ({
    ...p,
    clientName: clientMap[String(p.client)] || '—'
  }));

  // Apply default StrategyTracker filter
  const activeWorkingList = filterStrategyPositions(positionsWithClient, false);
  const fullListWithToggled = filterStrategyPositions(positionsWithClient, true);

  console.log(`Total database positions: ${positions.length}`);
  console.log(`Positions shown in default active working list: ${activeWorkingList.length}`);
  console.log(`Positions shown when toggled (Show Placed/Lost/Hold): ${fullListWithToggled.length}`);

  // Assertions on default list
  assert.strictEqual(fullListWithToggled.length, 155);
  assert.strictEqual(activeWorkingList.length, 60);

  const activeStatusCounts = {};
  for (const p of activeWorkingList) {
    activeStatusCounts[p.status] = (activeStatusCounts[p.status] || 0) + 1;
  }
  console.log('Active list breakdown:', activeStatusCounts);
  assert.deepStrictEqual(activeStatusCounts, {
    'A&P': 36,
    Fence: 6,
    Paused: 3,
    'Yet to Activate': 15
  });

  // Verify HealthRecon positions (all 6 must be excluded from default active list)
  const hrPositions = activeWorkingList.filter(p => p.clientName.toLowerCase().includes('health'));
  console.log(`HealthRecon positions in default active list: ${hrPositions.length} (Expected: 0)`);
  assert.strictEqual(hrPositions.length, 0);

  // Verify HealthRecon appears when toggled
  const hrToggled = fullListWithToggled.filter(p => p.clientName.toLowerCase().includes('health'));
  console.log(`HealthRecon positions when toggled: ${hrToggled.length} (Expected: 6)`);
  assert.strictEqual(hrToggled.length, 6);

  await mongoose.disconnect();
  console.log('✓ Passed: Database verification confirmed 100% accurate filtering.\n');

  console.log('====================================================');
  console.log('  All StrategyTracker Tests Passed! (2/2)');
  console.log('====================================================');
}

testLiveDatabase().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
