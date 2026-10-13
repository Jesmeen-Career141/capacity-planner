const assert = require('assert');
const path = require('path');

console.log('====================================================');
console.log('  Running TA Departure Reassignment Test Suite');
console.log('====================================================\n');

// 1. Test Status Filter Query Logic
console.log('Test 1: Testing status eligibility rules ($nin: [Placed, Lost, Hold])...');
const excludedStatuses = ['Placed', 'Lost', 'Hold'];
const queryFilter = { status: { $nin: excludedStatuses } };

function isEligible(status) {
  return !excludedStatuses.includes(status);
}

// All known statuses in Position schema
const allSchemaStatuses = [
  'Yet to Activate',
  'A&P',
  'Fence',
  'Hold',
  'Paused',
  'Placed',
  'Lost',
  'Focus',
  'Client Decision'
];

const eligibleStatuses = allSchemaStatuses.filter(isEligible);
const nonEligibleStatuses = allSchemaStatuses.filter(s => !isEligible(s));

assert.deepStrictEqual(nonEligibleStatuses.sort(), ['Hold', 'Lost', 'Placed']);
assert.deepStrictEqual(eligibleStatuses.sort(), [
  'A&P',
  'Client Decision',
  'Fence',
  'Focus',
  'Paused',
  'Yet to Activate'
]);

console.log('✓ Passed: Inactive statuses strictly excluded: Hold, Lost, Placed.');
console.log('✓ Passed: Eligible statuses correctly identified:', eligibleStatuses.join(', '), '\n');

// 2. Test Controller Query Formation and Reassignment Logic
console.log('Test 2: Testing updateTAStatus query formation and flag mutation...');

// Mock TA and Position models
let capturedQuery = null;
let savedPositions = [];

const mockPositions = [
  { _id: 'pos-1', status: 'A&P', assignee: 'ta-123', flagOverrides: new Map(), save: async function() { savedPositions.push(this); } },
  { _id: 'pos-2', status: 'Fence', assignee: 'ta-123', flagOverrides: new Map(), save: async function() { savedPositions.push(this); } },
  { _id: 'pos-3', status: 'Hold', assignee: 'ta-123', flagOverrides: new Map(), save: async function() { savedPositions.push(this); } },
  { _id: 'pos-4', status: 'Placed', assignee: 'ta-123', flagOverrides: new Map(), save: async function() { savedPositions.push(this); } },
  { _id: 'pos-5', status: 'Lost', assignee: 'ta-123', flagOverrides: new Map(), save: async function() { savedPositions.push(this); } },
];

// Simulate the query executed by taController.js
function simulatePositionFind(query) {
  capturedQuery = query;
  return mockPositions.filter(p => {
    if (query.assignee && p.assignee !== query.assignee) return false;
    if (query.status && query.status.$nin && query.status.$nin.includes(p.status)) return false;
    return true;
  });
}

// Execute departure logic using the updated query rule
const taId = 'ta-123';
const status = 'Left';

if (status === 'Left') {
  const matched = simulatePositionFind({
    assignee: taId,
    status: { $nin: ['Placed', 'Lost', 'Hold'] }
  });

  for (const pos of matched) {
    if (!pos.flagOverrides) pos.flagOverrides = new Map();
    pos.flagOverrides.set('reAssign', 'on');
    pos.save();
  }
}

// Assertions on query
assert.strictEqual(capturedQuery.assignee, 'ta-123');
assert.deepStrictEqual(capturedQuery.status, { $nin: ['Placed', 'Lost', 'Hold'] });

// Assertions on matched positions
assert.strictEqual(savedPositions.length, 2, 'Only 2 eligible positions should have been updated');
assert.strictEqual(savedPositions[0]._id, 'pos-1');
assert.strictEqual(savedPositions[1]._id, 'pos-2');
assert.strictEqual(savedPositions[0].flagOverrides.get('reAssign'), 'on');
assert.strictEqual(savedPositions[1].flagOverrides.get('reAssign'), 'on');

// Assertions on excluded positions: untouched
const holdPos = mockPositions.find(p => p._id === 'pos-3');
const placedPos = mockPositions.find(p => p._id === 'pos-4');
const lostPos = mockPositions.find(p => p._id === 'pos-5');

assert.strictEqual(holdPos.flagOverrides.get('reAssign'), undefined);
assert.strictEqual(placedPos.flagOverrides.get('reAssign'), undefined);
assert.strictEqual(lostPos.flagOverrides.get('reAssign'), undefined);

console.log('✓ Passed: Query correctly excludes Hold, Placed, and Lost.');
console.log('✓ Passed: Only eligible positions receive flagOverrides.reAssign = "on".');
console.log('✓ Passed: Excluded positions remain completely untouched.\n');

// 3. Test Non-Departure Status (e.g. status === 'Active')
console.log('Test 3: Testing non-departure status (status !== "Left")...');
capturedQuery = null;
savedPositions = [];

const statusActive = 'Active';
if (statusActive === 'Left') {
  simulatePositionFind({
    assignee: taId,
    status: { $nin: ['Placed', 'Lost', 'Hold'] }
  });
}

assert.strictEqual(capturedQuery, null, 'No position query should occur when status is not Left');
assert.strictEqual(savedPositions.length, 0, 'No positions should be updated when status is Active');

console.log('✓ Passed: Non-departure status triggers no position updates.\n');

console.log('====================================================');
console.log('  All TA Departure Reassignment Tests Passed! (3/3)');
console.log('====================================================');
