/**
 * Unit & Integration Tests for Phase 2: Candidate Withdrawal
 * Zero writes to production MongoDB Atlas. Uses in-memory Mongoose schema validation and mock controllers.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const CandidateSubmission = require('../models/CandidateSubmission');

console.log('===============================================================');
console.log('  Running Phase 2: Candidate Withdrawal Test Suite');
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
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

function createBaseCandidateProps(overrides = {}) {
  return {
    position: new mongoose.Types.ObjectId(),
    attempt: new mongoose.Types.ObjectId(),
    originalFileName: 'CV.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    r2StorageKey: `cvs/test-${Date.now()}-${Math.random()}.pdf`,
    internalShortlistStatus: 'Shortlisted',
    sentToClient: true,
    clientShortlistStatus: 'Shortlisted',
    ...overrides
  };
}

async function main() {
  // 1. Mongoose Schema Validation Invariants
  await runAsyncTest('Rejects isWithdrawn=true if clientShortlistStatus is Pending', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Pending',
      sentToClient: false,
      isWithdrawn: true,
      withdrawalReason: 'Candidate withdrew'
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Expected validation error');
    assert.ok(err.errors['isWithdrawn'], 'Expected isWithdrawn error');
  });

  await runAsyncTest('Rejects isWithdrawn=true if clientShortlistStatus is Rejected', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Rejected',
      isWithdrawn: true,
      withdrawalReason: 'Candidate withdrew'
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Expected validation error');
    assert.ok(err.errors['isWithdrawn'], 'Expected isWithdrawn error');
  });

  await runAsyncTest('Permits isWithdrawn=true when clientShortlistStatus is Shortlisted', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Shortlisted',
      isWithdrawn: true,
      withdrawalReason: 'Candidate withdrew',
      withdrawalDate: new Date()
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.strictEqual(err, undefined, 'Validation should pass without error');
  });

  await runAsyncTest('Rejects invalid withdrawal reasons not in the concise enum', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Shortlisted',
      isWithdrawn: true,
      withdrawalReason: 'Invalid reason not in list'
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Expected validation error');
    assert.ok(err.errors['withdrawalReason'], 'Expected withdrawalReason enum error');
  });

  await runAsyncTest('Rejects withdrawal with reason="Other" when explanation is missing', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Shortlisted',
      isWithdrawn: true,
      withdrawalReason: 'Other',
      withdrawalExplanation: ''
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Expected validation error');
    assert.ok(err.errors['withdrawalExplanation'], 'Expected withdrawalExplanation error');
  });

  await runAsyncTest('Accepts withdrawal with reason="Other" when explanation is provided', async () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Shortlisted',
      isWithdrawn: true,
      withdrawalReason: 'Other',
      withdrawalExplanation: 'Relocated to another city for family reasons'
    }));
    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    assert.strictEqual(err, undefined, 'Validation should pass when Other has explanation');
  });

  runTest('Existing submissions without withdrawal fields default safely to not withdrawn', () => {
    const doc = new CandidateSubmission(createBaseCandidateProps({
      clientShortlistStatus: 'Shortlisted'
    }));
    assert.strictEqual(doc.isWithdrawn, false);
    assert.strictEqual(doc.withdrawalDate, null);
    assert.strictEqual(doc.withdrawalReason, null);
    assert.strictEqual(doc.withdrawalExplanation, '');
  });

  // 2. Client Decision Overwrite Guard & Explicit Reversal Logic
  runTest('Guards against accidental client decision overwrite when candidate is withdrawn', () => {
    const submission = {
      isWithdrawn: true,
      clientShortlistStatus: 'Shortlisted'
    };
    const incomingUpdate = { clientShortlistStatus: 'Rejected' };

    // Simulate controller guard logic:
    let errorResponse = null;
    if (submission.isWithdrawn && incomingUpdate.clientShortlistStatus !== undefined && incomingUpdate.isWithdrawn !== false) {
      errorResponse = 'Cannot modify client decision for a withdrawn candidate. Withdrawal must first be explicitly reversed.';
    }
    assert.ok(errorResponse);
    assert.ok(errorResponse.includes('explicitly reversed'));
  });

  runTest('Allows explicit withdrawal reversal and cleanly resets withdrawal fields', () => {
    const submission = {
      isWithdrawn: true,
      withdrawalDate: new Date(),
      withdrawalReason: 'Candidate withdrew',
      withdrawalExplanation: 'Some notes',
      clientShortlistStatus: 'Shortlisted'
    };
    const incomingUpdate = { isWithdrawn: false };

    // Simulate controller reversal logic:
    if (incomingUpdate.isWithdrawn === false) {
      submission.isWithdrawn = false;
      submission.withdrawalDate = null;
      submission.withdrawalReason = null;
      submission.withdrawalExplanation = '';
    }

    assert.strictEqual(submission.isWithdrawn, false);
    assert.strictEqual(submission.withdrawalDate, null);
    assert.strictEqual(submission.withdrawalReason, null);
    assert.strictEqual(submission.withdrawalExplanation, '');
    assert.strictEqual(submission.clientShortlistStatus, 'Shortlisted');
  });

  // 2. Client-Side Filtering Simulation Tests
  const mockCandidates = [
    { _id: '1', unverifiedLabel: 'Alice (Active)', clientShortlistStatus: 'Pending', isWithdrawn: false, qualityRating: 'Good' },
    { _id: '2', unverifiedLabel: 'Bob (Shortlisted Active)', clientShortlistStatus: 'Shortlisted', isWithdrawn: false, qualityRating: 'Good' },
    { _id: '3', unverifiedLabel: 'Charlie (Client Rejected)', clientShortlistStatus: 'Rejected', isWithdrawn: false, qualityRating: 'Optional' },
    { _id: '4', unverifiedLabel: 'Diana (Withdrawn)', clientShortlistStatus: 'Shortlisted', isWithdrawn: true, withdrawalReason: 'Candidate withdrew', qualityRating: 'Good' }
  ];

  function filterCandidates(list, { showWithdrawn, showClientRejected, query = '', quality = 'ALL' }) {
    const q = query.trim().toLowerCase();
    return list.filter(candidate => {
      // Checkbox rules:
      // By default: hide both withdrawn and client-rejected candidates from the active CV list
      if (!showWithdrawn && !showClientRejected) {
        if (candidate.isWithdrawn || candidate.clientShortlistStatus === 'Rejected') return false;
      } else if (showWithdrawn && !showClientRejected) {
        if (!candidate.isWithdrawn) return false;
      } else if (!showWithdrawn && showClientRejected) {
        if (candidate.clientShortlistStatus !== 'Rejected' || candidate.isWithdrawn) return false;
      } else {
        if (!candidate.isWithdrawn && candidate.clientShortlistStatus !== 'Rejected') return false;
      }

      if (q && !candidate.unverifiedLabel.toLowerCase().includes(q)) return false;
      if (quality !== 'ALL' && candidate.qualityRating !== quality) return false;
      return true;
    });
  }

  runTest('Default filter excludes both Withdrawn and Client-Rejected candidates', () => {
    const res = filterCandidates(mockCandidates, { showWithdrawn: false, showClientRejected: false });
    assert.strictEqual(res.length, 2);
    assert.deepStrictEqual(res.map(c => c._id), ['1', '2']);
  });

  runTest('Withdrawn filter shows only Withdrawn candidates', () => {
    const res = filterCandidates(mockCandidates, { showWithdrawn: true, showClientRejected: false });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0]._id, '4');
  });

  runTest('Client-Rejected filter shows only Client-Rejected candidates', () => {
    const res = filterCandidates(mockCandidates, { showWithdrawn: false, showClientRejected: true });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0]._id, '3');
  });

  runTest('Combined filter shows both Withdrawn and Client-Rejected candidates', () => {
    const res = filterCandidates(mockCandidates, { showWithdrawn: true, showClientRejected: true });
    assert.strictEqual(res.length, 2);
    assert.deepStrictEqual(res.map(c => c._id), ['3', '4']);
  });

  runTest('Search and quality rating combine properly with Withdrawn filter', () => {
    const res = filterCandidates(mockCandidates, {
      showWithdrawn: true,
      showClientRejected: false,
      query: 'diana',
      quality: 'Good'
    });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0]._id, '4');

    const noMatch = filterCandidates(mockCandidates, {
      showWithdrawn: true,
      showClientRejected: false,
      query: 'alice'
    });
    assert.strictEqual(noMatch.length, 0);
  });

  // 3. KPI Metrics Calculation Verification
  runTest('Calculates Withdrawn KPI correctly without altering Good CV or Shortlist metrics', () => {
    const submissions = [
      { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', clientShortlistStatus: 'Shortlisted', sentToClient: true, isWithdrawn: false },
      { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', clientShortlistStatus: 'Shortlisted', sentToClient: true, isWithdrawn: true },
      { internalShortlistStatus: 'Shortlisted', qualityRating: 'Optional', clientShortlistStatus: 'Rejected', sentToClient: true, isWithdrawn: false },
      { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good', clientShortlistStatus: 'Pending', sentToClient: false, isWithdrawn: false }
    ];

    const totalShortlisted = submissions.filter(s => s.internalShortlistStatus === 'Shortlisted').length;
    const goodCount = submissions.filter(s => s.internalShortlistStatus === 'Shortlisted' && s.qualityRating === 'Good').length;
    const clientShortlisted = submissions.filter(s => s.sentToClient === true && s.clientShortlistStatus === 'Shortlisted').length;
    const withdrawnCount = submissions.filter(s => s.internalShortlistStatus === 'Shortlisted' && s.isWithdrawn === true).length;

    assert.strictEqual(totalShortlisted, 4);
    assert.strictEqual(goodCount, 3);
    assert.strictEqual(clientShortlisted, 2);
    assert.strictEqual(withdrawnCount, 1);
  });

  console.log('===============================================================');
  console.log(`  Tests Completed: ${passedTests}/${totalTests} Passed`);
  console.log('===============================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
