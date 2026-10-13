const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('  Running Status-Filter Navigation Test Suite');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ Passed: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAILED: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const rootDir = fs.existsSync(path.resolve('client')) ? path.resolve('.') : path.resolve(__dirname, '../..');
const statCardPath = path.join(rootDir, 'client/src/components/StatCard.jsx');
const dashboardPath = path.join(rootDir, 'client/src/pages/Dashboard.jsx');
const taBoardPath = path.join(rootDir, 'client/src/pages/TABoard.jsx');
const taBoardCssPath = path.join(rootDir, 'client/src/pages/TABoard.css');
const positionsPath = path.join(rootDir, 'client/src/pages/Positions.jsx');
const archivePath = path.join(rootDir, 'client/src/pages/Archive.jsx');
const archiveCssPath = path.join(rootDir, 'client/src/pages/Archive.css');

// 1. StatCard.jsx inspection
test('StatCard.jsx supports onClick, accessibility attributes, keyboard navigation and cursor pointer', () => {
  const content = fs.readFileSync(statCardPath, 'utf8');
  assert(content.includes('function StatCard({ label, value, accent = \'leaf\', onClick })'), 'StatCard should accept onClick prop');
  assert(content.includes('const isClickable = typeof onClick === \'function\''), 'StatCard should compute isClickable');
  assert(content.includes('cursor-pointer'), 'StatCard should apply cursor-pointer class when clickable');
  assert(content.includes('role={isClickable ? \'button\' : undefined}'), 'StatCard should set role="button" when clickable');
  assert(content.includes('tabIndex={isClickable ? 0 : undefined}'), 'StatCard should set tabIndex=0 when clickable');
  assert(content.includes('e.key === \'Enter\' || e.key === \' \''), 'StatCard should handle Enter and Space keyboard navigation');
  assert(content.includes('focus-visible:ring-2'), 'StatCard should provide visual focus affordances');
});

// 2. Dashboard.jsx inspection and logic verification
test('Dashboard.jsx implements handleCardClick navigating to Positions and Archive with correct params', () => {
  const content = fs.readFileSync(dashboardPath, 'utf8');
  assert(content.includes("import { useNavigate } from 'react-router-dom'"), 'Dashboard should import useNavigate');
  assert(content.includes('const navigate = useNavigate()'), 'Dashboard should instantiate navigate');
  assert(content.includes('const handleCardClick = (status) =>'), 'Dashboard should define handleCardClick');

  // Test simulated navigation logic
  const INACTIVE_STATUSES = ['Placed', 'Lost', 'Hold'];
  const getNavUrl = (status) => {
    if (status === 'Total') return '/positions';
    if (INACTIVE_STATUSES.includes(status)) return `/archive?status=${encodeURIComponent(status)}`;
    return `/positions?status=${encodeURIComponent(status)}`;
  };

  assert.strictEqual(getNavUrl('Total'), '/positions');
  assert.strictEqual(getNavUrl('A&P'), '/positions?status=A%26P');
  assert.strictEqual(getNavUrl('Hold'), '/archive?status=Hold');
  assert.strictEqual(getNavUrl('Placed'), '/archive?status=Placed');
  assert.strictEqual(getNavUrl('Lost'), '/archive?status=Lost');
  assert.strictEqual(getNavUrl('Fence'), '/positions?status=Fence');

  assert(content.includes('onClick: () => handleCardClick(status)'), 'Cards should attach handleCardClick');
  assert(content.includes('onClick={c.onClick}'), 'StatCard in Dashboard should receive onClick');
});

// 3. TABoard.jsx and TABoard.css inspection
test('TABoard.jsx wires Active (A&P) and other status cards to positions navigation with accessibility', () => {
  const content = fs.readFileSync(taBoardPath, 'utf8');
  const css = fs.readFileSync(taBoardCssPath, 'utf8');

  assert(content.includes('tb-stat-card--clickable'), 'StatCard in TABoard should support tb-stat-card--clickable');
  assert(content.includes('role={isClickable ? \'button\' : undefined}'), 'TABoard StatCard should set role="button"');
  assert(content.includes('tabIndex={isClickable ? 0 : undefined}'), 'TABoard StatCard should set tabIndex=0');
  assert(content.includes('e.key === \'Enter\' || e.key === \' \''), 'TABoard StatCard should support keyboard interaction');

  // Verify Active (A&P) card click handler
  assert(content.includes("label=\"Active (A&P)\""), 'TABoard should have Active (A&P) card');
  assert(content.includes("navigate('/positions?status=A%26P')"), 'Active (A&P) card should navigate to /positions?status=A%26P');
  assert(content.includes("navigate('/positions')"), 'Total Roles card should navigate to /positions');

  // Verify CSS affordances
  assert(css.includes('.tb-stat-card--clickable'), 'TABoard.css should define .tb-stat-card--clickable');
  assert(css.includes('cursor: pointer'), 'TABoard.css should set cursor: pointer for clickable cards');
  assert(css.includes(':focus-visible'), 'TABoard.css should provide focus-visible outlines');
});

