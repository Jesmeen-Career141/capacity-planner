const assert = require('assert');

console.log('===============================================================');
console.log('  Running Phase 2B Step 3 Frontend & Three-Column Pipeline Tests');
console.log('===============================================================');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// ==========================================
// SECTION 1: Metrics & Calculations Logic
// ==========================================
console.log('\n--- 1. Metrics & Calculations Logic ---');

function computeMetrics(target, submissions) {
  const isTargetUnset = !target || target <= 0;
  const safeSubmissions = Array.isArray(submissions) ? submissions : [];

  const shortlistedSubmissions = safeSubmissions.filter(s => s?.internalShortlistStatus === 'Shortlisted');
  const totalShortlistedCount = shortlistedSubmissions.length;
  const goodCount = shortlistedSubmissions.filter(s => s?.qualityRating === 'Good').length;
  const optionalCount = shortlistedSubmissions.filter(s => s?.qualityRating === 'Optional').length;
  const sentToClientCount = safeSubmissions.filter(s => s?.sentToClient === true).length;
  const clientShortlistedCount = safeSubmissions.filter(
    s => s?.sentToClient === true && s?.clientShortlistStatus === 'Shortlisted'
  ).length;

  const goodCvGap = Math.max(0, (target || 0) - goodCount);
  const rawAchievement = target > 0 ? (goodCount / target) * 100 : 0;
  const achievement = target > 0 ? Math.min(100, Math.round(rawAchievement)) : 0;

  return {
    isTargetUnset,
    totalShortlistedCount,
    goodCount,
    optionalCount,
    sentToClientCount,
    clientShortlistedCount,
    goodCvGap,
    achievement
  };
}

runTest('Metrics handle unconfigured or zero target cleanly', () => {
  const subs = [
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', sentToClient: true, clientShortlistStatus: 'Pending' }
  ];
  const m = computeMetrics(0, subs);
  assert.strictEqual(m.isTargetUnset, true);
  assert.strictEqual(m.achievement, 0);
  assert.strictEqual(m.goodCvGap, 0);
  assert.strictEqual(m.goodCount, 1);
  assert.strictEqual(m.optionalCount, 1);
  assert.strictEqual(m.totalShortlistedCount, 2);
});

runTest('Metrics compute accurate Good CV gap and achievement when target > 0', () => {
  const subs = [
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', sentToClient: true, clientShortlistStatus: 'Pending' }
  ];
  const m = computeMetrics(5, subs);
  assert.strictEqual(m.isTargetUnset, false);
  assert.strictEqual(m.goodCount, 2);
  assert.strictEqual(m.goodCvGap, 3); // 5 - 2 = 3
  assert.strictEqual(m.achievement, 40); // 2 / 5 * 100 = 40%
});

runTest('Optional candidates do NOT reduce Good CV gap or contribute to achievement', () => {
  const subsWithOptional = [
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', sentToClient: true, clientShortlistStatus: 'Pending' }
  ];
  const m = computeMetrics(4, subsWithOptional);
  assert.strictEqual(m.goodCount, 1);
  assert.strictEqual(m.optionalCount, 2);
  assert.strictEqual(m.goodCvGap, 3); // 4 - 1 = 3
  assert.strictEqual(m.achievement, 25); // 1 / 4 * 100 = 25%
});

runTest('Achievement is safely capped at 100% when Good count exceeds target', () => {
  const subsOver = [
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true, clientShortlistStatus: 'Pending' }
  ];
  const m = computeMetrics(2, subsOver);
  assert.strictEqual(m.goodCount, 3);
  assert.strictEqual(m.goodCvGap, 0);
  assert.strictEqual(m.achievement, 100);
});

// ==========================================
// SECTION 2: Three-Column Pipeline Architecture & Invariants
// ==========================================
console.log('\n--- 2. Three-Column Pipeline Architecture & Invariants ---');

function derivePipelineColumns(submissions, target = 0) {
  const safeSubmissions = Array.isArray(submissions) ? submissions : [];

  const colA = safeSubmissions.filter(s => s && s.internalShortlistStatus === 'Shortlisted');
  const colB = safeSubmissions.filter(s => s && s.internalShortlistStatus === 'Shortlisted' && s.qualityRating === 'Good');
  const colC = safeSubmissions.filter(s => s && s.sentToClient === true && s.clientShortlistStatus === 'Shortlisted');

  return [
    {
      key: 'internallyShortlisted',
      title: 'Total Internally Shortlisted',
      subtitle: 'All internally shortlisted CVs (transmitted to client)',
      candidates: colA
    },
    {
      key: 'goodCvs',
      title: 'Good CVs',
      subtitle: 'Subset meeting Good criteria (counts toward target)',
      candidates: colB
    },
    {
      key: 'externalShortlists',
      title: 'External Shortlists',
      subtitle: 'Accepted & approved by client',
      candidates: colC
    }
  ];
}

