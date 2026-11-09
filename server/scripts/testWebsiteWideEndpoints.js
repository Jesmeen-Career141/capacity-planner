// Test all website modules' endpoints from port 5174 (the alternate Vite port)
// Verifies status code, JSON response parsing, and Access-Control-Allow-Origin header

const TEST_ORIGIN = 'http://localhost:5174';
const BASE_URL = 'http://localhost:5000/api';

const endpointsToTest = [
  // 1. Dashboard
  { module: 'Dashboard', name: 'Positions List', path: '/positions' },

  // 2. TA Board
  { module: 'TA Board', name: 'Positions', path: '/positions' },
  { module: 'TA Board', name: 'Archive Snapshots', path: '/archive' },
  { module: 'TA Board', name: 'Active TAs', path: '/tas/active' },
  { module: 'TA Board', name: 'Weekly Allocations Batch', path: '/weekly-allocations/batch?startDate=2026-11-02&endDate=2026-11-09' },

  // 3. TA Dashboard
  { module: 'TA Dashboard', name: 'Summary', path: '/ta-dashboard/summary' },
  { module: 'TA Dashboard', name: 'Daily Activities', path: '/ta-dashboard/daily-activities' },
  { module: 'TA Dashboard', name: 'TA Productivity', path: '/ta-dashboard/ta-productivity' },
  { module: 'TA Dashboard', name: 'Position Overview', path: '/ta-dashboard/position-overview' },
  { module: 'TA Dashboard', name: 'Planned vs Actual', path: '/ta-dashboard/planned-vs-actual' },
  { module: 'TA Dashboard', name: 'Submission Sets', path: '/ta-dashboard/submission-sets' },
  { module: 'TA Dashboard', name: 'Trends', path: '/ta-dashboard/trends' },

  // 4. Interviews
  { module: 'Interviews', name: 'Interviews List', path: '/interviews' },

  // 5. Work Board
  { module: 'Work Board', name: 'Assignments', path: '/work-board/assignments' },

  // 6. Daily Activity
  { module: 'Daily Activity', name: 'Activities List', path: '/daily-activity' },
  { module: 'Daily Activity', name: 'Planned vs Actual', path: '/daily-activity/planned-vs-actual' },

  // 7. Submission Sets
  { module: 'Submission Sets', name: 'Sets List', path: '/submission-sets' },

  // 8. Positions
  { module: 'Positions', name: 'All Positions', path: '/positions' },
  { module: 'Positions', name: 'Color Legend', path: '/color-legend' },

  // 9. Strategies
  { module: 'Strategies', name: 'Strategies List', path: '/strategy-tracker/strategies' },
  { module: 'Strategies', name: 'Strategy Entries', path: '/strategy-tracker/entries' },

  // 10. Clients
  { module: 'Clients', name: 'Clients List', path: '/clients' },

  // 11. TAs
  { module: 'TAs', name: 'All TAs', path: '/tas' },

  // 12. Archive
  { module: 'Archive', name: 'Archive List', path: '/archive' },

  // 13. Recruitment Attempts & Placements
  { module: 'Attempts', name: 'Attempts Dashboard', path: '/attempts/dashboard' },
  { module: 'Placements', name: 'Placements List', path: '/placements' },
];

async function runTests() {
  console.log(`================================================================`);
  console.log(`  Verifying Website-Wide Endpoints from Origin: ${TEST_ORIGIN}`);
  console.log(`================================================================\n`);

  let passed = 0;
  let failed = 0;

  for (const ep of endpointsToTest) {
    const url = `${BASE_URL}${ep.path}`;
    try {
      // 1. Preflight OPTIONS check
      const optRes = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: TEST_ORIGIN,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      const optAcao = optRes.headers.get('access-control-allow-origin');
      const optOk = (optRes.status === 204 || optRes.status === 200) && optAcao === TEST_ORIGIN;

      // 2. Actual GET request
      const getRes = await fetch(url, {
        method: 'GET',
        headers: {
          Origin: TEST_ORIGIN,
          Accept: 'application/json'
        }
      });

      const getAcao = getRes.headers.get('access-control-allow-origin');
      const data = await getRes.json();
      const getOk = getRes.status === 200 && getAcao === TEST_ORIGIN && data !== null;

      if (optOk && getOk) {
        passed++;
        const countInfo = Array.isArray(data) ? ` (${data.length} items)` : (typeof data === 'object' ? ` (Object)` : '');
        console.log(`  [PASS] [${ep.module}] ${ep.name} -> HTTP ${getRes.status}${countInfo}`);
      } else {
        failed++;
        console.error(`  [FAIL] [${ep.module}] ${ep.name} -> GET: ${getRes.status} (ACAO: ${getAcao}) | OPTIONS: ${optRes.status} (ACAO: ${optAcao})`);
      }
    } catch (err) {
      failed++;
      console.error(`  [FAIL] [${ep.module}] ${ep.name} -> Error: ${err.message}`);
    }
  }

  // Also verify SSE event stream endpoint
  try {
    const sseRes = await fetch('http://localhost:5000/api/events/stream', {
      headers: { Origin: TEST_ORIGIN }
    });
    const sseAcao = sseRes.headers.get('access-control-allow-origin');
    const sseType = sseRes.headers.get('content-type');
    if (sseRes.status === 200 && sseAcao === TEST_ORIGIN && sseType && sseType.includes('text/event-stream')) {
      passed++;
      console.log(`  [PASS] [TA Board] Live Events Stream (/api/events/stream) -> HTTP 200 (text/event-stream, ACAO: ${sseAcao})`);
      // Close stream connection immediately
      if (sseRes.body && typeof sseRes.body.cancel === 'function') {
        sseRes.body.cancel();
      }
    } else {
      failed++;
      console.error(`  [FAIL] [TA Board] Live Events Stream -> Status: ${sseRes.status}, ACAO: ${sseAcao}`);
    }
  } catch (err) {
    failed++;
    console.error(`  [FAIL] [TA Board] Live Events Stream -> Error: ${err.message}`);
  }

  console.log(`\n================================================================`);
  console.log(`  Endpoint Verification Complete: ${passed} passed, ${failed} failed`);
  console.log(`================================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