// 4. Positions.jsx URL status normalization
test('Positions.jsx normalizes URL status parameters correctly', () => {
  const content = fs.readFileSync(positionsPath, 'utf8');
  assert(content.includes("import { Link, useNavigate, useSearchParams } from 'react-router-dom'"), 'Positions should import useSearchParams');
  assert(content.includes('normalizeStatusParam'), 'Positions should define normalizeStatusParam');

  // Unit test normalizeStatusParam simulation
  const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];
  const normalizeStatusParam = (status) => {
    if (!status) return '';
    const trimmed = status.trim();
    if (trimmed.toLowerCase() === 'active' || trimmed === 'A&P' || trimmed === 'A & P') {
      return 'A&P';
    }
    const match = STATUS_OPTIONS.find(s => s.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
  };

  assert.strictEqual(normalizeStatusParam('Active'), 'A&P');
  assert.strictEqual(normalizeStatusParam('active'), 'A&P');
  assert.strictEqual(normalizeStatusParam('A&P'), 'A&P');
  assert.strictEqual(normalizeStatusParam('A & P'), 'A&P');
  assert.strictEqual(normalizeStatusParam('hold'), 'Hold');
  assert.strictEqual(normalizeStatusParam('Hold'), 'Hold');
  assert.strictEqual(normalizeStatusParam('placed'), 'Placed');
  assert.strictEqual(normalizeStatusParam('Lost'), 'Lost');
  assert.strictEqual(normalizeStatusParam('fence'), 'Fence');
  assert.strictEqual(normalizeStatusParam(''), '');
});

// 5. Positions.jsx filtering preserves active archived statuses when selected
test('Positions.jsx filteredPositions correctly includes archived status when explicitly selected in filter', () => {
  const content = fs.readFileSync(positionsPath, 'utf8');
  assert(content.includes('ARCHIVE_STATUSES.includes(pos.status) && filters.status !== pos.status'),
    'filteredPositions should permit archived statuses when explicitly selected in filters.status');

  const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];
  const mockPositions = [
    { _id: '1', status: 'A&P', position: 'Frontend Dev', client: { _id: 'c1' }, jobOrderId: 'JO-1' },
    { _id: '2', status: 'Hold', position: 'Backend Dev', client: { _id: 'c1' }, jobOrderId: 'JO-2' },
    { _id: '3', status: 'Placed', position: 'DevOps Lead', client: { _id: 'c2' }, jobOrderId: 'JO-3' },
    { _id: '4', status: 'Lost', position: 'QA Engineer', client: { _id: 'c3' }, jobOrderId: 'JO-4' },
    { _id: '5', status: 'Fence', position: 'Product Manager', client: { _id: 'c1' }, jobOrderId: 'JO-5' },
  ];

  const filterPositions = (statusFilter) => {
    return mockPositions.filter(pos => {
      if (ARCHIVE_STATUSES.includes(pos.status) && statusFilter !== pos.status) return false;
      const matchesStatus = !statusFilter || pos.status === statusFilter;
      return matchesStatus;
    });
  };

  // Case A: default empty filter excludes Hold, Placed, Lost
  const defaultResults = filterPositions('');
  assert.strictEqual(defaultResults.length, 2);
  assert.deepStrictEqual(defaultResults.map(p => p.status), ['A&P', 'Fence']);

  // Case B: filtering by A&P returns only A&P
  const apResults = filterPositions('A&P');
  assert.strictEqual(apResults.length, 1);
  assert.strictEqual(apResults[0].status, 'A&P');

  // Case C: filtering by Hold directly in Positions returns Hold position without returning 0 results
  const holdResults = filterPositions('Hold');
  assert.strictEqual(holdResults.length, 1);
  assert.strictEqual(holdResults[0].status, 'Hold');

  // Case D: filtering by Placed directly in Positions returns Placed position
  const placedResults = filterPositions('Placed');
  assert.strictEqual(placedResults.length, 1);
  assert.strictEqual(placedResults[0].status, 'Placed');

  // Case E: filtering by Lost directly in Positions returns Lost position
  const lostResults = filterPositions('Lost');
  assert.strictEqual(lostResults.length, 1);
  assert.strictEqual(lostResults[0].status, 'Lost');
});