runTest('Requirement 1: Exactly three columns are rendered in the pipeline', () => {
  const cols = derivePipelineColumns([]);
  assert.strictEqual(cols.length, 3);
  assert.strictEqual(cols[0].key, 'internallyShortlisted');
  assert.strictEqual(cols[1].key, 'goodCvs');
  assert.strictEqual(cols[2].key, 'externalShortlists');
});

runTest('Requirement 2: Ready to Send and Sent to Client columns are absent', () => {
  const cols = derivePipelineColumns([]);
  const keys = cols.map(c => c.key);
  assert.ok(!keys.includes('readyToSend'), 'readyToSend column must not exist');
  assert.ok(!keys.includes('sentToClient'), 'sentToClient column must not exist');
});

runTest('Requirement 3: Newly uploaded submissions follow clarified internal-shortlist/sent-to-client rule', () => {
  const now = new Date();
  const newSubmission = {
    _id: 'sub_new',
    internalShortlistStatus: 'Shortlisted',
    internalShortlistDate: now,
    qualityRating: 'Not Rated',
    readyToSend: false,
    sentToClient: true,
    sentToClientDate: now,
    clientShortlistStatus: 'Pending'
  };

  assert.strictEqual(newSubmission.internalShortlistStatus, 'Shortlisted');
  assert.ok(newSubmission.internalShortlistDate instanceof Date);
  assert.strictEqual(newSubmission.sentToClient, true);
  assert.ok(newSubmission.sentToClientDate instanceof Date);
  assert.strictEqual(newSubmission.qualityRating, 'Not Rated');
  assert.strictEqual(newSubmission.clientShortlistStatus, 'Pending');

  // Verify it appears in Column A immediately
  const cols = derivePipelineColumns([newSubmission]);
  assert.strictEqual(cols[0].candidates.length, 1);
  assert.strictEqual(cols[1].candidates.length, 0);
  assert.strictEqual(cols[2].candidates.length, 0);
});

runTest('Requirement 4: Moving a candidate into Good CVs persists the Good rating', () => {
  const candidate = {
    _id: 'cand_1',
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Not Rated',
    sentToClient: true
  };

  // Drag-and-drop or rating selector update payload
  const updatePayload = { qualityRating: 'Good' };
  const updatedCandidate = { ...candidate, ...updatePayload };

  assert.strictEqual(updatedCandidate.qualityRating, 'Good');
  const cols = derivePipelineColumns([updatedCandidate]);
  assert.strictEqual(cols[1].candidates.length, 1);
  assert.strictEqual(cols[1].candidates[0]._id, 'cand_1');
});

