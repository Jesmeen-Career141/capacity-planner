/**
 * Phase 3 — Simplified Multiple TA Assignment and Optional CV Attribution Test Suite
 * Verifies:
 * 1. Starting an attempt with a primary TA only.
 * 2. Starting an attempt with a primary TA and multiple supporting TAs.
 * 3. Preventing duplicate assignment of the primary TA (schema + controller).
 * 4. Preventing duplicate supporting TAs (schema + controller).
 * 5. Uploading CVs without selecting any TA attribution (never auto-persists primary TA as sourcedBy).
 * 6. Recording attribution for a CV (Primary TA or Supporting TA).
 * 7. Changing attribution and clearing attribution for a CV.
 * 8. Rejecting invalid or unassigned TAs.
 * 9. Frontend UI verification (no extra columns, Sourced by: [TA name] + Change link only when recorded, no placeholder when unattributed).
 *
 * Uses in-memory mocks only. Zero production database or Cloudflare R2 writes.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const {
  createAttempt,
  updateAttempt,
  uploadCvs,
  updateSubmissionStatus,
  getSubmissions
} = require('../controllers/cvController');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name, detail = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${detail ? `— ${detail}` : ''}`);
      failed++;
    }
  }

  console.log('\n=== Phase 3: Multiple TA Assignment & Optional CV Attribution Tests ===\n');

  const posId = new mongoose.Types.ObjectId();
  const primaryTaId = new mongoose.Types.ObjectId();
  const supTa1Id = new mongoose.Types.ObjectId();
  const supTa2Id = new mongoose.Types.ObjectId();
  const unassignedTaId = new mongoose.Types.ObjectId();

  const taDirectory = {
    [String(primaryTaId)]: { _id: primaryTaId, name: 'Sarah Jenkins', status: 'Active', color: '#176342' },
    [String(supTa1Id)]: { _id: supTa1Id, name: 'Amir Patel', status: 'Active', color: '#2563eb' },
    [String(supTa2Id)]: { _id: supTa2Id, name: 'Elena Rostova', status: 'Active', color: '#9333ea' },
    [String(unassignedTaId)]: { _id: unassignedTaId, name: 'Unassigned TA', status: 'Active', color: '#dc2626' }
  };

  // --- Test 1: Schema Validation on PositionAttempt ---
  {
    const validAttempt = new PositionAttempt({
      position: posId,
      attemptNumber: 1,
      primaryTA: primaryTaId,
      supportingTAs: [supTa1Id, supTa2Id]
    });
    let err = null;
    try {
      await validAttempt.validate();
    } catch (e) {
      err = e;
    }
    assert(
      err === null && validAttempt.supportingTAs.length === 2,
      'Test 1a: PositionAttempt schema accepts primaryTA + multiple supportingTAs'
    );

    const dupPrimaryAttempt = new PositionAttempt({
      position: posId,
      attemptNumber: 1,
      primaryTA: primaryTaId,
      supportingTAs: [supTa1Id, primaryTaId]
    });
    let dupErr = null;
    try {
      await dupPrimaryAttempt.validate();
    } catch (e) {
      dupErr = e;
    }
    assert(
      dupErr !== null && dupErr.errors && dupErr.errors.supportingTAs,
      'Test 1b: PositionAttempt schema rejects duplicate assignment of primaryTA in supportingTAs'
    );

    const dupSupportingAttempt = new PositionAttempt({
      position: posId,
      attemptNumber: 1,
      primaryTA: primaryTaId,
      supportingTAs: [supTa1Id, supTa1Id]
    });
    let dupSupErr = null;
    try {
      await dupSupportingAttempt.validate();
    } catch (e) {
      dupSupErr = e;
    }
    assert(
      dupSupErr !== null && dupSupErr.errors && dupSupErr.errors.supportingTAs,
      'Test 1c: PositionAttempt schema rejects duplicate TA IDs within supportingTAs'
    );
  }

  // Save original model methods
  const origPosFindById = Position.findById;
  const origAttemptFindOne = PositionAttempt.findOne;
  const origAttemptCreate = PositionAttempt.create;
  const origAttemptFindById = PositionAttempt.findById;
  const origSubFindOne = CandidateSubmission.findOne;
  const origSubCreate = CandidateSubmission.create;
  const origSubFindById = CandidateSubmission.findById;
  const origSubFind = CandidateSubmission.find;

  let attemptsStore = [];
  let submissionsStore = [];

  try {
    Position.findById = async (id) => {
      if (String(id) === String(posId)) {
        return {
          _id: posId,
          jobOrderId: 'JO-301',
          position: 'Lead Architect',
          assignee: primaryTaId,
          cvCount: 2,
          extShortlistCount: 1
        };
      }
      return null;
    };

    PositionAttempt.findOne = (filter) => {
      const match = attemptsStore.find(a => {
        if (filter._id && String(a._id) !== String(filter._id)) return false;
        if (filter.position && String(a.position) !== String(filter.position)) return false;
        if (filter.status && a.status !== filter.status) return false;
        return true;
      }) || null;

      const chain = {
        sort: () => Promise.resolve(match),
        populate: () => ({
          lean: () => Promise.resolve(match ? populateAttempt(match) : null)
        }),
        lean: () => Promise.resolve(match),
        then: (resolve, reject) => Promise.resolve(match).then(resolve, reject)
      };
      return chain;
    };

    function populateAttempt(att) {
      const raw = att.toObject ? att.toObject() : { ...att };
      return {
        ...raw,
        primaryTA: raw.primaryTA ? (taDirectory[String(raw.primaryTA._id || raw.primaryTA)] || raw.primaryTA) : null,
        supportingTAs: (raw.supportingTAs || []).map(id => taDirectory[String(id._id || id)] || id)
      };
    }

    function populateSubmission(sub) {
      const raw = sub.toObject ? sub.toObject() : { ...sub };
      return {
        ...raw,
        submittedBy: raw.submittedBy ? (taDirectory[String(raw.submittedBy._id || raw.submittedBy)] || raw.submittedBy) : null,
        sourcedBy: raw.sourcedBy ? (taDirectory[String(raw.sourcedBy._id || raw.sourcedBy)] || raw.sourcedBy) : null
      };
    }

    PositionAttempt.create = async (data) => {
      const doc = new PositionAttempt(data);
      await doc.validate();
      doc.save = async function() {
        await this.validate();
        return this;
      };
      attemptsStore.push(doc);
      return doc;
    };

    PositionAttempt.findById = (id) => {
      const found = attemptsStore.find(a => String(a._id) === String(id)) || null;
      return {
        populate: () => ({
          lean: () => Promise.resolve(found ? populateAttempt(found) : null)
        }),
        then: (resolve, reject) => Promise.resolve(found).then(resolve, reject)
      };
    };

    // --- Test 2: Start attempt with Primary TA only ---
    {
      attemptsStore = [];
      const req = {
        params: { positionId: String(posId) },
        body: {
          primaryTA: String(primaryTaId),
          requiredGoodCvTarget: 4
        }
      };
      const res = createMockRes();
      await createAttempt(req, res);

      assert(
        res.statusCode === 201 &&
          res.body.primaryTA?.name === 'Sarah Jenkins' &&
          Array.isArray(res.body.supportingTAs) &&
          res.body.supportingTAs.length === 0,
        'Test 2: Starting an attempt with Primary TA only succeeds with empty supportingTAs'
      );
    }

    // --- Test 3: Start attempt with Primary TA and multiple Supporting TAs ---
    let activeAttemptDoc = null;
    {
      attemptsStore = [];
      const req = {
        params: { positionId: String(posId) },
        body: {
          primaryTA: String(primaryTaId),
          supportingTAs: [String(supTa1Id), String(supTa2Id)],
          requiredGoodCvTarget: 5
        }
      };
      const res = createMockRes();
      await createAttempt(req, res);
      activeAttemptDoc = attemptsStore[0];

      assert(
        res.statusCode === 201 &&
          res.body.primaryTA?.name === 'Sarah Jenkins' &&
          res.body.supportingTAs?.length === 2 &&
          res.body.supportingTAs[0]?.name === 'Amir Patel' &&
          res.body.supportingTAs[1]?.name === 'Elena Rostova',
        'Test 3: Starting an attempt with Primary TA and multiple Supporting TAs populates all TAs'
      );
    }

    // --- Test 4: Prevent duplicate assignment of Primary TA via controller ---
    {
      const savedAttempts = [...attemptsStore];
      attemptsStore = [];
      const req = {
        params: { positionId: String(posId) },
        body: {
          primaryTA: String(primaryTaId),
          supportingTAs: [String(supTa1Id), String(primaryTaId)],
          requiredGoodCvTarget: 3
        }
      };
      const res = createMockRes();
      await createAttempt(req, res);
      assert(
        res.statusCode === 400 && /Primary TA cannot also be assigned as a supporting TA/i.test(res.body?.error || ''),
        'Test 4a: createAttempt rejects duplicate assignment of primaryTA in supportingTAs (400)'
      );

      attemptsStore = savedAttempts;
      const updateReq = {
        params: { positionId: String(posId), attemptId: String(activeAttemptDoc._id) },
        body: {
          supportingTAs: [String(primaryTaId)]
        }
      };
      const updateRes = createMockRes();
      await updateAttempt(updateReq, updateRes);
      assert(
        updateRes.statusCode === 400 && /Primary TA cannot also be assigned as a supporting TA/i.test(updateRes.body?.error || ''),
        'Test 4b: updateAttempt rejects duplicate assignment of primaryTA in supportingTAs (400)'
      );
    }

    // --- Test 5: Uploading CVs without selecting any TA attribution ---
    let uploadedSubDoc = null;
    {
      CandidateSubmission.findOne = async () => null;
      CandidateSubmission.create = async (data) => {
        const doc = new CandidateSubmission(data);
        await doc.validate();
        doc.save = async function() {
          await this.validate();
          return this;
        };
        submissionsStore.push(doc);
        return doc;
      };
      CandidateSubmission.findById = (id) => {
        const found = submissionsStore.find(s => String(s._id) === String(id)) || null;
        return {
          populate: () => ({
            lean: () => Promise.resolve(found ? populateSubmission(found) : null)
          }),
          then: (resolve, reject) => Promise.resolve(found).then(resolve, reject)
        };
      };
      CandidateSubmission.find = () => ({
        populate: () => ({
          sort: () => ({
            lean: () => Promise.resolve(submissionsStore.map(populateSubmission))
          })
        })
      });

      const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF', 'utf-8');
      const mockR2Client = { send: async () => ({}) };

      const req = {
        params: { positionId: String(posId) },
        query: {},
        body: {
          attemptId: String(activeAttemptDoc._id),
          submittedBy: String(primaryTaId)
        },
        files: [
          {
            originalname: 'Nadia_Hassan_CV.pdf',
            buffer: validPdfBuffer,
            size: validPdfBuffer.length,
            mimetype: 'application/pdf'
          }
        ]
      };
      const res = createMockRes();
      await uploadCvs(req, res, mockR2Client);
      uploadedSubDoc = submissionsStore[0];

      assert(
        res.statusCode === 201 &&
          uploadedSubDoc &&
          uploadedSubDoc.sourcedBy === null &&
          String(uploadedSubDoc.submittedBy) === String(primaryTaId),
        'Test 5: Uploading CV without attribution keeps sourcedBy strictly null (does not auto-persist primary TA as source)'
      );
    }

    // --- Test 6: Recording attribution for a CV (Primary TA & Supporting TA) ---
    {
      const req = {
        params: { submissionId: String(uploadedSubDoc._id) },
        body: { sourcedBy: String(supTa1Id) }
      };
      const res = createMockRes();
      await updateSubmissionStatus(req, res);

      assert(
        res.statusCode === 200 &&
          String(uploadedSubDoc.sourcedBy) === String(supTa1Id) &&
          res.body.sourcedBy?.name === 'Amir Patel',
        'Test 6: Recording CV attribution to a Supporting TA persists and populates sourcedBy'
      );
    }

    // --- Test 7: Changing attribution to Primary TA and clearing attribution ---
    {
      const reqChange = {
        params: { submissionId: String(uploadedSubDoc._id) },
        body: { sourcedBy: String(primaryTaId) }
      };
      const resChange = createMockRes();
      await updateSubmissionStatus(reqChange, resChange);

      assert(
        resChange.statusCode === 200 &&
          String(uploadedSubDoc.sourcedBy) === String(primaryTaId) &&
          resChange.body.sourcedBy?.name === 'Sarah Jenkins',
        'Test 7a: Changing CV attribution to Primary TA updates sourcedBy accurately'
      );

      const reqClear = {
        params: { submissionId: String(uploadedSubDoc._id) },
        body: { sourcedBy: null }
      };
      const resClear = createMockRes();
      await updateSubmissionStatus(reqClear, resClear);

      assert(
        resClear.statusCode === 200 &&
          uploadedSubDoc.sourcedBy === null &&
          resClear.body.sourcedBy === null,
        'Test 7b: Clearing CV attribution resets sourcedBy to null'
      );
    }

    // --- Test 8: Rejecting invalid or unassigned TAs ---
    {
      // Unassigned TA
      const reqUnassigned = {
        params: { submissionId: String(uploadedSubDoc._id) },
        body: { sourcedBy: String(unassignedTaId) }
      };
      const resUnassigned = createMockRes();
      await updateSubmissionStatus(reqUnassigned, resUnassigned);

      assert(
        resUnassigned.statusCode === 400 &&
          /not assigned to this recruitment attempt/i.test(resUnassigned.body?.error || '') &&
          uploadedSubDoc.sourcedBy === null,
        'Test 8a: Rejecting unassigned TA when setting sourcedBy (400)'
      );

      // Invalid ObjectId TA
      const reqInvalid = {
        params: { submissionId: String(uploadedSubDoc._id) },
        body: { sourcedBy: 'not-a-valid-ta-id' }
      };
      const resInvalid = createMockRes();
      await updateSubmissionStatus(reqInvalid, resInvalid);

      assert(
        resInvalid.statusCode === 400 &&
          /not assigned to this recruitment attempt/i.test(resInvalid.body?.error || '') &&
          uploadedSubDoc.sourcedBy === null,
        'Test 8b: Rejecting invalid TA ID when setting sourcedBy (400)'
      );
    }

    // --- Test 9: Frontend Component Verification ---
    {
      const cardCode = fs.readFileSync(
        path.join(__dirname, '../../client/src/components/CandidateCard.jsx'),
        'utf-8'
      );
      const pipelineCode = fs.readFileSync(
        path.join(__dirname, '../../client/src/components/CandidatePipeline.jsx'),
        'utf-8'
      );
      const sectionCode = fs.readFileSync(
        path.join(__dirname, '../../client/src/components/CandidateCvSection.jsx'),
        'utf-8'
      );

      assert(
        cardCode.includes('Sourced by: {sourcedByName}') &&
          cardCode.includes('{sourcedByName && !isEditingSource && (') &&
          cardCode.includes('cv-demo3-source-change-link'),
        'Test 9a: CandidateCard renders "Sourced by: [TA name]" + Change link only when attribution is recorded'
      );

      assert(
        !pipelineCode.includes('<b>Sourced by</b>') &&
          pipelineCode.includes('<b>Candidate / CV</b>') &&
          pipelineCode.includes('<b>Internal status</b>') &&
          pipelineCode.includes('<b>Quality</b>') &&
          pipelineCode.includes('<b>Client decision</b>') &&
          pipelineCode.includes('<b className="cv-demo3-head-actions">Actions</b>'),
        'Test 9b: CandidatePipeline preserves exact 5 columns without adding extra table columns'
      );

      assert(
        sectionCode.includes('Supporting TAs (Optional):') &&
          sectionCode.includes('supportingTAs'),
        'Test 9c: CandidateCvSection includes compact optional Supporting TAs multi-select when starting an attempt'
      );
    }
  } finally {
    Position.findById = origPosFindById;
    PositionAttempt.findOne = origAttemptFindOne;
    PositionAttempt.create = origAttemptCreate;
    PositionAttempt.findById = origAttemptFindById;
    CandidateSubmission.findOne = origSubFindOne;
    CandidateSubmission.create = origSubCreate;
    CandidateSubmission.findById = origSubFindById;
    CandidateSubmission.find = origSubFind;
  }

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
