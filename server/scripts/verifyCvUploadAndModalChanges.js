const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const Position = require('../models/Position');
const TA = require('../models/TA');
const SubmissionSet = require('../models/SubmissionSet');
const CandidateSubmission = require('../models/CandidateSubmission');
const PositionAttempt = require('../models/PositionAttempt');
const { getFileBufferFromR2, deleteFileFromR2 } = require('../utils/r2Storage');

const API_BASE = 'http://localhost:5000/api';

// Create a valid minimal PDF buffer
function createValidPdfBlob(contentStr = 'CV Sample Content') {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 12 Tf 100 700 Td (${contentStr} - ${Date.now()}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF`;
  return new Blob([Buffer.from(content)], { type: 'application/pdf' });
}

async function runVerification() {
  console.log('--- STARTING VERIFICATION OF SUBMISSION SET & CV UPLOAD FIXES ---');
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('MongoDB connected for script.');

  try {
    // 1. Fetch test Position and active TAs
    const position = await Position.findOne();
    if (!position) throw new Error('No open position found for test');
    console.log(`Using position: ${position.jobOrderId} — ${position.position} (_id: ${position._id})`);

    const tas = await TA.find({ status: 'Active' }).limit(3);
    if (tas.length < 2) throw new Error('Need at least 2 active TAs for multi-sourcing test');
    const ta1 = tas[0];
    const ta2 = tas[1];
    console.log(`Selected TAs: TA1=${ta1.name} (${ta1._id}), TA2=${ta2.name} (${ta2._id})`);

    // TEST 1: Single CV upload, NO uploadedBy, Multi Sourcing TAs, Quality Rating Good, Auto-Attempt
    console.log('\n--- TEST 1: Single CV Upload without uploadedBy + Multi Sourcing TAs ---');
    const form1 = new FormData();
    form1.append('positionId', position._id.toString());
    form1.append('sentToClientAt', '2026-11-09');
    form1.append('sourcingTAs', JSON.stringify([ta1._id.toString(), ta2._id.toString()]));
    form1.append('qualityRating', 'Good');
    form1.append('notes', 'Automated Test 1 - Multi Sourcing TAs');
    form1.append('files', createValidPdfBlob('Alice Johnson Software Engineer'), `Alice_Johnson_${Date.now()}.pdf`);

    const res1 = await fetch(`${API_BASE}/submission-sets/create-with-upload`, {
      method: 'POST',
      body: form1
    });

    const data1 = await res1.json();
    console.log(`Response status: ${res1.status}`);
    console.log(`Created Set: ${data1.set?.setNumber} (${data1.set?.submissionSetId})`);
    console.log(`Succeeded files: ${data1.summary?.succeeded}, Failed: ${data1.summary?.failed}`);

    if (res1.status !== 201 || data1.summary?.succeeded !== 1) {
      throw new Error(`Test 1 Failed: Expected status 201 and 1 success, got status ${res1.status}`);
    }

    // Verify Set in DB
    const set1InDb = await SubmissionSet.findById(data1.set._id).populate('sourcingTAs');
    if (!set1InDb) throw new Error('Set 1 not found in DB');
    console.log(`Set 1 sourcingTAs count: ${set1InDb.sourcingTAs.length}`);
    if (set1InDb.sourcingTAs.length !== 2) throw new Error('Expected 2 sourcing TAs on set');
    console.log(`Set 1 uploadedBy in DB: ${set1InDb.uploadedBy} (optional/null as expected)`);

    // Verify Candidate in DB
    const cand1 = await CandidateSubmission.findOne({ submissionSet: set1InDb._id });
    if (!cand1) throw new Error('Candidate submission 1 not found in DB');
    console.log(`Candidate 1: ${cand1.unverifiedLabel}, Quality Rating: ${cand1.qualityRating}, Shortlist Status: ${cand1.internalShortlistStatus}`);
    if (cand1.qualityRating !== 'Good') throw new Error(`Expected qualityRating 'Good', got ${cand1.qualityRating}`);
    if (cand1.internalShortlistStatus !== 'Pending') throw new Error(`Expected internalShortlistStatus 'Pending', got ${cand1.internalShortlistStatus}`);
    if (cand1.sourcedBy !== null) throw new Error('Expected candidate sourcedBy to be null when multiple TAs selected for set');

    // Verify R2 object exists and can be retrieved
    const r2Check1 = await getFileBufferFromR2({ key: cand1.r2StorageKey });
    console.log(`R2 buffer check: retrieved ${r2Check1.length} bytes successfully from R2!`);

    // TEST 2: Multiple CVs Upload, 1 Sourcing TA (preserves candidate-level sourcedBy attribution)
    console.log('\n--- TEST 2: Multiple CVs Upload with 1 Sourcing TA + Quality Rating Optional ---');
    const form2 = new FormData();
    form2.append('positionId', position._id.toString());
    form2.append('sentToClientAt', '2026-11-09');
    form2.append('sourcingTAs', JSON.stringify([ta1._id.toString()]));
    form2.append('qualityRating', 'Optional');
    form2.append('notes', 'Automated Test 2 - Single Sourcing TA Attribution');
    form2.append('files', createValidPdfBlob('Bob Smith Backend Developer'), `Bob_Smith_${Date.now()}.pdf`);
    form2.append('files', createValidPdfBlob('Carol White Data Scientist'), `Carol_White_${Date.now()}.pdf`);

    const res2 = await fetch(`${API_BASE}/submission-sets/create-with-upload`, {
      method: 'POST',
      body: form2
    });

    const data2 = await res2.json();
    console.log(`Response status: ${res2.status}`);
    console.log(`Created Set: ${data2.set?.setNumber} (${data2.set?.submissionSetId})`);
    console.log(`Succeeded files: ${data2.summary?.succeeded}, Failed: ${data2.summary?.failed}`);

    if (res2.status !== 201 || data2.summary?.succeeded !== 2) {
      throw new Error(`Test 2 Failed: Expected status 201 and 2 successes, got status ${res2.status}`);
    }

    const cand2List = await CandidateSubmission.find({ submissionSet: data2.set._id });
    if (cand2List.length !== 2) throw new Error(`Expected 2 candidate submissions, got ${cand2List.length}`);
    for (const c of cand2List) {
      if (c.qualityRating !== 'Optional') throw new Error(`Expected qualityRating 'Optional', got ${c.qualityRating}`);
      if (c.internalShortlistStatus !== 'Pending') throw new Error(`Expected internalShortlistStatus 'Pending', got ${c.internalShortlistStatus}`);
      if (!c.sourcedBy || c.sourcedBy.toString() !== ta1._id.toString()) {
        throw new Error(`Expected candidate sourcedBy to be attributed to TA1 (${ta1._id}), got ${c.sourcedBy}`);
      }
    }
    console.log(`Candidate attribution verified: Both candidates attributed to ${ta1.name}`);

    // TEST 3: Duplicate CV Upload Prevention
    console.log('\n--- TEST 3: Duplicate CV Upload Prevention ---');
    const existingBuffer = await getFileBufferFromR2({ key: cand2List[0].r2StorageKey });
    const dupForm = new FormData();
    dupForm.append('positionId', position._id.toString());
    dupForm.append('sentToClientAt', '2026-11-09');
    dupForm.append('files', new Blob([existingBuffer], { type: 'application/pdf' }), 'Duplicate_Bob_Attempt.pdf');

    const res3 = await fetch(`${API_BASE}/submission-sets/create-with-upload`, {
      method: 'POST',
      body: dupForm
    });
    const data3 = await res3.json();

    console.log(`Duplicate upload rejected with status: ${res3.status}`);
    console.log(`Error message: ${data3.error}`);
    console.log(`Failed item error: ${data3.failed?.[0]?.error}`);
    if (res3.status !== 400 || !data3.failed?.[0]?.error.includes('Duplicate file')) {
      throw new Error('Expected duplicate file 400 error message');
    }
    console.log('Duplicate prevention verified successfully!');

    // TEST 4: Non-PDF / Corrupt File Rejection
    console.log('\n--- TEST 4: Invalid File Format / Content Rejection ---');
    const fakeForm = new FormData();
    fakeForm.append('positionId', position._id.toString());
    fakeForm.append('sentToClientAt', '2026-11-09');
    fakeForm.append('files', new Blob([Buffer.from('This is a plain text file pretending to be a pdf')], { type: 'application/pdf' }), 'Fake.pdf');

    const res4 = await fetch(`${API_BASE}/submission-sets/create-with-upload`, {
      method: 'POST',
      body: fakeForm
    });
    const data4 = await res4.json();

    console.log(`Invalid file rejected with status: ${res4.status}`);
    console.log(`Error: ${data4.error}`);
    console.log(`Itemized failure: ${data4.failed?.[0]?.error}`);
    if (res4.status !== 400 || !data4.failed?.[0]?.error.includes('signature')) {
      throw new Error('Expected magic byte signature error');
    }
    console.log('File validation verified successfully!');

    // TEST 5: CV Download URL generation
    console.log('\n--- TEST 5: CV Presigned Download URL Generation ---');
    const res5 = await fetch(`${API_BASE}/cvs/submissions/${cand1._id}/download-url`);
    const data5 = await res5.json();
    console.log(`Download endpoint status: ${res5.status}`);
    console.log(`Download URL generated: ${data5.downloadUrl ? 'YES (presigned R2 URL)' : 'NO'}`);
    if (res5.status !== 200 || !data5.downloadUrl || !data5.downloadUrl.includes('X-Amz-Signature')) {
      throw new Error('Failed to generate valid presigned download URL');
    }

    console.log('\n--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await mongoose.disconnect();
  }
}

runVerification().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
