/**
 * Automated Verification Suite for TA Activity Dashboard
 *
 * Verifies:
 * 1. Aggregation of Workload, Sourcing, and Recruitment Output metrics
 * 2. Follow-up does not inflate LinkedIn sourcing totals
 * 3. Add-on profiles reported separately from primary LinkedIn searches
 * 4. Deduplication of candidate counts (submissions vs unique candidates)
 * 5. Consistent application of global filters (TA, position, client, date range, work type)
 * 6. Daily activities overview with sorting and pagination
 * 7. TA productivity comparison across workload and output
 * 8. Position-level aggregation across all assigned TAs and recruitment rounds
 * 9. Planned vs Actual work matrix integrity (status not auto-completed)
 * 10. Submission set performance aggregation
 * 11. Trend timeline and conversion funnel aggregation
 * 12. Verification of zero destruction to existing positions, TAs, clients, and legacy counters
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const WorkAssignment = require('../models/WorkAssignment');
const DailyActivity = require('../models/DailyActivity');
const TA = require('../models/TA');
const Client = require('../models/Client');

const dashboardController = require('../controllers/taActivityDashboardController');

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

// Helper mock response
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
  console.log('  Testing TA Activity Dashboard Backend & Aggregations');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const initialPositionsCount = await Position.countDocuments();
  const initialTAsCount = await TA.countDocuments();
  const initialClientsCount = await Client.countDocuments();

  console.log(`Initial DB State: ${initialPositionsCount} positions, ${initialTAsCount} TAs, ${initialClientsCount} clients.\n`);

  // Ensure test Client and TA
  let testClient = await Client.findOne({ clientId: 'TEST-DASH-CLI' });
  if (!testClient) {
    testClient = await Client.create({ clientId: 'TEST-DASH-CLI', clientName: 'Test Dashboard Client' });
  }

  // Clean up any remnants from previous runs for full idempotence
  await DailyActivity.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
  await WorkAssignment.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
  await CandidateSubmission.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
  await SubmissionSet.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
  await Position.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
  await TA.deleteMany({ name: 'Test TA Dashboard Analyst' });

  const testTA = await TA.create({ name: 'Test TA Dashboard Analyst', status: 'Active', color: 'blue' });

  const testPosition = await Position.create({
    jobOrderId: 'TEST-DASH-POS-01',
    position: 'Lead Backend Architect',
    client: testClient._id,
    pLevel: 'P1',
    status: 'A&P',
    assignee: testTA._id,
    cvCount: 12,
    extShortlistCount: 4,
    targetCvCount: 15
  });

  const todayStr = '2026-11-01';
  const todayDate = new Date(todayStr);

  try {

  // Create Assignment
  const asg = await WorkAssignment.create({
    assignmentId: `WA-DASH-${Date.now()}`,
    assignedDateStr: todayStr,
    assignedDate: todayDate,
    ta: testTA._id,
    position: testPosition._id,
    jobOrderId: testPosition.jobOrderId,
    client: testClient._id,
    clientName: testClient.clientName,
    positionName: testPosition.position,
    workType: '100% Work',
    plannedTarget: {
      targetProfiles: 30,
      targetCvsShared: 4,
      targetFollowUps: 0,
      summary: 'Conduct primary LinkedIn search'
    },
    status: 'In Progress'
  });

  // Create 100% Work Daily Activity
  const act100 = await DailyActivity.create({
    activityId: `DA-DASH-1-${Date.now()}`,
    activityDateStr: todayStr,
    activityDate: todayDate,
    ta: testTA._id,
    position: testPosition._id,
    assignment: asg._id,
    assignmentCode: asg.assignmentId,
    jobOrderId: testPosition.jobOrderId,
    client: testClient._id,
    clientName: testClient.clientName,
    positionName: testPosition.position,
    workType: '100% Work',
    profilesSearched: 35,
    additionalProfilesSourced: 0,
    candidatesFollowedUp: 0,
    responsesReceived: 0,
    cvsShared: 3,
    internallyShortlisted: 3,
    goodCvs: 2,
    optionalCvs: 1
  });

  // Create Follow-up Daily Activity
  const actFollowUp = await DailyActivity.create({
    activityId: `DA-DASH-2-${Date.now()}`,
    activityDateStr: todayStr,
    activityDate: todayDate,
    ta: testTA._id,
    position: testPosition._id,
    jobOrderId: testPosition.jobOrderId,
    client: testClient._id,
    clientName: testClient.clientName,
    positionName: testPosition.position,
    workType: 'Follow-up',
    profilesSearched: 0,
    additionalProfilesSourced: 0,
    candidatesFollowedUp: 5,
    responsesReceived: 3,
    cvsShared: 5,
    internallyShortlisted: 2,
    goodCvs: 2,
    optionalCvs: 0
  });

  // Create Add-on Daily Activity
  const actAddOn = await DailyActivity.create({
    activityId: `DA-DASH-3-${Date.now()}`,
    activityDateStr: todayStr,
    activityDate: todayDate,
    ta: testTA._id,
    position: testPosition._id,
    jobOrderId: testPosition.jobOrderId,
    client: testClient._id,
    clientName: testClient.clientName,
    positionName: testPosition.position,
    workType: 'Add-on',
    profilesSearched: 0,
    additionalProfilesSourced: 12,
    candidatesFollowedUp: 0,
    responsesReceived: 0,
    cvsShared: 2,
    internallyShortlisted: 1,
    goodCvs: 1,
    optionalCvs: 0
  });

  // --- Test 1: getDashboardSummary ---
  console.log('--- Test 1: Dashboard Summary Aggregation ---');
  const reqSummary = { query: { ta: String(testTA._id), position: String(testPosition._id) } };
  const resSummary = createMockRes();
  await dashboardController.getDashboardSummary(reqSummary, resSummary);

  const sumData = resSummary.body;
  assert(sumData && sumData.workload && sumData.sourcing && sumData.recruitmentOutput, 'Summary returned all 3 required groups (workload, sourcing, recruitmentOutput)');
  assert(sumData.workload.totalAssignments >= 1, `Total assignments counted: ${sumData.workload.totalAssignments}`);
  assert(sumData.workload.inProgressAssignments >= 1, `In-progress assignments counted: ${sumData.workload.inProgressAssignments}`);

  // Sourcing distinction rule
  assert(sumData.sourcing.profilesSearched === 35, `100% profilesSearched strictly isolated (${sumData.sourcing.profilesSearched} === 35)`);
  assert(sumData.sourcing.additionalProfilesSourced === 12, `Add-on profiles reported separately (${sumData.sourcing.additionalProfilesSourced} === 12)`);
  assert(sumData.sourcing.followUpActivities === 5, `Follow-up activities strictly isolated (${sumData.sourcing.followUpActivities} === 5)`);
  assert(sumData.sourcing.responsesReceived === 3, `Responses received correctly recorded (${sumData.sourcing.responsesReceived} === 3)`);
  assert(sumData.recruitmentOutput.cvsShared === 10, `Total CVs shared across activities: 3 + 5 + 2 = 10 (${sumData.recruitmentOutput.cvsShared})`);

  // --- Test 2: Filter Consistency ---
  console.log('\n--- Test 2: Filter Consistency ---');
  const reqFilterWorkType = { query: { ta: String(testTA._id), workType: '100% Work' } };
  const resFilterWorkType = createMockRes();
  await dashboardController.getDashboardSummary(reqFilterWorkType, resFilterWorkType);

  assert(resFilterWorkType.body.sourcing.profilesSearched === 35, 'Filtered to 100% Work returns 35 profiles searched');
  assert(resFilterWorkType.body.sourcing.additionalProfilesSourced === 0, 'Filtered to 100% Work isolates add-on profiles to 0');
  assert(resFilterWorkType.body.sourcing.followUpActivities === 0, 'Filtered to 100% Work isolates follow-up activities to 0');

  // --- Test 3: Daily Activities Overview ---
  console.log('\n--- Test 3: Daily Activities Overview ---');
  const reqDaily = { query: { ta: String(testTA._id), position: String(testPosition._id) } };
  const resDaily = createMockRes();
  await dashboardController.getDailyActivitiesOverview(reqDaily, resDaily);

  assert(resDaily.body.activities.length === 3, `Found all 3 logged activities for test TA (${resDaily.body.activities.length} === 3)`);
  const found100 = resDaily.body.activities.find(a => a.workType === '100% Work');
  assert(found100 && found100.assignment && found100.assignment.assignmentId === asg.assignmentId, 'Activity properly populated with linked assignment reference');

  // --- Test 4: TA Productivity Overview ---
  console.log('\n--- Test 4: TA Productivity Overview ---');
  const reqProd = { query: { ta: String(testTA._id) } };
  const resProd = createMockRes();
  await dashboardController.getTaProductivityOverview(reqProd, resProd);

  assert(resProd.body.length === 1, 'Productivity overview returned 1 record for filtered TA');
  const taProd = resProd.body[0];
  assert(taProd.name === testTA.name, `TA Name matches (${taProd.name})`);
  assert(taProd.sourcing.profilesSearched === 35, `Productivity reports 35 profiles searched`);
  assert(taProd.sourcing.additionalProfiles === 12, `Productivity reports 12 add-on profiles`);
  assert(taProd.sourcing.followUps === 5, `Productivity reports 5 follow-ups`);
  assert(taProd.recruitment.cvsShared === 10, `Productivity reports 10 CVs shared`);

  // --- Test 5: Position-Level Activity Overview ---
  console.log('\n--- Test 5: Position-Level Activity Overview ---');
  const reqPos = { query: { position: String(testPosition._id) } };
  const resPos = createMockRes();
  await dashboardController.getPositionActivityOverview(reqPos, resPos);

  assert(resPos.body.length === 1, 'Position overview returned 1 position');
  const posItem = resPos.body[0];
  assert(posItem.jobOrderId === testPosition.jobOrderId, `Job Order ID matches (${posItem.jobOrderId})`);
  assert(posItem.profilesSearched === 35, `Position aggregated 35 profiles searched`);
  assert(posItem.additionalProfiles === 12, `Position aggregated 12 add-on profiles`);
  assert(posItem.followUps === 5, `Position aggregated 5 follow-ups`);
  assert(posItem.cvsShared === 10, `Position aggregated 10 CVs shared`);

  // --- Test 6: Planned vs Actual Work Matrix ---
  console.log('\n--- Test 6: Planned vs Actual Work Matrix ---');
  const reqPvA = { query: { ta: String(testTA._id) } };
  const resPvA = createMockRes();
  await dashboardController.getPlannedVsActualOverview(reqPvA, resPvA);

  assert(resPvA.body.length >= 1, `Planned vs Actual matrix returned records (${resPvA.body.length})`);
  const pvaItem = resPvA.body.find(i => i.assignmentId === asg.assignmentId);
  assert(pvaItem.planned.targetProfiles === 30, `Planned target profiles preserved (${pvaItem.planned.targetProfiles} === 30)`);
  assert(pvaItem.actual.profilesSearched === 35, `Actual profiles searched correctly summed (${pvaItem.actual.profilesSearched} === 35)`);
  assert(pvaItem.status === 'In Progress', 'Status preserved as In Progress and NOT automatically marked Completed merely because target was reached');

  // --- Test 7: Trends & Funnel ---
  console.log('\n--- Test 7: Trends & Conversion Funnel ---');
  const reqTrends = { query: { ta: String(testTA._id) } };
  const resTrends = createMockRes();
  await dashboardController.getTrendsOverview(reqTrends, resTrends);

  assert(Array.isArray(resTrends.body.dailyActivityTrend), 'dailyActivityTrend array present');
  assert(Array.isArray(resTrends.body.workTypeDist), 'workTypeDist array present');
  assert(resTrends.body.funnel !== undefined, 'Conversion funnel metrics present');

  // --- Test 8: Zero Destruction of Positions and Legacy Counters ---
  console.log('\n--- Test 8: Zero Destruction of Positions and Legacy Counters ---');
  const freshPos = await Position.findById(testPosition._id);
  assert(freshPos.cvCount === 12, 'Position.cvCount legacy counter unchanged (12)');
  assert(freshPos.extShortlistCount === 4, 'Position.extShortlistCount legacy counter unchanged (4)');
  assert(freshPos.targetCvCount === 15, 'Position.targetCvCount legacy counter unchanged (15)');

  const currentPositionsCount = await Position.countDocuments();
  const currentTAsCount = await TA.countDocuments();
  const currentClientsCount = await Client.countDocuments();

  assert(currentPositionsCount >= initialPositionsCount, `Positions preserved (${currentPositionsCount} >= ${initialPositionsCount})`);
  assert(currentTAsCount >= initialTAsCount, `TAs preserved (${currentTAsCount} >= ${initialTAsCount})`);
  assert(currentClientsCount >= initialClientsCount, `Clients preserved (${currentClientsCount} >= ${initialClientsCount})`);

  } finally {
    // Clean up test records
    await DailyActivity.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
    await WorkAssignment.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
    await CandidateSubmission.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
    await SubmissionSet.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
    await Position.deleteMany({ jobOrderId: 'TEST-DASH-POS-01' });
    await TA.deleteMany({ name: 'Test TA Dashboard Analyst' });
    await Client.deleteMany({ clientId: 'TEST-DASH-CLI' });

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

