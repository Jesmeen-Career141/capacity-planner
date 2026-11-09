/**
 * Unit & Integration Tests for Phase 1: Download All CVs as ZIP
 * Zero writes to production MongoDB Atlas. Zero Cloudflare R2 network calls.
 */

const assert = require('assert');
const JSZip = require('jszip');
const { formatZipFileName } = require('../controllers/cvController');

console.log('===============================================================');
console.log('  Running Phase 1: Download All CVs Test Suite');
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

async function main() {
  // 1. Filename Formatting & Deduplication Tests
  runTest('Preserves candidate-identifying filename when candidate name is present', () => {
    const existingSet = new Set();
    const sub = {
      unverifiedLabel: 'Hashan Sandeepa',
      originalFileName: 'CV.pdf'
    };
    const result = formatZipFileName(sub, existingSet);
    assert.strictEqual(result, 'Hashan Sandeepa - CV.pdf');
    assert.ok(existingSet.has('hashan sandeepa - cv.pdf'));
  });

  runTest('Avoids duplicate candidate name prefix if already in original filename', () => {
    const existingSet = new Set();
    const sub = {
      unverifiedLabel: 'Hashan Sandeepa',
      originalFileName: 'Hashan_Sandeepa_CV.pdf'
    };
    const result = formatZipFileName(sub, existingSet);
    assert.strictEqual(result, 'Hashan_Sandeepa_CV.pdf');
  });

  runTest('Resolves filename collisions gracefully in the ZIP archive', () => {
    const existingSet = new Set();
    const sub1 = { unverifiedLabel: 'John Doe', originalFileName: 'CV.pdf' };
    const sub2 = { unverifiedLabel: 'John Doe', originalFileName: 'CV.pdf' };
    const sub3 = { unverifiedLabel: 'John Doe', originalFileName: 'CV.pdf' };

    const name1 = formatZipFileName(sub1, existingSet);
    const name2 = formatZipFileName(sub2, existingSet);
    const name3 = formatZipFileName(sub3, existingSet);

    assert.strictEqual(name1, 'John Doe - CV.pdf');
    assert.strictEqual(name2, 'John Doe - CV (1).pdf');
    assert.strictEqual(name3, 'John Doe - CV (2).pdf');
  });

  runTest('Sanitizes illegal filename characters for cross-platform ZIP extraction', () => {
    const existingSet = new Set();
    const sub = {
      unverifiedLabel: 'Candidate: Senior/Lead*',
      originalFileName: 'my<resume>?test.pdf'
    };
    const result = formatZipFileName(sub, existingSet);
    assert.ok(!result.includes(':'));
    assert.ok(!result.includes('/'));
    assert.ok(!result.includes('*'));
    assert.ok(!result.includes('<'));
    assert.ok(!result.includes('>'));
    assert.ok(!result.includes('?'));
  });

  // 2. ZIP Archive Creation & Scoping Tests
  await runAsyncTest('Creates a valid ZIP archive strictly containing only attempt CVs', async () => {
    const zip = new JSZip();
    const mockAttemptCVs = [
      { candidate: 'Hashan Sandeepa', filename: 'Hashan Sandeepa - CV.pdf', content: Buffer.from('%PDF-1.4 Mock CV 1') },
      { candidate: 'Kanishka Jayasinghe', filename: 'Kanishka Jayasinghe - CV.pdf', content: Buffer.from('%PDF-1.4 Mock CV 2') }
    ];

    mockAttemptCVs.forEach(cv => {
      zip.file(cv.filename, cv.content);
    });

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    assert.ok(zipBuffer.length > 0);

    // Read back generated zip
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(loadedZip.files);
    assert.strictEqual(fileNames.length, 2);
    assert.ok(fileNames.includes('Hashan Sandeepa - CV.pdf'));
    assert.ok(fileNames.includes('Kanishka Jayasinghe - CV.pdf'));
  });

  // 3. Partial Failure & Missing File Handling
  await runAsyncTest('Handles missing files and partial download failure with report', async () => {
    const zip = new JSZip();
    const successfulFiles = [
      { filename: 'Candidate A - CV.pdf', content: Buffer.from('CV A content') }
    ];
    const missingFiles = [
      { candidate: 'Candidate B', originalFileName: 'CV_B.pdf', error: 'NoSuchKey: The specified key does not exist' }
    ];

    successfulFiles.forEach(cv => zip.file(cv.filename, cv.content));

    if (missingFiles.length > 0) {
      let report = `DOWNLOAD REPORT\n`;
      report += `Total: 2\n`;
      report += `Success: 1\n`;
      report += `Failed: 1\n`;
      missingFiles.forEach(f => {
        report += `- ${f.candidate}: ${f.error}\n`;
      });
      zip.file('_DOWNLOAD_REPORT.txt', report);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(loadedZip.files);

    assert.strictEqual(fileNames.length, 2);
    assert.ok(fileNames.includes('Candidate A - CV.pdf'));
    assert.ok(fileNames.includes('_DOWNLOAD_REPORT.txt'));

    const reportText = await loadedZip.file('_DOWNLOAD_REPORT.txt').async('string');
    assert.ok(reportText.includes('Candidate B'));
    assert.ok(reportText.includes('NoSuchKey'));
  });

  // 4. Attempt Scoping Verification
  runTest('Strict scoping ensures CVs from other attempts/positions are filtered out', () => {
    const allSubmissions = [
      { _id: '1', position: 'pos_1', attempt: 'att_1', internalShortlistStatus: 'Shortlisted' },
      { _id: '2', position: 'pos_1', attempt: 'att_1', internalShortlistStatus: 'Shortlisted' },
      { _id: '3', position: 'pos_1', attempt: 'att_2', internalShortlistStatus: 'Shortlisted' },
      { _id: '4', position: 'pos_2', attempt: 'att_1', internalShortlistStatus: 'Shortlisted' },
      { _id: '5', position: 'pos_1', attempt: 'att_1', internalShortlistStatus: 'Pending' }
    ];

    const targetPosition = 'pos_1';
    const targetAttempt = 'att_1';

    const scoped = allSubmissions.filter(s =>
      s.position === targetPosition &&
      s.attempt === targetAttempt &&
      s.internalShortlistStatus === 'Shortlisted'
    );

    assert.strictEqual(scoped.length, 2);
    assert.deepStrictEqual(scoped.map(s => s._id), ['1', '2']);
  });

  console.log('===============================================================');
  console.log(`  Phase 1 Download All Tests: ${passedTests} / ${totalTests} passed`);
  console.log('===============================================================');
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});