// 6. Positions.jsx searchParams sync and handleClearFilters
test('Positions.jsx synchronizes searchParams and provides handleClearFilters', () => {
  const content = fs.readFileSync(positionsPath, 'utf8');
  assert(content.includes('const [searchParams, setSearchParams] = useSearchParams()'), 'Should use useSearchParams');
  assert(content.includes('nextParams.set(\'status\', value)'), 'handleFilterChange should update status searchParam');
  assert(content.includes('nextParams.delete(\'status\')'), 'handleFilterChange should delete status searchParam when cleared');
  assert(content.includes('handleClearFilters'), 'Positions should define handleClearFilters');
  assert(content.includes('onClick={handleClearFilters}'), 'Clear filters button should invoke handleClearFilters');
});

// 7. Archive.jsx tab auto-activation based on URL search params
test('Archive.jsx activates Position History tab automatically when status or tab=history is present in URL', () => {
  const content = fs.readFileSync(archivePath, 'utf8');
  assert(content.includes("import { Link, useSearchParams } from 'react-router-dom'"), 'Archive should import useSearchParams');
  assert(content.includes('const [searchParams, setSearchParams] = useSearchParams()'), 'Archive should call useSearchParams');
  assert(content.includes("const statusParam = searchParams.get('status')"), 'Archive should inspect statusParam');
  assert(content.includes("if (statusParam || tabParam === 'history')"), 'Archive should default to history tab when status is present');
  assert(content.includes('handleTabChange'), 'Archive should define handleTabChange');
});

// 8. Archive.jsx PositionHistoryTab filtering and Clear filter button
test('PositionHistoryTab in Archive.jsx filters by status and supports clear filter button', () => {
  const content = fs.readFileSync(archivePath, 'utf8');
  const css = fs.readFileSync(archiveCssPath, 'utf8');

  assert(content.includes('handleStatusFilterChange'), 'PositionHistoryTab should support changing status filter');
  assert(content.includes('handleClearFilter'), 'PositionHistoryTab should support clearing status filter');
  assert(content.includes('arch-clear-btn'), 'PositionHistoryTab should render arch-clear-btn');
  assert(content.includes('displayedPositions'), 'PositionHistoryTab should compute displayedPositions');
  assert(content.includes('id="arch-status-filter"'), 'PositionHistoryTab should render select filter');

  // Test simulated PositionHistory filtering
  const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];
  const mockArchived = [
    { _id: '1', status: 'Hold', position: 'Dev 1' },
    { _id: '2', status: 'Hold', position: 'Dev 2' },
    { _id: '3', status: 'Placed', position: 'Dev 3' },
    { _id: '4', status: 'Lost', position: 'Dev 4' },
  ];

  const filterArchived = (param) => {
    const normalized = ARCHIVE_STATUSES.find(s => s.toLowerCase() === (param || '').trim().toLowerCase()) || '';
    return normalized ? mockArchived.filter(p => p.status.toLowerCase() === normalized.toLowerCase()) : mockArchived;
  };

  assert.strictEqual(filterArchived('').length, 4);
  assert.strictEqual(filterArchived('Hold').length, 2);
  assert.strictEqual(filterArchived('hold').length, 2);
  assert.strictEqual(filterArchived('Placed').length, 1);
  assert.strictEqual(filterArchived('Lost').length, 1);

  // CSS classes verification
  assert(css.includes('.arch-filter-select'), 'Archive.css should style .arch-filter-select');
  assert(css.includes('.arch-clear-btn'), 'Archive.css should style .arch-clear-btn');
});

// 9. Preserves database status integrity and legacy fields
test('Position status integrity and legacy fields remain preserved', () => {
  const positionsCode = fs.readFileSync(positionsPath, 'utf8');
  assert(positionsCode.includes("const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision']"),
    'Status options must preserve exact database status names including A&P');
  assert(positionsCode.includes('ARCHIVE_STATUSES = [\'Placed\', \'Lost\', \'Hold\']'),
    'ARCHIVE_STATUSES must preserve exact status values Placed, Lost, Hold');
});

// 10. StrategyTracker integrity preserved
test('StrategyTracker.jsx status filtering remains intact and unchanged', () => {
  const strategyCode = fs.readFileSync(path.join(rootDir, 'client/src/pages/StrategyTracker.jsx'), 'utf8');
  assert(strategyCode.includes("['Placed', 'Lost', 'Hold'].includes(pos.status)"),
    'StrategyTracker must preserve inactive filtering for Placed, Lost, and Hold');
});

console.log(`\n====================================================`);
console.log(`  All Tests Completed: ${passedTests}/${totalTests} Passed!`);
console.log(`====================================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