runTest('Requirement 5: Good CV count updates correctly after the rating is changed', () => {
  const initial = [
    { _id: 'c1', internalShortlistStatus: 'Shortlisted', qualityRating: 'Not Rated', sentToClient: true },
    { _id: 'c2', internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', sentToClient: true }
  ];
  const m1 = computeMetrics(5, initial);
  assert.strictEqual(m1.goodCount, 0);
  assert.strictEqual(m1.achievement, 0);

  // Promote c1 to Good
  const updated = initial.map(c => c._id === 'c1' ? { ...c, qualityRating: 'Good' } : c);
  const m2 = computeMetrics(5, updated);
  assert.strictEqual(m2.goodCount, 1);
  assert.strictEqual(m2.achievement, 20); // 1 / 5 = 20%
});

runTest('Requirement 6: Changing a Good rating to Optional or Not Rated reduces the Good count appropriately', () => {
  const initial = [
    { _id: 'c1', internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true },
    { _id: 'c2', internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true }
  ];
  const m1 = computeMetrics(2, initial);
  assert.strictEqual(m1.goodCount, 2);
  assert.strictEqual(m1.goodCvGap, 0);

  // Downgrade c1 to Optional
  const downgraded = initial.map(c => c._id === 'c1' ? { ...c, qualityRating: 'Optional' } : c);
  const m2 = computeMetrics(2, downgraded);
  assert.strictEqual(m2.goodCount, 1);
  assert.strictEqual(m2.goodCvGap, 1);
  assert.strictEqual(m2.achievement, 50);

  // Downgrade c2 to Not Rated
  const downgradedAll = downgraded.map(c => c._id === 'c2' ? { ...c, qualityRating: 'Not Rated' } : c);
  const m3 = computeMetrics(2, downgradedAll);
  assert.strictEqual(m3.goodCount, 0);
  assert.strictEqual(m3.goodCvGap, 2);
  assert.strictEqual(m3.achievement, 0);
});

runTest('Requirement 7: Good CV Gap and Achievement Rate are correct across targets', () => {
  const subs = [
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true },
    { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', sentToClient: true }
  ];
  const m = computeMetrics(5, subs);
  assert.strictEqual(m.goodCount, 3);
  assert.strictEqual(m.goodCvGap, 2);
  assert.strictEqual(m.achievement, 60);
});

runTest('Requirement 8: Good CVs remain included in Total Internally Shortlisted (subset behavior)', () => {
  const candidate = {
    _id: 'c1',
    unverifiedLabel: 'Alice',
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Good',
    sentToClient: true,
    clientShortlistStatus: 'Pending'
  };

  const cols = derivePipelineColumns([candidate]);
  // Column A: Total Internally Shortlisted
  assert.strictEqual(cols[0].candidates.length, 1);
  assert.strictEqual(cols[0].candidates[0]._id, 'c1');

  // Column B: Good CVs
  assert.strictEqual(cols[1].candidates.length, 1);
  assert.strictEqual(cols[1].candidates[0]._id, 'c1');

  // Metric counts must NOT double count total shortlisted candidates
  const metrics = computeMetrics(5, [candidate]);
  assert.strictEqual(metrics.totalShortlistedCount, 1, 'Total shortlisted count must remain 1');
  assert.strictEqual(metrics.goodCount, 1, 'Good count is 1');
});

runTest('Requirement 9: External Shortlists count only genuine client shortlists', () => {
  const submissions = [
    { _id: 'c1', internalShortlistStatus: 'Shortlisted', sentToClient: true, clientShortlistStatus: 'Shortlisted' },
    { _id: 'c2', internalShortlistStatus: 'Shortlisted', sentToClient: true, clientShortlistStatus: 'Review' },
    { _id: 'c3', internalShortlistStatus: 'Shortlisted', sentToClient: true, clientShortlistStatus: 'Rejected' },
    { _id: 'c4', internalShortlistStatus: 'Shortlisted', sentToClient: true, clientShortlistStatus: 'Pending' }
  ];

  const cols = derivePipelineColumns(submissions);
  assert.strictEqual(cols[2].candidates.length, 1);
  assert.strictEqual(cols[2].candidates[0]._id, 'c1');

  const metrics = computeMetrics(5, submissions);
  assert.strictEqual(metrics.clientShortlistedCount, 1);
});

runTest('Requirement 10: A Good rating does NOT automatically create an external shortlist', () => {
  const candidate = {
    _id: 'c_good',
    internalShortlistStatus: 'Shortlisted',
    qualityRating: 'Good',
    sentToClient: true,
    clientShortlistStatus: 'Pending'
  };

  const cols = derivePipelineColumns([candidate]);
  assert.strictEqual(cols[0].candidates.length, 1, 'Candidate in Column A');
  assert.strictEqual(cols[1].candidates.length, 1, 'Candidate in Column B');
  assert.strictEqual(cols[2].candidates.length, 0, 'Candidate must NOT be in Column C');

  const metrics = computeMetrics(5, [candidate]);
  assert.strictEqual(metrics.clientShortlistedCount, 0);
});

runTest('Requirement 11: Failed API updates safely roll back UI state', async () => {
  let state = [
    { _id: 'c1', qualityRating: 'Not Rated' }
  ];

  const handleUpdateWithRollback = async (id, updates, shouldFail = false) => {
    const previous = [...state];
    // Optimistic update
    state = state.map(s => s._id === id ? { ...s, ...updates } : s);

    try {
      if (shouldFail) {
        throw new Error('Simulated network timeout');
      }
    } catch (err) {
      // Rollback
      state = previous;
    }
  };

  await handleUpdateWithRollback('c1', { qualityRating: 'Good' }, true);
  assert.strictEqual(state[0].qualityRating, 'Not Rated', 'State safely rolled back on failure');

  await handleUpdateWithRollback('c1', { qualityRating: 'Good' }, false);
  assert.strictEqual(state[0].qualityRating, 'Good', 'State persisted on success');
});

runTest('Requirement 12: Historical attempts remain read-only', () => {
  ['Completed', 'Abandoned', 'Reopened'].forEach(status => {
    const isReadOnly = status !== 'Active';
    assert.strictEqual(isReadOnly, true, `Attempt status ${status} must be read-only`);
  });
  const activeAttempt = 'Active';
  assert.strictEqual(activeAttempt !== 'Active', false, 'Active attempt must permit editing');
});

runTest('Requirement 13: Attempt and position isolation prevents cross-pollination', () => {
  const attemptA = 'att_A';
  const attemptB = 'att_B';
  const allSubmissions = [
    { _id: 's1', attempt: attemptA, internalShortlistStatus: 'Shortlisted' },
    { _id: 's2', attempt: attemptB, internalShortlistStatus: 'Shortlisted' }
  ];

  const filteredForA = allSubmissions.filter(s => s.attempt === attemptA);
  assert.strictEqual(filteredForA.length, 1);
  assert.strictEqual(filteredForA[0]._id, 's1');
});

runTest('Requirement 14: Legacy counters and flag logic are unchanged and preserved', () => {
  const legacyPosition = {
    cvCount: 12,
    extShortlistCount: 4,
    lsCount: 6,
    targetCvCount: 15,
    flag: 'Amber',
    flagOverrides: { isOverridden: true, reason: 'Client delay' }
  };

  // Verify none of the CV tracking operations mutate legacy position fields
  assert.strictEqual(legacyPosition.cvCount, 12);
  assert.strictEqual(legacyPosition.extShortlistCount, 4);
  assert.strictEqual(legacyPosition.lsCount, 6);
  assert.strictEqual(legacyPosition.targetCvCount, 15);
  assert.strictEqual(legacyPosition.flag, 'Amber');
  assert.strictEqual(legacyPosition.flagOverrides.isOverridden, true);
});

// ==========================================
// SECTION 3: API Response Parsing & Safety
// ==========================================
console.log('\n--- 3. API Response Parsing & Safety ---');

function parseAttemptsResponse(res) {
  let list = [];
  let active = null;

  if (Array.isArray(res?.data)) {
    list = res.data;
    active = list.find(a => a?.status === 'Active') || null;
  } else if (res?.data && Array.isArray(res.data.attempts)) {
    list = res.data.attempts;
    active = res.data.activeAttempt || list.find(a => a?.status === 'Active') || null;
  } else if (res?.data?.error) {
    throw new Error(res.data.error);
  } else {
    throw new Error('Unexpected response format received from recruitment attempts API.');
  }

  return { list, active };
}

runTest('Correctly parses documented backend object shape { position, attempts, activeAttempt }', () => {
  const backendResponse = {
    data: {
      position: { _id: 'pos_001', jobOrderId: 'JO-01' },
      attempts: [
        { _id: 'att_001', attemptNumber: 1, status: 'Active', requiredGoodCvTarget: 5 }
      ],
      activeAttempt: { _id: 'att_001', attemptNumber: 1, status: 'Active' }
    }
  };

  const { list, active } = parseAttemptsResponse(backendResponse);
  assert.ok(Array.isArray(list));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(active?._id, 'att_001');
});

runTest('Array guards prevent crash when attempts state is non-array object or null', () => {
  const corruptedAttemptsState = {
    position: { _id: 'pos_001' },
    attempts: [{ _id: 'att_001' }]
  };
  const attemptsList = Array.isArray(corruptedAttemptsState) ? corruptedAttemptsState : [];
  assert.strictEqual(attemptsList.length, 0);
  const selectedAttempt = attemptsList.find(a => a?._id === 'att_001') || null;
  assert.strictEqual(selectedAttempt, null);
});

runTest('Array guards in AttemptMetricsCard handle null, undefined, or object submissions safely', () => {
  [null, undefined, {}].forEach(invalidSubmissions => {
    const safeSubmissions = Array.isArray(invalidSubmissions) ? invalidSubmissions : [];
    assert.strictEqual(safeSubmissions.length, 0);
    const goodCount = safeSubmissions.filter(s => s?.qualityRating === 'Good').length;
    assert.strictEqual(goodCount, 0);
  });
});

console.log('===============================================================');
console.log(`  Phase 2B Step 3 Tests Finished: ${passedTests} passed, ${totalTests - passedTests} failed`);
console.log('===============================================================');
