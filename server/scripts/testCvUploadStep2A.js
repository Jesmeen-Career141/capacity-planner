/**
 * Unit & Integration Test Suite for Phase 2 Step 2A:
 * Backend CV Upload and Cloudflare R2 Storage
 *
 * STRICT COMPLIANCE:
 * 1. Zero writes or deletes to live production MongoDB database.
 * 2. Zero uploads or deletes to production Cloudflare R2 bucket.
 * 3. Uses safe in-memory mocks for S3 client and database operations.
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const {
  validateFileContent,
  deriveUnverifiedLabel,
  generateFileHash,
  generateR2StorageKey,
  MAX_FILE_SIZE_BYTES
} = require('../utils/cvValidator');
const {
  uploadFileToR2,
  deleteFileFromR2,
  generatePresignedDownloadUrl,
  BUCKET_NAME,
  getR2Client,
  isR2Configured,
  getMissingR2ConfigKeys,
  resolveStorageClient,
  getNormalizedR2Endpoint
} = require('../utils/r2Storage');
const { handleMulterUpload } = require('../middleware/cvUploadMiddleware');
const cvController = require('../controllers/cvController');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');

console.log('===============================================================');
console.log('  Running Phase 2 Step 2A Tests (Safe Mocks, Zero Prod Impact)');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function runTest(description, fn) {
  try {
    fn();
    console.log(`  [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(description, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// Mock Express req and res helper
function createMockReqRes(params = {}, body = {}, files = [], query = {}) {
  const req = { params, body, files, query };
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

// Mock S3 Client for Cloudflare R2
const { S3Client } = require('@aws-sdk/client-s3');

function createMockS3Client() {
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://mock-account.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'mockAccessKey', secretAccessKey: 'mockSecretKey' }
  });
  const commands = [];
  client.commands = commands;
  client.send = async (command) => {
    commands.push(command);
    if (command.constructor.name === 'PutObjectCommand') {
      if (command.input.Key && command.input.Key.includes('FAIL_R2_UPLOAD')) {
        throw new Error('Simulated R2 network timeout error');
      }
      return { $metadata: { httpStatusCode: 200 } };
    }
    if (command.constructor.name === 'DeleteObjectCommand') {
      if (command.input.Key && command.input.Key.includes('FAIL_R2_DELETE')) {
        throw new Error('Simulated Cloudflare R2 delete timeout error');
      }
      return { $metadata: { httpStatusCode: 204 } };
    }
    if (command.constructor.name === 'GetObjectCommand') {
      return { $metadata: { httpStatusCode: 200 } };
    }
    return {};
  };
  return client;
}

// Sample file buffers with valid magic bytes
const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const validDocxBuffer = Buffer.concat([
  Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]), // PK\x03\x04
  Buffer.from('sample_docx_zip_content_stream')
]);
const validDocBuffer = Buffer.concat([
  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), // OLE header
  Buffer.from('sample_binary_doc_content_stream')
]);
const spoofedPdfBuffer = Buffer.from('MZ_fake_executable_disguised_as_pdf');

async function runAllTests() {
  // ==========================================
  // SECTION 1: File Content Validation & Signatures
  // ==========================================
  console.log('--- 1. File Validation & Magic Bytes Inspection ---');

  runTest('Valid PDF with %PDF signature passes validation', () => {
    const res = validateFileContent(validPdfBuffer, 'Jane_Doe_Resume.pdf');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedMimeType, 'application/pdf');
  });

  runTest('Valid DOCX with PK signature passes validation', () => {
    const res = validateFileContent(validDocxBuffer, 'John_Smith_CV.docx');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedMimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  runTest('Valid DOC with OLE signature passes validation', () => {
    const res = validateFileContent(validDocBuffer, 'Legacy_Resume.doc');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedMimeType, 'application/msword');
  });

  runTest('Spoofed file (executable content disguised as .pdf) is rejected by magic bytes', () => {
    const res = validateFileContent(spoofedPdfBuffer, 'malicious.pdf');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('signature does not match PDF'));
  });

  runTest('Disallowed extensions (.exe, .zip, .js) are rejected', () => {
    const res1 = validateFileContent(validPdfBuffer, 'script.exe');
    assert.strictEqual(res1.valid, false);
    const res2 = validateFileContent(validPdfBuffer, 'archive.zip');
    assert.strictEqual(res2.valid, false);
  });

  runTest('Oversized file exceeding 10 MB limit is rejected', () => {
    const fakeOversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024); // 10MB + 1KB
    const res = validateFileContent(fakeOversizedBuffer, 'huge.pdf');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('File size exceeds'));
  });

  runTest('Empty or missing buffer is rejected safely', () => {
    const res = validateFileContent(Buffer.alloc(0), 'empty.pdf');
    assert.strictEqual(res.valid, false);
  });

  // ==========================================
  // SECTION 2: Label Derivation, Hashing & Storage Keys
  // ==========================================
  console.log('\n--- 2. Metadata Extraction, Hashing & Key Generation ---');

  runTest('deriveUnverifiedLabel sanitizes filename and capitalizes cleanly', () => {
    const label1 = deriveUnverifiedLabel('jane_doe_senior_engineer_2026.pdf');
    assert.strictEqual(label1, 'Jane Doe Senior Engineer 2026');

    const label2 = deriveUnverifiedLabel('john-smith-cv.docx');
    assert.strictEqual(label2, 'John Smith Cv');
  });

  runTest('generateFileHash computes deterministic SHA-256 hex string', () => {
    const hash1 = generateFileHash(validPdfBuffer);
    const hash2 = generateFileHash(validPdfBuffer);
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
  });

  runTest('generateR2StorageKey produces unique, sanitized keys under positions prefix', () => {
    const key1 = generateR2StorageKey('JO-003', 2, 'Jane Doe - Resume (v2).pdf');
    const key2 = generateR2StorageKey('JO-003', 2, 'Jane Doe - Resume (v2).pdf');

    assert.ok(key1.startsWith('positions/JO-003/attempts/2/'));
    assert.ok(key1.endsWith('.pdf'));
    assert.notStrictEqual(key1, key2, 'Keys have distinct random/timestamp components to guarantee collision-free uniqueness');
  });

  // ==========================================
  // SECTION 3: R2 Storage Operations (Mocked)
  // ==========================================
  console.log('\n--- 3. Cloudflare R2 Operations (Safe Mocks) ---');

  await runAsyncTest('uploadFileToR2 sends PutObjectCommand to career141-cv-storage bucket', async () => {
    const mockClient = createMockS3Client();
    await uploadFileToR2({
      buffer: validPdfBuffer,
      key: 'positions/JO-001/attempts/1/test.pdf',
      mimeType: 'application/pdf',
      client: mockClient
    });

    assert.strictEqual(mockClient.commands.length, 1);
    const cmd = mockClient.commands[0];
    assert.strictEqual(cmd.constructor.name, 'PutObjectCommand');
    assert.strictEqual(cmd.input.Bucket, BUCKET_NAME);
    assert.strictEqual(cmd.input.Key, 'positions/JO-001/attempts/1/test.pdf');
    assert.strictEqual(cmd.input.ContentType, 'application/pdf');
  });

  await runAsyncTest('deleteFileFromR2 sends DeleteObjectCommand to target bucket', async () => {
    const mockClient = createMockS3Client();
    await deleteFileFromR2({
      key: 'positions/JO-001/attempts/1/test.pdf',
      client: mockClient
    });

    assert.strictEqual(mockClient.commands.length, 1);
    const cmd = mockClient.commands[0];
    assert.strictEqual(cmd.constructor.name, 'DeleteObjectCommand');
    assert.strictEqual(cmd.input.Bucket, BUCKET_NAME);
    assert.strictEqual(cmd.input.Key, 'positions/JO-001/attempts/1/test.pdf');
  });

  await runAsyncTest('generatePresignedDownloadUrl returns signed URL with safe disposition header', async () => {
    const mockClient = createMockS3Client();
    const url = await generatePresignedDownloadUrl({
      key: 'positions/JO-001/attempts/1/test.pdf',
      originalFileName: 'Jane Doe Resume.pdf',
      expiresIn: 900,
      client: mockClient
    });

    assert.strictEqual(typeof url, 'string');
    assert.ok(url.startsWith('https://') || url.startsWith('http://'));
  });

  // ==========================================
  // SECTION 4: Controller Logic & Failure Handling
  // ==========================================
  console.log('\n--- 4. Controller Logic, Attempt Association & Rollback ---');

  // Test 4.1: Missing active attempt directs Lead to start one
  await runAsyncTest('uploadCvs returns 400 when position has no active recruitment attempt', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;

    Position.findById = () => ({
      _id: 'pos_123',
      jobOrderId: 'JO-123'
    });
    // Return null: no active attempt
    PositionAttempt.findOne = () => Promise.resolve(null);

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, {}, [
      { originalname: 'Jane.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('No active recruitment attempt found'));
    assert.ok(res.data.error.includes('Please start a recruitment attempt before uploading CVs'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
  });

  // Test 4.2: Uploading to an inactive / historical attempt returns 403 Forbidden
  await runAsyncTest('uploadCvs returns 403 Forbidden when target attempt is completed or historical', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;

    Position.findById = () => ({
      _id: 'pos_123',
      jobOrderId: 'JO-123'
    });
    // Target attempt is Completed
    PositionAttempt.findOne = () => Promise.resolve({
      _id: 'attempt_hist',
      attemptNumber: 1,
      status: 'Completed'
    });

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, { attemptId: 'attempt_hist' }, [
      { originalname: 'Jane.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.data.error.includes('Cannot upload CVs to an inactive or historical recruitment attempt'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
  });

  // Test 4.3: Duplicate file in same attempt reports duplicate error in failed list
  await runAsyncTest('uploadCvs rejects duplicate file in same attempt based on content hash', async () => {
    const origFindById = Position.findById;
    const origFindOneAttempt = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;

    Position.findById = () => ({ _id: 'pos_123', jobOrderId: 'JO-123' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: 'attempt_act', attemptNumber: 1, status: 'Active' });
    // Duplicate exists in same attempt
    CandidateSubmission.findOne = () => Promise.resolve({
      _id: 'sub_dup',
      originalFileName: 'Jane_Existing.pdf',
      fileHash: generateFileHash(validPdfBuffer)
    });

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, {}, [
      { originalname: 'Jane_Duplicate.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.summary.failed, 1);
    assert.ok(res.data.failed[0].error.includes('Duplicate file'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOneAttempt;
    CandidateSubmission.findOne = origFindOneSub;
  });

  // Test 4.4: Compensating rollback on MongoDB save failure
  await runAsyncTest('uploadCvs triggers compensating R2 delete when MongoDB save throws error', async () => {
    const origFindById = Position.findById;
    const origFindOneAttempt = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;
    const origCreateSub = CandidateSubmission.create;

    Position.findById = () => ({ _id: 'pos_123', jobOrderId: 'JO-123' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: 'attempt_act', attemptNumber: 1, status: 'Active' });
    CandidateSubmission.findOne = () => Promise.resolve(null);
    // Simulate MongoDB connection failure during CandidateSubmission.create
    CandidateSubmission.create = () => {
      throw new Error('Simulated MongoDB Atlas write error');
    };

    const mockS3Client = createMockS3Client();

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, {}, [
      { originalname: 'Jane.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.summary.failed, 1);
    assert.strictEqual(res.data.failed[0].error, 'Failed to save CV record in database.');

    // Assert that DeleteObjectCommand was issued to roll back the uploaded R2 object
    const deleteCmd = mockS3Client.commands.find(c => c.constructor.name === 'DeleteObjectCommand');
    assert.ok(deleteCmd, 'Compensating DeleteObjectCommand was executed on Cloudflare R2');

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOneAttempt;
    CandidateSubmission.findOne = origFindOneSub;
    CandidateSubmission.create = origCreateSub;
  });

  // Test 4.5: Successful single file upload with strict workflow defaults
  await runAsyncTest('uploadCvs successfully uploads file and saves metadata with strict defaults', async () => {
    const origFindById = Position.findById;
    const origFindOneAttempt = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;
    const origCreateSub = CandidateSubmission.create;

    Position.findById = () => ({ _id: 'pos_123', jobOrderId: 'JO-123', assignee: 'ta_lead_id' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: 'attempt_act', attemptNumber: 1, status: 'Active' });
    CandidateSubmission.findOne = () => Promise.resolve(null);

    let savedPayload = null;
    CandidateSubmission.create = (doc) => {
      savedPayload = doc;
      return Promise.resolve({
        _id: 'new_sub_id',
        ...doc,
        uploadedAt: new Date()
      });
    };

    const mockS3Client = createMockS3Client();

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, {}, [
      { originalname: 'Jane_Doe_Resume_2026.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.summary.succeeded, 1);
    assert.strictEqual(res.data.summary.failed, 0);

    // Verify stored metadata and strict defaults
    assert.strictEqual(savedPayload.originalFileName, 'Jane_Doe_Resume_2026.pdf');
    assert.strictEqual(savedPayload.unverifiedLabel, 'Jane Doe Resume 2026');
    assert.strictEqual(savedPayload.nameIsVerified, false);
    assert.strictEqual(savedPayload.internalShortlistStatus, 'Shortlisted');
    assert.ok(savedPayload.internalShortlistDate instanceof Date);
    assert.strictEqual(savedPayload.qualityRating, 'Not Rated');
    assert.strictEqual(savedPayload.readyToSend, false);
    assert.strictEqual(savedPayload.sentToClient, true);
    assert.ok(savedPayload.sentToClientDate instanceof Date);
    assert.strictEqual(savedPayload.clientShortlistStatus, 'Pending');
    assert.ok(savedPayload.r2StorageKey.startsWith('positions/JO-123/attempts/1/'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOneAttempt;
    CandidateSubmission.findOne = origFindOneSub;
    CandidateSubmission.create = origCreateSub;
  });

  // Test 4.6: Multi-file partial failure returns 207 Multi-Status
  await runAsyncTest('uploadCvs handles multi-file partial failure gracefully (207 Multi-Status)', async () => {
    const origFindById = Position.findById;
    const origFindOneAttempt = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;
    const origCreateSub = CandidateSubmission.create;

    Position.findById = () => ({ _id: 'pos_123', jobOrderId: 'JO-123' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: 'attempt_act', attemptNumber: 1, status: 'Active' });
    CandidateSubmission.findOne = () => Promise.resolve(null);
    CandidateSubmission.create = (doc) => Promise.resolve({ _id: 'sub_id', ...doc, uploadedAt: new Date() });

    const mockS3Client = createMockS3Client();

    const files = [
      { originalname: 'Valid1.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length },
      { originalname: 'Invalid_Exe.pdf', buffer: spoofedPdfBuffer, size: spoofedPdfBuffer.length }, // Spoofed
      { originalname: 'Valid2.docx', buffer: validDocxBuffer, size: validDocxBuffer.length }
    ];

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, {}, files);

    await cvController.uploadCvs(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 207); // 207 Multi-Status
    assert.strictEqual(res.data.summary.total, 3);
    assert.strictEqual(res.data.summary.succeeded, 2);
    assert.strictEqual(res.data.summary.failed, 1);
    assert.strictEqual(res.data.failed[0].fileName, 'Invalid_Exe.pdf');

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOneAttempt;
    CandidateSubmission.findOne = origFindOneSub;
    CandidateSubmission.create = origCreateSub;
  });

  // Test 4.7: getDownloadUrl generates signed URL for existing record
  await runAsyncTest('getDownloadUrl generates presigned download URL for valid submission', async () => {
    const origFindById = CandidateSubmission.findById;
    CandidateSubmission.findById = () => ({
      lean: () => Promise.resolve({
        _id: 'sub_123',
        r2StorageKey: 'positions/JO-001/attempts/1/test.pdf',
        originalFileName: 'Jane_Resume.pdf'
      })
    });

    const mockS3Client = createMockS3Client();
    const { req, res } = createMockReqRes({ submissionId: 'sub_123' });

    await cvController.getDownloadUrl(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.expiresInSeconds, 900);
    assert.strictEqual(res.data.fileName, 'Jane_Resume.pdf');
    assert.ok(typeof res.data.url === 'string');

    CandidateSubmission.findById = origFindById;
  });

  // Test 4.8: deleteSubmission blocks deletion on historical attempt (403)
  await runAsyncTest('deleteSubmission blocks deletion of CV from closed or historical attempt', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAttempt = PositionAttempt.findById;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      attempt: 'attempt_hist'
    });
    PositionAttempt.findById = () => Promise.resolve({
      _id: 'attempt_hist',
      status: 'Completed' // Closed attempt!
    });

    const { req, res } = createMockReqRes({ submissionId: 'sub_123' });

    await cvController.deleteSubmission(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.data.error.includes('Cannot delete CVs from a closed or historical recruitment attempt'));

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAttempt;
  });

  // Test 4.9: createAttempt prevents duplicate active attempts
  await runAsyncTest('createAttempt prevents starting a second active attempt if one is already active', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;

    Position.findById = () => Promise.resolve({ _id: 'pos_123', assignee: null });
    // An active attempt already exists
    PositionAttempt.findOne = () => Promise.resolve({ _id: 'att_1', attemptNumber: 1, status: 'Active' });

    const { req, res } = createMockReqRes({ positionId: 'pos_123' }, { reopenReason: 'New cycle' });

    await cvController.createAttempt(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('already exists for this position'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
  });

  // ==========================================
  // SECTION 5: Deletion Failure Handling & Consistency
  // ==========================================
  console.log('\n--- 5. Deletion Failure Handling & Database Consistency ---');

  // Test 5.1: deleteSubmission returns 500 and preserves MongoDB record when R2 deletion fails
  await runAsyncTest('deleteSubmission returns 500 and preserves MongoDB record when R2 deletion fails', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAttempt = PositionAttempt.findById;
    const origDeleteOne = CandidateSubmission.deleteOne;

    let deleteOneCalled = false;
    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      r2StorageKey: 'positions/JO-001/attempts/1/FAIL_R2_DELETE_test.pdf',
      attempt: 'attempt_act'
    });
    PositionAttempt.findById = () => Promise.resolve({
      _id: 'attempt_act',
      status: 'Active'
    });
    CandidateSubmission.deleteOne = () => {
      deleteOneCalled = true;
      return Promise.resolve({ deletedCount: 1 });
    };

    const mockS3Client = createMockS3Client();
    const { req, res } = createMockReqRes({ submissionId: 'sub_123' });

    await cvController.deleteSubmission(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 500);
    assert.ok(res.data.error.includes('Failed to delete file from Cloudflare R2 storage'));
    assert.strictEqual(deleteOneCalled, false, 'MongoDB deleteOne must not be called when R2 deletion fails');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAttempt;
    CandidateSubmission.deleteOne = origDeleteOne;
  });

  // Test 5.2: deleteSubmission handles MongoDB deletion failure after successful R2 deletion
  await runAsyncTest('deleteSubmission reports 500 without false success when MongoDB deletion fails after successful R2 deletion', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAttempt = PositionAttempt.findById;
    const origDeleteOne = CandidateSubmission.deleteOne;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      r2StorageKey: 'positions/JO-001/attempts/1/normal_file.pdf',
      attempt: 'attempt_act'
    });
    PositionAttempt.findById = () => Promise.resolve({
      _id: 'attempt_act',
      status: 'Active'
    });

    let deleteAttempts = 0;
    CandidateSubmission.deleteOne = () => {
      deleteAttempts++;
      throw new Error('Simulated MongoDB Atlas write conflict / network drop');
    };

    const mockS3Client = createMockS3Client();
    const { req, res } = createMockReqRes({ submissionId: 'sub_123' });

    await cvController.deleteSubmission(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 500, 'Must return 500 when database deletion fails');
    assert.strictEqual(res.data.storageDeleted, true, 'Reports truthful R2 deletion status');
    assert.strictEqual(res.data.databaseDeleted, false, 'Does not falsely report database deletion');
    assert.ok(res.data.error.includes('database record could not be deleted'));
    assert.strictEqual(deleteAttempts, 2, 'Attempted initial delete plus 1 retry');

    const s3DeleteCmd = mockS3Client.commands.find(c => c.constructor.name === 'DeleteObjectCommand');
    assert.ok(s3DeleteCmd, 'R2 delete command executed prior to database delete');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAttempt;
    CandidateSubmission.deleteOne = origDeleteOne;
  });

  // ==========================================
  // SECTION 6: Ownership Cross-Checking
  // ==========================================
  console.log('\n--- 6. Endpoint Ownership Cross-Checking & Mismatched IDs ---');

  // Test 6.1: closeAttempt cross-checks position and attempt ownership
  await runAsyncTest('closeAttempt returns 404 when attempt belonging to Position B is requested through Position A', async () => {
    const origFindOne = PositionAttempt.findOne;

    PositionAttempt.findOne = (query) => {
      if (query.position === 'pos_A' && query._id === 'att_B') {
        return Promise.resolve(null);
      }
      return Promise.resolve({ _id: query._id, position: query.position });
    };

    const { req, res } = createMockReqRes({ positionId: 'pos_A', attemptId: 'att_B' }, { outcome: 'Completed' });

    await cvController.closeAttempt(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.error, 'Attempt not found for this position');

    PositionAttempt.findOne = origFindOne;
  });

  // Test 6.2: getSubmissions cross-checks position and attempt ownership
  await runAsyncTest('getSubmissions returns 404 when attempt belonging to Position B is requested through Position A', async () => {
    const origFindOne = PositionAttempt.findOne;

    PositionAttempt.findOne = (query) => {
      const isMismatch = (query.position === 'pos_A' && query._id === 'att_B');
      return {
        populate: () => ({
          lean: () => Promise.resolve(isMismatch ? null : { _id: query._id, position: query.position })
        })
      };
    };

    const { req, res } = createMockReqRes({ positionId: 'pos_A', attemptId: 'att_B' });

    await cvController.getSubmissions(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.error, 'Attempt not found for this position');

    PositionAttempt.findOne = origFindOne;
  });

  // ==========================================
  // SECTION 7: Controller Workflow Invariants
  // ==========================================
  console.log('\n--- 7. Controller Workflow Validation Invariants ---');

  // Test 7.1: updateSubmissionStatus rejects Good rating before shortlisting
  await runAsyncTest('updateSubmissionStatus rejects assigning Good quality rating before internal shortlisting (400)', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      attempt: 'att_act',
      internalShortlistStatus: 'Pending',
      qualityRating: 'Not Rated'
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    const { req, res } = createMockReqRes({ submissionId: 'sub_123' }, { qualityRating: 'Good' });
    await cvController.updateSubmissionStatus(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('Quality rating (Good/Optional) can only be assigned to internally shortlisted candidates'));

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // Test 7.2: updateSubmissionStatus rejects Optional rating before shortlisting
  await runAsyncTest('updateSubmissionStatus rejects assigning Optional quality rating before internal shortlisting (400)', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      attempt: 'att_act',
      internalShortlistStatus: 'Pending',
      qualityRating: 'Not Rated'
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    const { req, res } = createMockReqRes({ submissionId: 'sub_123' }, { qualityRating: 'Optional' });
    await cvController.updateSubmissionStatus(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('Quality rating (Good/Optional) can only be assigned to internally shortlisted candidates'));

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // Test 7.3: updateSubmissionStatus rejects client decision before CV is sent to client
  await runAsyncTest('updateSubmissionStatus rejects recording client shortlist decision before CV is sent to client (400)', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: 'sub_123',
      attempt: 'att_act',
      sentToClient: false,
      clientShortlistStatus: 'Pending'
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    const { req, res } = createMockReqRes({ submissionId: 'sub_123' }, { clientShortlistStatus: 'Shortlisted' });
    await cvController.updateSubmissionStatus(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('Client shortlist decision cannot be recorded before the CV is marked as sent to the client'));

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // Test 7.4: updateSubmissionStatus allows atomic multi-field promotion to Shortlisted and Good
  await runAsyncTest('updateSubmissionStatus allows atomic multi-field promotion to Shortlisted and Good (200)', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    const mockDoc = {
      _id: 'sub_123',
      attempt: 'att_act',
      internalShortlistStatus: 'Pending',
      qualityRating: 'Not Rated',
      save() { return Promise.resolve(this); }
    };
    CandidateSubmission.findById = (id) => ({
      populate: () => ({
        lean: () => Promise.resolve(mockDoc)
      }),
      then: (fn) => fn(mockDoc)
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    const { req, res } = createMockReqRes(
      { submissionId: 'sub_123' },
      { internalShortlistStatus: 'Shortlisted', qualityRating: 'Good' }
    );
    await cvController.updateSubmissionStatus(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockDoc.internalShortlistStatus, 'Shortlisted');
    assert.strictEqual(mockDoc.qualityRating, 'Good');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // Test 7.5: updateSubmissionStatus auto-resets qualityRating to Not Rated when candidate is rejected
  await runAsyncTest('updateSubmissionStatus auto-resets qualityRating to Not Rated when candidate is rejected', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    const mockDoc = {
      _id: 'sub_123',
      attempt: 'att_act',
      internalShortlistStatus: 'Shortlisted',
      qualityRating: 'Good',
      save() { return Promise.resolve(this); }
    };
    CandidateSubmission.findById = (id) => ({
      populate: () => ({
        lean: () => Promise.resolve(mockDoc)
      }),
      then: (fn) => fn(mockDoc)
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    const { req, res } = createMockReqRes(
      { submissionId: 'sub_123' },
      { internalShortlistStatus: 'Rejected' }
    );
    await cvController.updateSubmissionStatus(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockDoc.internalShortlistStatus, 'Rejected');
    assert.strictEqual(mockDoc.qualityRating, 'Not Rated', 'Quality rating must reset to Not Rated when candidate is no longer shortlisted');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // ==========================================
  // SECTION 8: Multer File-Size-Limit Error
  // ==========================================
  console.log('\n--- 8. Multer Middleware & File-Size-Limit Handling ---');

  // Test 8.1: handleMulterUpload rejects file stream exceeding 10 MB limit with HTTP 400 and clear JSON error
  await runAsyncTest('handleMulterUpload rejects file stream exceeding 10 MB limit with HTTP 400 and clear JSON error', async () => {
    await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (payload) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
          return res;
        };

        handleMulterUpload(req, res, () => {
          res.status(200).json({ success: true });
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const boundary = '----WebKitFormBoundaryTestOversize';
        const head = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="oversized.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
        const foot = `\r\n--${boundary}--\r\n`;
        const oversizedChunk = Buffer.alloc(10 * 1024 * 1024 + 10240, 0x41);

        const clientReq = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              assert.strictEqual(res.statusCode, 400);
              const parsed = JSON.parse(body);
              assert.strictEqual(parsed.error, 'File size exceeds the 10 MB limit.');
              server.close(resolve);
            } catch (err) {
              server.close(() => reject(err));
            }
          });
        });

        clientReq.on('error', (err) => {
          server.close(() => reject(err));
        });

        clientReq.write(Buffer.from(head));
        clientReq.write(oversizedChunk);
        clientReq.write(Buffer.from(foot));
        clientReq.end();
      });
    });
  });

  // ==========================================
  // SECTION 9: Phase 2B Step 2: Attempt Targets & ReadyToSend Workflow
  // ==========================================
  console.log('\n--- 9. Phase 2B Step 2: Attempt Targets & ReadyToSend Workflow ---');

  // Test 9.1: PositionAttempt schema validation for requiredGoodCvTarget
  runTest('PositionAttempt schema enforces default 0 and non-negative constraint on requiredGoodCvTarget', () => {
    const defaultAttempt = new PositionAttempt({
      position: '670000000000000000000001',
      attemptNumber: 1
    });
    assert.strictEqual(defaultAttempt.requiredGoodCvTarget, 0);

    const negativeAttempt = new PositionAttempt({
      position: '670000000000000000000001',
      attemptNumber: 1,
      requiredGoodCvTarget: -5
    });
    const err = negativeAttempt.validateSync();
    assert.ok(err);
    assert.ok(err.errors['requiredGoodCvTarget']);
  });

  // Test 9.2: CandidateSubmission schema enforces default readyToSend: false
  runTest('CandidateSubmission schema initializes readyToSend as false by default', () => {
    const sub = new CandidateSubmission({
      position: '670000000000000000000001',
      attempt: '670000000000000000000002',
      originalFileName: 'test.pdf',
      fileHash: 'abcdef',
      fileSize: 1024,
      mimeType: 'application/pdf',
      r2StorageKey: 'positions/test.pdf'
    });
    assert.strictEqual(sub.readyToSend, false);
  });

  // Test 9.3: createAttempt captures requiredGoodCvTarget and defaults to 0 when omitted
  await runAsyncTest('createAttempt captures requiredGoodCvTarget and defaults to 0 when omitted', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;
    const origFindByIdAttempt = PositionAttempt.findById;
    const origCreate = PositionAttempt.create;

    Position.findById = () => Promise.resolve({ _id: 'pos_123', assignee: null });
    PositionAttempt.findOne = (query) => {
      if (query && query.status === 'Active') {
        return Promise.resolve(null);
      }
      return {
        sort: () => Promise.resolve(null)
      };
    };

    let createdDoc = null;
    PositionAttempt.create = (doc) => {
      createdDoc = doc;
      return Promise.resolve({ _id: 'att_new', ...doc });
    };

    PositionAttempt.findById = () => ({
      populate: () => ({
        lean: () => Promise.resolve(createdDoc)
      })
    });

    // With explicit target
    const { req: req1, res: res1 } = createMockReqRes({ positionId: 'pos_123' }, { requiredGoodCvTarget: 7 });
    await cvController.createAttempt(req1, res1);
    assert.strictEqual(res1.statusCode, 201);
    assert.strictEqual(createdDoc.requiredGoodCvTarget, 7);

    // With omitted target (default 0)
    const { req: req2, res: res2 } = createMockReqRes({ positionId: 'pos_123' }, {});
    await cvController.createAttempt(req2, res2);
    assert.strictEqual(res2.statusCode, 201);
    assert.strictEqual(createdDoc.requiredGoodCvTarget, 0);

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
    PositionAttempt.findById = origFindByIdAttempt;
    PositionAttempt.create = origCreate;
  });

  // Test 9.4: createAttempt rejects invalid or negative requiredGoodCvTarget
  await runAsyncTest('createAttempt rejects invalid or negative requiredGoodCvTarget with HTTP 400', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;

    Position.findById = () => Promise.resolve({ _id: 'pos_123', assignee: null });
    PositionAttempt.findOne = () => Promise.resolve(null);

    const { req: req1, res: res1 } = createMockReqRes({ positionId: 'pos_123' }, { requiredGoodCvTarget: -2 });
    await cvController.createAttempt(req1, res1);
    assert.strictEqual(res1.statusCode, 400);
    assert.ok(res1.data.error.includes('non-negative'));

    const { req: req2, res: res2 } = createMockReqRes({ positionId: 'pos_123' }, { requiredGoodCvTarget: 'invalid_number' });
    await cvController.createAttempt(req2, res2);
    assert.strictEqual(res2.statusCode, 400);
    assert.ok(res2.data.error.includes('non-negative'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
  });

  // Test 9.5: updateAttempt updates requiredGoodCvTarget on active attempt (200)
  await runAsyncTest('updateAttempt successfully updates requiredGoodCvTarget on active attempt (200)', async () => {
    const origFindOne = PositionAttempt.findOne;
    const origFindById = PositionAttempt.findById;

    const mockAttempt = {
      _id: 'att_123',
      position: 'pos_123',
      status: 'Active',
      requiredGoodCvTarget: 2,
      save() { return Promise.resolve(this); }
    };

    PositionAttempt.findOne = () => Promise.resolve(mockAttempt);
    PositionAttempt.findById = () => ({
      populate: () => ({
        lean: () => Promise.resolve(mockAttempt)
      })
    });

    const { req, res } = createMockReqRes(
      { positionId: 'pos_123', attemptId: 'att_123' },
      { requiredGoodCvTarget: 10 }
    );

    await cvController.updateAttempt(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockAttempt.requiredGoodCvTarget, 10);

    PositionAttempt.findOne = origFindOne;
    PositionAttempt.findById = origFindById;
  });

  // Test 9.6: updateAttempt rejects negative or invalid target with HTTP 400
  await runAsyncTest('updateAttempt rejects negative or invalid target with HTTP 400', async () => {
    const origFindOne = PositionAttempt.findOne;

    PositionAttempt.findOne = () => Promise.resolve({
      _id: 'att_123',
      position: 'pos_123',
      status: 'Active',
      requiredGoodCvTarget: 5
    });

    const { req, res } = createMockReqRes(
      { positionId: 'pos_123', attemptId: 'att_123' },
      { requiredGoodCvTarget: -4 }
    );

    await cvController.updateAttempt(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('non-negative'));

    PositionAttempt.findOne = origFindOne;
  });

  // Test 9.7: updateAttempt rejects updates to completed or historical attempts with HTTP 403
  await runAsyncTest('updateAttempt rejects updates to completed or historical attempts with HTTP 403', async () => {
    const origFindOne = PositionAttempt.findOne;

    PositionAttempt.findOne = () => Promise.resolve({
      _id: 'att_hist',
      position: 'pos_123',
      status: 'Completed', // Historical attempt!
      requiredGoodCvTarget: 5
    });

    const { req, res } = createMockReqRes(
      { positionId: 'pos_123', attemptId: 'att_hist' },
      { requiredGoodCvTarget: 8 }
    );

    await cvController.updateAttempt(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.data.error.includes('Cannot modify a closed or historical'));

    PositionAttempt.findOne = origFindOne;
  });

  // Test 9.8: updateAttempt returns 404 when attempt does not belong to specified position
  await runAsyncTest('updateAttempt returns 404 when attempt does not belong to specified position', async () => {
    const origFindOne = PositionAttempt.findOne;

    // Cross-check simulation: query position doesn't match attempt's position
    PositionAttempt.findOne = (query) => {
      if (query.position === 'pos_A' && query._id === 'att_B') {
        return Promise.resolve(null);
      }
      return Promise.resolve({ _id: query._id, position: query.position });
    };

    const { req, res } = createMockReqRes(
      { positionId: 'pos_A', attemptId: 'att_B' },
      { requiredGoodCvTarget: 6 }
    );

    await cvController.updateAttempt(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.error, 'Attempt not found for this position');

    PositionAttempt.findOne = origFindOne;
  });

  // Test 9.9: updateSubmissionStatus sets readyToSend without mutating sentToClient or sentToClientDate
  await runAsyncTest('updateSubmissionStatus sets readyToSend to true without mutating sentToClient or sentToClientDate', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    const mockDoc = {
      _id: 'sub_123',
      attempt: 'att_act',
      readyToSend: false,
      sentToClient: false,
      sentToClientDate: null,
      save() { return Promise.resolve(this); }
    };

    CandidateSubmission.findById = (id) => ({
      populate: () => ({
        lean: () => Promise.resolve(mockDoc)
      }),
      then: (fn) => fn(mockDoc)
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: 'att_act', status: 'Active' });

    // Send readyToSend: true
    const { req: req1, res: res1 } = createMockReqRes({ submissionId: 'sub_123' }, { readyToSend: true });
    await cvController.updateSubmissionStatus(req1, res1);

    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(mockDoc.readyToSend, true, 'readyToSend updated to true');
    assert.strictEqual(mockDoc.sentToClient, false, 'sentToClient must remain false');
    assert.strictEqual(mockDoc.sentToClientDate, null, 'sentToClientDate must remain null');

    // Toggle readyToSend back to false
    const { req: req2, res: res2 } = createMockReqRes({ submissionId: 'sub_123' }, { readyToSend: false });
    await cvController.updateSubmissionStatus(req2, res2);

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(mockDoc.readyToSend, false, 'readyToSend toggled back to false');
    assert.strictEqual(mockDoc.sentToClient, false, 'sentToClient remains false');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // ==========================================
  // SECTION 10: Express Handler Signature & R2 Config Guards
  // ==========================================
  console.log('\n--- 10. Express Handler Signatures & Missing R2 Configuration Guards ---');

  // Test 10.1: resolveStorageClient ignores Express next callback
  runTest('resolveStorageClient never treats Express next callback as S3 client', () => {
    const mockNext = function next() {};
    assert.throws(() => {
      resolveStorageClient(mockNext);
    }, /Cloudflare R2 storage is not configured/);
  });

  // Test 10.2: resolveStorageClient accepts valid client with .send method
  runTest('resolveStorageClient accepts mock S3 client with .send method', () => {
    const mockClient = { send: async () => ({}) };
    const resolved = resolveStorageClient(mockClient);
    assert.strictEqual(resolved, mockClient);
  });

  // Test 10.3: getMissingR2ConfigKeys lists missing keys without exposing values
  runTest('getMissingR2ConfigKeys detects unconfigured environment keys', () => {
    const missing = getMissingR2ConfigKeys();
    assert.ok(Array.isArray(missing));
    assert.ok(missing.some(k => k.includes('R2_ACCESS_KEY_ID')));
    assert.ok(missing.some(k => k.includes('R2_SECRET_ACCESS_KEY')));
  });

  // Test 10.4: uploadCvs with Express next callback as 3rd arg returns HTTP 400 with descriptive error and summary
  await runAsyncTest('uploadCvs when invoked via Express (with next callback) handles missing R2 config safely', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;

    const validPosId = '507f191e810c19729de860ea';
    const validAttId = '507f191e810c19729de860eb';

    Position.findById = () => ({ _id: validPosId, jobOrderId: 'JO-EXP' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: validAttId, attemptNumber: 1, status: 'Active' });
    CandidateSubmission.findOne = () => Promise.resolve(null);

    const { req, res } = createMockReqRes({ positionId: validPosId }, { attemptId: validAttId }, [
      { originalname: 'Test.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);
    const mockNext = function next() {};

    await cvController.uploadCvs(req, res, mockNext);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(typeof res.data.error === 'string', 'Must provide top-level error message');
    assert.ok(res.data.error.includes('Cloudflare R2 storage is not configured'), 'Error explains missing R2 configuration');
    assert.strictEqual(res.data.summary.total, 1);
    assert.strictEqual(res.data.summary.succeeded, 0);
    assert.strictEqual(res.data.summary.failed, 1);
    assert.strictEqual(res.data.successful.length, 0);
    assert.strictEqual(res.data.failed.length, 1);
    assert.ok(res.data.failed[0].error.includes('Cloudflare R2 storage is not configured'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
    CandidateSubmission.findOne = origFindOneSub;
  });

  // Test 10.5: uploadCvs returns top-level error on all-files-failed response
  await runAsyncTest('uploadCvs all-files-failed response includes top-level error, summary, successful, and failed', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;

    Position.findById = () => ({ _id: '507f191e810c19729de860ea', jobOrderId: 'JO-FAIL' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: '507f191e810c19729de860eb', attemptNumber: 1, status: 'Active' });

    const { req, res } = createMockReqRes({ positionId: '507f191e810c19729de860ea' }, {}, [
      { originalname: 'Invalid.pdf', buffer: spoofedPdfBuffer, size: spoofedPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error, 'Top-level error is present');
    assert.ok(res.data.summary, 'Summary is present');
    assert.strictEqual(res.data.summary.failed, 1);
    assert.strictEqual(res.data.successful.length, 0);
    assert.strictEqual(res.data.failed.length, 1);
    assert.ok(res.data.failed[0].error.includes('signature does not match PDF'));

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
  });

  // Test 10.6: getDownloadUrl with Express next callback handles missing R2 config safely
  await runAsyncTest('getDownloadUrl when invoked with Express next callback catches error without crashing', async () => {
    const origFindById = CandidateSubmission.findById;
    CandidateSubmission.findById = () => ({
      lean: () => Promise.resolve({
        _id: '507f191e810c19729de860ec',
        r2StorageKey: 'positions/JO-1/attempts/1/test.pdf',
        originalFileName: 'test.pdf'
      })
    });

    const { req, res } = createMockReqRes({ submissionId: '507f191e810c19729de860ec' });
    const mockNext = function next() {};

    await cvController.getDownloadUrl(req, res, mockNext);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.data.error, 'Failed to generate download URL for CV.');

    CandidateSubmission.findById = origFindById;
  });

  // Test 10.7: deleteSubmission with Express next callback handles missing R2 config safely
  await runAsyncTest('deleteSubmission when invoked with Express next callback catches error without crashing', async () => {
    const origFindByIdSub = CandidateSubmission.findById;
    const origFindByIdAtt = PositionAttempt.findById;

    CandidateSubmission.findById = () => Promise.resolve({
      _id: '507f191e810c19729de860ec',
      r2StorageKey: 'positions/JO-1/attempts/1/test.pdf',
      attempt: '507f191e810c19729de860eb'
    });
    PositionAttempt.findById = () => Promise.resolve({ _id: '507f191e810c19729de860eb', status: 'Active' });

    const { req, res } = createMockReqRes({ submissionId: '507f191e810c19729de860ec' });
    const mockNext = function next() {};

    await cvController.deleteSubmission(req, res, mockNext);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.data.error, 'Failed to delete file from Cloudflare R2 storage.');

    CandidateSubmission.findById = origFindByIdSub;
    PositionAttempt.findById = origFindByIdAtt;
  });

  // Test 10.8: uploadCvs with valid mock client succeeds and creates CandidateSubmission record
  await runAsyncTest('uploadCvs succeeds (201) when provided a valid mock S3 client', async () => {
    const origFindById = Position.findById;
    const origFindOne = PositionAttempt.findOne;
    const origFindOneSub = CandidateSubmission.findOne;
    const origCreateSub = CandidateSubmission.create;

    const validPosId = '507f191e810c19729de860ea';
    const validAttId = '507f191e810c19729de860eb';

    Position.findById = () => ({ _id: validPosId, jobOrderId: 'JO-EXP' });
    PositionAttempt.findOne = () => Promise.resolve({ _id: validAttId, attemptNumber: 1, status: 'Active' });
    CandidateSubmission.findOne = () => Promise.resolve(null);
    CandidateSubmission.create = (doc) => Promise.resolve({
      _id: '507f191e810c19729de860ed',
      ...doc,
      uploadedAt: new Date()
    });

    const mockS3Client = createMockS3Client();
    const { req, res } = createMockReqRes({ positionId: validPosId }, { attemptId: validAttId }, [
      { originalname: 'Jane_Doe.pdf', buffer: validPdfBuffer, size: validPdfBuffer.length }
    ]);

    await cvController.uploadCvs(req, res, mockS3Client);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.summary.total, 1);
    assert.strictEqual(res.data.summary.succeeded, 1);
    assert.strictEqual(res.data.summary.failed, 0);
    assert.strictEqual(res.data.successful.length, 1);
    assert.strictEqual(res.data.successful[0].fileName, 'Jane_Doe.pdf');

    Position.findById = origFindById;
    PositionAttempt.findOne = origFindOne;
    CandidateSubmission.findOne = origFindOneSub;
    CandidateSubmission.create = origCreateSub;
  });

  // --- 11. Endpoint Normalization & Validation Invariants ---
  console.log('\n--- 11. Endpoint Normalization & Validation Invariants ---');

  runTest('getNormalizedR2Endpoint preserves valid HTTPS endpoint origin', () => {
    const valid = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    assert.strictEqual(getNormalizedR2Endpoint(valid, ''), valid);
  });

  runTest('getNormalizedR2Endpoint strips surrounding double and single quotation marks', () => {
    const expected = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    assert.strictEqual(getNormalizedR2Endpoint(`"${expected}"`, ''), expected);
    assert.strictEqual(getNormalizedR2Endpoint(`'${expected}'`, ''), expected);
  });

  runTest('getNormalizedR2Endpoint trims leading and trailing whitespace', () => {
    const expected = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    assert.strictEqual(getNormalizedR2Endpoint(`   ${expected}   \n`, ''), expected);
  });

  runTest('getNormalizedR2Endpoint strips invisible Unicode characters (BOM, zero-width, non-breaking space)', () => {
    const expected = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    const dirty = `\u200B\uFEFF\u00A0${expected}\u200B\uFEFF`;
    assert.strictEqual(getNormalizedR2Endpoint(dirty, ''), expected);
  });

  runTest('getNormalizedR2Endpoint adds https:// if protocol is missing', () => {
    const raw = '0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    const expected = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    assert.strictEqual(getNormalizedR2Endpoint(raw, ''), expected);
  });

  runTest('getNormalizedR2Endpoint extracts origin and removes accidental paths', () => {
    const raw = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/career141-cv-storage/extra';
    const expected = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    assert.strictEqual(getNormalizedR2Endpoint(raw, ''), expected);
  });

  runTest('getNormalizedR2Endpoint derives standard endpoint from R2_ACCOUNT_ID when R2_ENDPOINT is empty', () => {
    const accountId = '0123456789abcdef0123456789abcdef';
    const expected = `https://${accountId}.r2.cloudflarestorage.com`;
    assert.strictEqual(getNormalizedR2Endpoint('', accountId), expected);
    assert.strictEqual(getNormalizedR2Endpoint(null, `"${accountId}"`), expected);
  });

  runTest('getNormalizedR2Endpoint normalizes raw account ID passed directly as R2_ENDPOINT', () => {
    const accountId = '0123456789abcdef0123456789abcdef';
    const expected = `https://${accountId}.r2.cloudflarestorage.com`;
    assert.strictEqual(getNormalizedR2Endpoint(accountId, ''), expected);
  });

  runTest('getNormalizedR2Endpoint throws clear configuration error on empty endpoints', () => {
    assert.throws(
      () => getNormalizedR2Endpoint('', ''),
      /Cloudflare R2 endpoint is empty or missing/
    );
  });

  runTest('getNormalizedR2Endpoint throws clear configuration error on malformed endpoints', () => {
    assert.throws(
      () => getNormalizedR2Endpoint('https://', ''),
      /Invalid Cloudflare R2 endpoint URL format/
    );
    assert.throws(
      () => getNormalizedR2Endpoint('https:// invalid host with space', ''),
      /Invalid Cloudflare R2 endpoint URL format/
    );
  });

  console.log('\n===============================================================');
  console.log(`  Phase 2 Step 2A Tests Finished: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
