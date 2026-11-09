const mongoose = require('mongoose');
const JSZip = require('jszip');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const {
  validateFileContent,
  deriveUnverifiedLabel,
  generateFileHash,
  generateR2StorageKey
} = require('../utils/cvValidator');
const {
  uploadFileToR2,
  deleteFileFromR2,
  generatePresignedDownloadUrl,
  getFileBufferFromR2
} = require('../utils/r2Storage');

const ATTEMPT_TA_POPULATE = [
  { path: 'primaryTA', select: 'name status color' },
  { path: 'supportingTAs', select: 'name status color' }
];

const SUBMISSION_TA_POPULATE = [
  { path: 'submittedBy', select: 'name status color' },
  { path: 'sourcedBy', select: 'name status color' }
];

/**
 * Validates and normalizes supportingTAs against primaryTA.
 * Ensures all IDs are valid ObjectIds, prevents duplicate supporting TAs,
 * and prevents primaryTA from being duplicated as a supporting TA.
 */
function validateAndNormalizeSupportingTAs(primaryTA, supportingTAsInput) {
  if (supportingTAsInput === undefined || supportingTAsInput === null) {
    return { valid: true, supportingTAs: [] };
  }
  if (!Array.isArray(supportingTAsInput)) {
    return { valid: false, error: 'Supporting TAs must be provided as an array.' };
  }

  const primaryStr = primaryTA ? String(primaryTA._id || primaryTA) : null;
  const seen = new Set();
  const normalized = [];

  for (const rawItem of supportingTAsInput) {
    if (rawItem === null || rawItem === undefined || rawItem === '') continue;
    const taStr = String(rawItem._id || rawItem).trim();
    if (!mongoose.Types.ObjectId.isValid(taStr)) {
      return { valid: false, error: 'Invalid supporting TA ID provided.' };
    }
    if (primaryStr && taStr === primaryStr) {
      return { valid: false, error: 'Primary TA cannot also be assigned as a supporting TA.' };
    }
    if (seen.has(taStr)) {
      return { valid: false, error: 'Duplicate supporting TA assignment is not allowed.' };
    }
    seen.add(taStr);
    normalized.push(taStr);
  }

  return { valid: true, supportingTAs: normalized };
}

/**
 * Checks whether a given TA ID is assigned to the specified recruitment attempt
 * (either as primaryTA or in supportingTAs).
 */
function isTaAssignedToAttempt(taId, attempt) {
  if (!taId || !attempt) return false;
  const taStr = String(taId._id || taId).trim();
  if (!mongoose.Types.ObjectId.isValid(taStr)) return false;

  const primaryStr = attempt.primaryTA ? String(attempt.primaryTA._id || attempt.primaryTA) : null;
  if (primaryStr && taStr === primaryStr) return true;

  if (Array.isArray(attempt.supportingTAs)) {
    for (const sup of attempt.supportingTAs) {
      if (sup && String(sup._id || sup) === taStr) {
        return true;
      }
    }
  }
  return false;
}

/**
 * GET /api/cvs/positions/:positionId/attempts
 * Returns all recruitment attempts for a position without performing any database writes.
 */
async function getAttempts(req, res) {
  try {
    const { positionId } = req.params;

    const position = await Position.findById(positionId)
      .select('jobOrderId position status assignee')
      .populate('assignee', 'name status color')
      .lean();

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const attempts = await PositionAttempt.find({ position: positionId })
      .populate(ATTEMPT_TA_POPULATE)
      .sort({ attemptNumber: -1 })
      .lean();

    const activeAttempt = attempts.find(a => a.status === 'Active') || null;

    res.json({
      position,
      attempts,
      activeAttempt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/cvs/positions/:positionId/attempts
 * Explicit Lead action to initialize or start a new recruitment attempt.
 */
async function createAttempt(req, res) {
  try {
    const { positionId } = req.params;
    const { reopenReason, primaryTA, supportingTAs, requiredGoodCvTarget } = req.body;

    const position = await Position.findById(positionId);
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Prevent duplicate Active attempts on the same position
    const existingActive = await PositionAttempt.findOne({ position: positionId, status: 'Active' });
    if (existingActive) {
      return res.status(400).json({
        error: `An active recruitment attempt (Attempt #${existingActive.attemptNumber}) already exists for this position. Please conclude the active attempt before starting a new one.`
      });
    }

    if (primaryTA !== undefined && primaryTA !== null && primaryTA !== '' && !mongoose.Types.ObjectId.isValid(String(primaryTA))) {
      return res.status(400).json({ error: 'Invalid primary TA ID provided.' });
    }

    const effectivePrimaryTA = primaryTA !== undefined ? (primaryTA || null) : (position.assignee || null);
    const supValidation = validateAndNormalizeSupportingTAs(effectivePrimaryTA, supportingTAs);
    if (!supValidation.valid) {
      return res.status(400).json({ error: supValidation.error });
    }

    let targetNum = 0;
    if (requiredGoodCvTarget !== undefined && requiredGoodCvTarget !== null) {
      targetNum = Number(requiredGoodCvTarget);
      if (isNaN(targetNum) || targetNum < 0) {
        return res.status(400).json({ error: 'Required Good CV target must be a non-negative number.' });
      }
    }

    // Allocate unique Attempt ID and sequence number safely
    const alloc = await PositionAttempt.allocateNextAttempt(positionId);

    const newAttempt = await PositionAttempt.create({
      attemptId: alloc.attemptId,
      position: positionId,
      jobOrderId: position.jobOrderId,
      attemptNumber: alloc.attemptNumber,
      attemptNumberFormatted: alloc.attemptNumberFormatted,
      status: 'Active',
      primaryTA: effectivePrimaryTA,
      supportingTAs: supValidation.supportingTAs,
      startDate: new Date(),
      reopenReason: reopenReason || '',
      reason: req.body.reason || reopenReason || '',
      requiredGoodCvTarget: targetNum,
      legacySnapshot: {
        cvCount: position.cvCount,
        extShortlistCount: position.extShortlistCount,
        lsCount: position.lsCount || null,
        targetCvCount: position.targetCvCount || null
      }
    });

    const populated = await PositionAttempt.findById(newAttempt._id)
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/cvs/positions/:positionId/attempts/:attemptId
 * Updates attempt-level properties (e.g. requiredGoodCvTarget, primaryTA, supportingTAs) on an active attempt.
 */
async function updateAttempt(req, res) {
  try {
    const { positionId, attemptId } = req.params;
    const { requiredGoodCvTarget, primaryTA, supportingTAs, reopenReason } = req.body;

    const attempt = await PositionAttempt.findOne({ _id: attemptId, position: positionId });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found for this position' });
    }

    if (attempt.status !== 'Active') {
      return res.status(403).json({ error: 'Cannot modify a closed or historical recruitment attempt.' });
    }

    if (requiredGoodCvTarget !== undefined && requiredGoodCvTarget !== null) {
      const targetNum = Number(requiredGoodCvTarget);
      if (isNaN(targetNum) || targetNum < 0) {
        return res.status(400).json({ error: 'Required Good CV target must be a non-negative number.' });
      }
      attempt.requiredGoodCvTarget = targetNum;
    }

    if (primaryTA !== undefined) {
      if (primaryTA !== null && primaryTA !== '' && !mongoose.Types.ObjectId.isValid(String(primaryTA))) {
        return res.status(400).json({ error: 'Invalid primary TA ID provided.' });
      }
      attempt.primaryTA = primaryTA || null;
    }

    if (supportingTAs !== undefined || primaryTA !== undefined) {
      const rawSupporting = supportingTAs !== undefined
        ? supportingTAs
        : (attempt.supportingTAs || []).map(t => String(t._id || t));
      const supValidation = validateAndNormalizeSupportingTAs(attempt.primaryTA, rawSupporting);
      if (!supValidation.valid) {
        return res.status(400).json({ error: supValidation.error });
      }
      attempt.supportingTAs = supValidation.supportingTAs;
    }

    if (reopenReason !== undefined) {
      attempt.reopenReason = reopenReason;
    }

    await attempt.save();

    const populated = await PositionAttempt.findById(attempt._id)
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/cvs/positions/:positionId/attempts/:attemptId/close
 * Explicit Lead action to conclude or close an active attempt.
 */
async function closeAttempt(req, res) {
  try {
    const { positionId, attemptId } = req.params;
    const { outcome, reopenReason } = req.body;

    const attempt = await PositionAttempt.findOne({ _id: attemptId, position: positionId });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found for this position' });
    }

    if (attempt.status !== 'Active') {
      return res.status(400).json({ error: 'This attempt is already closed or completed.' });
    }

    attempt.status = 'Completed';
    attempt.endDate = new Date();
    attempt.outcome = outcome || 'In Progress';
    if (reopenReason) attempt.reopenReason = reopenReason;

    await attempt.save();

    const populated = await PositionAttempt.findById(attempt._id)
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/cvs/positions/:positionId/attempts/:attemptId/submissions
 * Retrieves all CV submissions for an attempt (supports both active and historical attempts).
 */
async function getSubmissions(req, res) {
  try {
    const { positionId, attemptId } = req.params;

    const attempt = await PositionAttempt.findOne({ _id: attemptId, position: positionId })
      .populate(ATTEMPT_TA_POPULATE)
      .lean();

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found for this position' });
    }

    const submissions = await CandidateSubmission.find({ position: positionId, attempt: attemptId })
      .populate(SUBMISSION_TA_POPULATE)
      .sort({ uploadedAt: -1 })
      .lean();

    res.json({
      attempt,
      submissions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/cvs/positions/:positionId/upload
 * Uploads one or more CV files directly to Cloudflare R2 and persists metadata in MongoDB.
 * Accepts optional injectedClient for unit testing without touching production R2.
 */
async function uploadCvs(req, res, injectedClient = null) {
  try {
    const { positionId } = req.params;
    // Guard against Express passing next middleware callback as third argument
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;

    const position = await Position.findById(positionId);
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Associate with the specified attempt or the currently active attempt
    const attemptId = req.query.attemptId || req.body.attemptId;
    let targetAttempt = null;

    if (attemptId) {
      targetAttempt = await PositionAttempt.findOne({ _id: attemptId, position: positionId });
    } else {
      targetAttempt = await PositionAttempt.findOne({ position: positionId, status: 'Active' });
    }

    // Requirement: Do not create an attempt simply because upload was invoked without an attempt.
    // Direct the Lead to start an attempt explicitly.
    if (!targetAttempt) {
      return res.status(400).json({
        error: 'No active recruitment attempt found for this position. Please start a recruitment attempt before uploading CVs.'
      });
    }

    // Requirement: Block uploads to inactive or historical attempts
    if (targetAttempt.status !== 'Active') {
      return res.status(403).json({
        error: 'Cannot upload CVs to an inactive or historical recruitment attempt.'
      });
    }

    // Optional CV attribution: never required during upload, never defaulted to primaryTA
    let validatedSourcedBy = null;
    if (req.body && req.body.sourcedBy !== undefined && req.body.sourcedBy !== null && req.body.sourcedBy !== '') {
      if (!isTaAssignedToAttempt(req.body.sourcedBy, targetAttempt)) {
        return res.status(400).json({
          error: 'Selected sourcing TA is not assigned to this recruitment attempt.'
        });
      }
      validatedSourcedBy = req.body.sourcedBy;
    }

    // Optional submission set association
    let targetSet = null;
    const setId = req.body?.submissionSetId || req.body?.submissionSet || req.query?.submissionSetId || req.query?.submissionSet;
    if (setId) {
      if (mongoose.Types.ObjectId.isValid(setId)) {
        targetSet = await SubmissionSet.findOne({ _id: setId, position: position._id });
      } else {
        targetSet = await SubmissionSet.findOne({ submissionSetId: setId, position: position._id });
      }
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided for upload.' });
    }

    const successful = [];
    const failed = [];

    // Process files in batch with itemized reporting and compensating rollback
    for (const file of files) {
      // 1. Validate file (extensions, MIME, magic bytes, size limit)
      const validation = validateFileContent(file.buffer, file.originalname);
      if (!validation.valid) {
        failed.push({
          fileName: file.originalname,
          error: validation.error
        });
        continue;
      }

      // 2. Compute SHA-256 hash for deduplication
      const fileHash = generateFileHash(file.buffer);

      // 3. Deduplication check within the exact same recruitment attempt
      const duplicate = await CandidateSubmission.findOne({
        attempt: targetAttempt._id,
        fileHash
      });

      if (duplicate) {
        failed.push({
          fileName: file.originalname,
          error: `Duplicate file: This exact CV content was already uploaded to this recruitment attempt (${duplicate.originalFileName}).`
        });
        continue;
      }

      // 4. Generate unique, collision-free storage key
      const storageKey = generateR2StorageKey(
        position.jobOrderId,
        targetAttempt.attemptNumber,
        file.originalname
      );

      // 5. Upload buffer directly to Cloudflare R2
      let r2Success = false;
      try {
        await uploadFileToR2({
          buffer: file.buffer,
          key: storageKey,
          mimeType: validation.detectedMimeType,
          client: storageClient
        });
        r2Success = true;
      } catch (r2Err) {
        // Safe logging without exposing secrets
        console.error(`Safe R2 upload error for file ${file.originalname}:`, r2Err.message);
        failed.push({
          fileName: file.originalname,
          error: r2Err.message || 'Failed to upload file to Cloudflare R2 storage.'
        });
        continue;
      }

      // 6. Persist metadata in MongoDB with strict workflow defaults
      let submission = null;
      try {
        const now = new Date();
        submission = await CandidateSubmission.create({
          position: position._id,
          attempt: targetAttempt._id,
          submissionSet: targetSet ? targetSet._id : null,
          submissionSetId: targetSet ? targetSet.submissionSetId : null,
          setNumber: targetSet ? targetSet.setNumber : null,
          originalFileName: file.originalname,
          unverifiedLabel: deriveUnverifiedLabel(file.originalname),
          nameIsVerified: false,
          fileHash,
          fileSize: file.size,
          mimeType: validation.detectedMimeType,
          r2StorageKey: storageKey,
          submittedBy: req.body.submittedBy || position.assignee || null,
          sourcedBy: validatedSourcedBy,
          internalShortlistStatus: 'Shortlisted',
          internalShortlistDate: now,
          qualityRating: 'Not Rated',
          readyToSend: false,
          sentToClient: true,
          sentToClientDate: (targetSet && targetSet.sentToClientAt) ? targetSet.sentToClientAt : now,
          clientShortlistStatus: 'Pending'
        });
      } catch (dbErr) {
        // Safe logging without exposing secrets
        console.error(`Safe DB save error for file ${file.originalname}:`, dbErr.message);

        // 7. COMPENSATING ROLLBACK: Remove orphaned object from Cloudflare R2
        if (r2Success) {
          try {
            await deleteFileFromR2({ key: storageKey, client: storageClient });
          } catch (delErr) {
            console.error(`Safe R2 rollback error for key ${storageKey}:`, delErr.message);
          }
        }

        failed.push({
          fileName: file.originalname,
          error: 'Failed to save CV record in database.'
        });
        continue;
      }

      // Record success
      successful.push({
        submissionId: submission._id,
        fileName: submission.originalFileName,
        candidateName: submission.unverifiedLabel,
        fileSize: submission.fileSize,
        mimeType: submission.mimeType,
        uploadedAt: submission.uploadedAt
      });
    }

    if (targetSet && successful.length > 0) {
      targetSet.cvCount += successful.length;
      await targetSet.save();
    }

    const summary = {
      total: files.length,
      succeeded: successful.length,
      failed: failed.length
    };

    if (successful.length === 0) {
      const primaryError = (failed.length === 1 && failed[0]?.error)
        ? failed[0].error
        : (failed[0]?.error ? `All file uploads failed: ${failed[0].error}` : 'All file uploads failed.');
      return res.status(400).json({
        error: primaryError,
        summary,
        successful,
        failed
      });
    }

    if (failed.length === 0) {
      return res.status(201).json({ summary, successful, failed });
    }

    // Partial failure: HTTP 207 Multi-Status
    return res.status(207).json({ summary, successful, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/cvs/submissions/:submissionId/download-url
 * Generates an authorized, short-lived presigned URL (15-min expiration) to view/download a CV from private R2.
 */
async function getDownloadUrl(req, res, injectedClient = null) {
  try {
    const { submissionId } = req.params;
    // Guard against Express passing next middleware callback as third argument
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;

    const submission = await CandidateSubmission.findById(submissionId).lean();
    if (!submission) {
      return res.status(404).json({ error: 'CV record not found' });
    }

    if (req.query?.positionId && String(submission.position) !== String(req.query.positionId)) {
      return res.status(403).json({ error: 'CV submission does not belong to the specified position.' });
    }
    if (req.query?.attemptId && String(submission.attempt) !== String(req.query.attemptId)) {
      return res.status(403).json({ error: 'CV submission does not belong to the specified recruitment attempt.' });
    }

    try {
      const signedUrl = await generatePresignedDownloadUrl({
        key: submission.r2StorageKey,
        originalFileName: submission.originalFileName,
        expiresIn: 900,
        client: storageClient
      });

      res.json({
        url: signedUrl,
        downloadUrl: signedUrl,
        expiresInSeconds: 900,
        fileName: submission.originalFileName
      });
    } catch (r2Err) {
      console.error('Safe download URL generation error:', r2Err.message);
      res.status(500).json({ error: 'Failed to generate download URL for CV.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/cvs/submissions/:submissionId
 * Deletes a CV submission from Cloudflare R2 and MongoDB.
 * Strictly blocked on closed/historical attempts.
 */
async function deleteSubmission(req, res, injectedClient = null) {
  try {
    const { submissionId } = req.params;
    // Guard against Express passing next middleware callback as third argument
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;

    const submission = await CandidateSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'CV record not found' });
    }

    const attempt = await PositionAttempt.findById(submission.attempt);
    if (!attempt || attempt.status !== 'Active') {
      return res.status(403).json({
        error: 'Cannot delete CVs from a closed or historical recruitment attempt.'
      });
    }

    // 1. Delete object from Cloudflare R2
    try {
      await deleteFileFromR2({ key: submission.r2StorageKey, client: storageClient });
    } catch (r2Err) {
      console.error(`Safe R2 delete error for key ${submission.r2StorageKey}:`, r2Err.message);
      return res.status(500).json({ error: 'Failed to delete file from Cloudflare R2 storage.' });
    }

    // 2. Delete record from MongoDB with safe retry and structured logging
    try {
      await CandidateSubmission.deleteOne({ _id: submissionId });
    } catch (dbErr) {
      console.warn(`[WARN] Initial MongoDB delete failed for submission ${submissionId}, retrying once:`, dbErr.message);
      try {
        await CandidateSubmission.deleteOne({ _id: submissionId });
      } catch (retryErr) {
        console.error(
          `[DATA_INCONSISTENCY CRITICAL] Cloudflare R2 file (${submission.r2StorageKey}) was deleted, but MongoDB record deletion failed for submissionId: ${submissionId}. Retrying delete operation will safely purge the record. Error:`,
          retryErr.message
        );
        return res.status(500).json({
          error: 'File was removed from Cloudflare R2 storage, but the database record could not be deleted due to a database error. Please retry deleting to remove the record.',
          submissionId,
          storageDeleted: true,
          databaseDeleted: false
        });
      }
    }

    res.json({
      message: 'CV submission deleted successfully',
      deletedId: submissionId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/cvs/submissions/:submissionId/status
 * Updates review workflow statuses, quality rating, and client feedback.
 */
async function updateSubmissionStatus(req, res) {
  try {
    const { submissionId } = req.params;
    const {
      internalShortlistStatus,
      internalShortlistNotes,
      qualityRating,
      readyToSend,
      sentToClient,
      clientShortlistStatus,
      clientShortlistDate,
      clientFeedback,
      unverifiedLabel,
      nameIsVerified
    } = req.body;

    const submission = await CandidateSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'CV record not found' });
    }

    const attempt = await PositionAttempt.findById(submission.attempt);
    if (!attempt || attempt.status !== 'Active') {
      return res.status(403).json({
        error: 'Cannot modify evaluations on a closed or historical recruitment attempt.'
      });
    }

    // Handle readyToSend (Stage B helper — does NOT automatically mark as sentToClient)
    if (readyToSend !== undefined) {
      submission.readyToSend = Boolean(readyToSend);
    }

    // Handle internal shortlist status
    if (internalShortlistStatus !== undefined) {
      submission.internalShortlistStatus = internalShortlistStatus;
      if (internalShortlistStatus === 'Shortlisted' && !submission.internalShortlistDate) {
        submission.internalShortlistDate = new Date();
      }
      // If moved away from Shortlisted, reset qualityRating to 'Not Rated'
      if (internalShortlistStatus !== 'Shortlisted') {
        submission.qualityRating = 'Not Rated';
      }
    }

    // Handle quality rating (enforcing invariant: Shortlisted only)
    if (qualityRating !== undefined) {
      if (submission.internalShortlistStatus !== 'Shortlisted' && qualityRating !== 'Not Rated') {
        return res.status(400).json({
          error: 'Quality rating (Good/Optional) can only be assigned to internally shortlisted candidates.'
        });
      }
      submission.qualityRating = qualityRating;
    }

    // Handle sentToClient
    if (sentToClient !== undefined) {
      submission.sentToClient = Boolean(sentToClient);
      if (sentToClient && !submission.sentToClientDate) {
        submission.sentToClientDate = new Date();
      }
      if (!sentToClient) {
        submission.sentToClientDate = null;
        submission.clientShortlistStatus = 'Pending';
      }
    }

    // Handle explicit client decision date if provided
    if (clientShortlistDate !== undefined) {
      submission.clientShortlistDate = clientShortlistDate ? new Date(clientShortlistDate) : null;
    }

    // Handle clientShortlistStatus (enforcing invariant: Sent to client only)
    if (clientShortlistStatus !== undefined) {
      // Guard: Prevent accidental client decision overwrites for withdrawn candidates
      if (submission.isWithdrawn && req.body.isWithdrawn !== false) {
        return res.status(400).json({
          error: 'Cannot modify client decision for a withdrawn candidate. Withdrawal must first be explicitly reversed.'
        });
      }

      if (!submission.sentToClient && clientShortlistStatus !== 'Pending') {
        return res.status(400).json({
          error: 'Client shortlist decision cannot be recorded before the CV is marked as sent to the client.'
        });
      }
      const allowedClientStatuses = ['Pending', 'Shortlisted', 'Rejected', 'Client Review', 'Review'];
      if (!allowedClientStatuses.includes(clientShortlistStatus)) {
        return res.status(400).json({
          error: `Invalid client shortlist status: "${clientShortlistStatus}". Allowed values are "Shortlisted" or "Rejected".`
        });
      }
      submission.clientShortlistStatus = clientShortlistStatus;
      if (clientShortlistStatus === 'Shortlisted' || clientShortlistStatus === 'Rejected') {
        if (!submission.clientShortlistDate) {
          submission.clientShortlistDate = new Date();
        }
      } else if (clientShortlistStatus === 'Pending') {
        submission.clientShortlistDate = null;
      }
    }

    if (internalShortlistNotes !== undefined) submission.internalShortlistNotes = internalShortlistNotes;
    if (clientFeedback !== undefined) submission.clientFeedback = clientFeedback;
    if (unverifiedLabel !== undefined) submission.unverifiedLabel = unverifiedLabel;
    if (nameIsVerified !== undefined) submission.nameIsVerified = Boolean(nameIsVerified);

    // Handle optional CV sourcing attribution (sourcedBy)
    if (req.body.sourcedBy !== undefined) {
      if (req.body.sourcedBy === null || req.body.sourcedBy === '') {
        submission.sourcedBy = null;
      } else {
        if (!isTaAssignedToAttempt(req.body.sourcedBy, attempt)) {
          return res.status(400).json({
            error: 'Selected sourcing TA is not assigned to this recruitment attempt.'
          });
        }
        submission.sourcedBy = req.body.sourcedBy;
      }
    }

    // Handle withdrawal
    if (req.body.isWithdrawn !== undefined) {
      if (req.body.isWithdrawn) {
        if (submission.clientShortlistStatus !== 'Shortlisted') {
          return res.status(400).json({
            error: 'Withdrawal can only be recorded for candidates whose client decision is Shortlisted.'
          });
        }
        if (req.body.withdrawalReason === 'Other' && (!req.body.withdrawalExplanation || !req.body.withdrawalExplanation.trim())) {
          return res.status(400).json({
            error: 'A brief explanation is required when "Other" is selected as the withdrawal reason.'
          });
        }
        submission.isWithdrawn = true;
        if (req.body.withdrawalDate) submission.withdrawalDate = new Date(req.body.withdrawalDate);
        else if (!submission.withdrawalDate) submission.withdrawalDate = new Date();
        if (req.body.withdrawalReason) submission.withdrawalReason = req.body.withdrawalReason;
        if (req.body.withdrawalExplanation !== undefined) {
          submission.withdrawalExplanation = req.body.withdrawalExplanation.trim();
        }
      } else {
        // Explicit reversal
        submission.isWithdrawn = false;
        submission.withdrawalDate = null;
        submission.withdrawalReason = null;
        submission.withdrawalExplanation = '';
      }
    }

    await submission.save();

    const populated = await CandidateSubmission.findById(submissionId)
      .populate(SUBMISSION_TA_POPULATE)
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Helper to generate candidate-identifying filename without collision
 */
function formatZipFileName(submission, existingNamesSet) {
  const candidateName = (submission.unverifiedLabel || '').trim();
  const original = (submission.originalFileName || 'CV.pdf').trim();

  let base = original;
  // If original name doesn't include candidate's name, prefix it
  const simplifiedCandidate = candidateName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const simplifiedOriginal = original.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (candidateName && !simplifiedOriginal.includes(simplifiedCandidate)) {
    base = `${candidateName} - ${original}`;
  }

  let clean = base.replace(/[/\\?%*:|"<>]/g, '_');
  let finalName = clean;
  let counter = 1;
  const extIndex = clean.lastIndexOf('.');
  const namePart = extIndex !== -1 ? clean.slice(0, extIndex) : clean;
  const extPart = extIndex !== -1 ? clean.slice(extIndex) : '';

  while (existingNamesSet.has(finalName.toLowerCase())) {
    finalName = `${namePart} (${counter})${extPart}`;
    counter++;
  }
  existingNamesSet.add(finalName.toLowerCase());
  return finalName;
}

/**
 * GET /api/cvs/submissions/:submissionId/file
 * Securely streams the raw CV file from Cloudflare R2 through the backend.
 * Avoids any client-side CORS issues and enforces candidate authorization.
 */
async function getSubmissionFile(req, res, injectedClient = null) {
  try {
    const { submissionId } = req.params;
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;

    const submission = await CandidateSubmission.findById(submissionId).lean();
    if (!submission) {
      return res.status(404).json({ error: 'CV record not found' });
    }

    if (req.query?.positionId && String(submission.position) !== String(req.query.positionId)) {
      return res.status(403).json({ error: 'CV submission does not belong to the specified position.' });
    }
    if (req.query?.attemptId && String(submission.attempt) !== String(req.query.attemptId)) {
      return res.status(403).json({ error: 'CV submission does not belong to the specified recruitment attempt.' });
    }

    try {
      const buffer = await getFileBufferFromR2({
        key: submission.r2StorageKey,
        client: storageClient
      });

      const safeFileName = (submission.originalFileName || 'CV.pdf').replace(/[/\\?%*:|"<>]/g, '_');
      res.setHeader('Content-Type', submission.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (r2Err) {
      console.error('Safe file download error:', r2Err.message);
      return res.status(404).json({ error: 'CV file could not be retrieved from storage.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/cvs/positions/:positionId/attempts/:attemptId/download-all
 * Downloads all CVs belonging to the selected recruitment attempt as a ZIP archive.
 * Preserves candidate-identifying filenames, handles missing files, and reports partial failures.
 * Strictly scoped to the specified position and attempt.
 */
async function downloadAttemptZip(req, res, injectedClient = null) {
  try {
    const { positionId, attemptId } = req.params;
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;

    const position = await Position.findById(positionId).select('jobOrderId position').lean();
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const attempt = await PositionAttempt.findOne({ _id: attemptId, position: positionId }).lean();
    if (!attempt) {
      return res.status(404).json({ error: 'Recruitment attempt not found for this position' });
    }

    // Only fetch submissions strictly belonging to this position and attempt
    const submissions = await CandidateSubmission.find({
      position: positionId,
      attempt: attemptId,
      internalShortlistStatus: 'Shortlisted'
    }).sort({ uploadedAt: -1 }).lean();

    if (!submissions || submissions.length === 0) {
      return res.status(400).json({ error: 'No internally shortlisted CVs found in this recruitment attempt.' });
    }

    const zip = new JSZip();
    const existingNamesSet = new Set();
    const successfulFiles = [];
    const missingOrFailedFiles = [];

    for (const submission of submissions) {
      const fileName = formatZipFileName(submission, existingNamesSet);
      try {
        const buffer = await getFileBufferFromR2({
          key: submission.r2StorageKey,
          client: storageClient
        });
        zip.file(fileName, buffer);
        successfulFiles.push({
          candidate: submission.unverifiedLabel,
          fileName
        });
      } catch (err) {
        missingOrFailedFiles.push({
          candidate: submission.unverifiedLabel,
          originalFileName: submission.originalFileName,
          error: err.message || 'File missing from storage'
        });
      }
    }

    // If partial download failures occurred, include a clear summary text file
    if (missingOrFailedFiles.length > 0) {
      let reportContent = `DOWNLOAD REPORT — ${position.jobOrderId} (Attempt #${attempt.attemptNumber})\n`;
      reportContent += `Generated: ${new Date().toISOString()}\n\n`;
      reportContent += `Total Candidate CVs: ${submissions.length}\n`;
      reportContent += `Successfully Included: ${successfulFiles.length}\n`;
      reportContent += `Failed / Missing: ${missingOrFailedFiles.length}\n\n`;
      reportContent += `--- FAILED FILES ---\n`;
      missingOrFailedFiles.forEach((f, i) => {
        reportContent += `${i + 1}. Candidate: ${f.candidate || 'Unknown'} | File: ${f.originalFileName} | Error: ${f.error}\n`;
      });
      zip.file('_DOWNLOAD_REPORT.txt', reportContent);
    }

    // If all files failed to retrieve from storage
    if (successfulFiles.length === 0) {
      return res.status(404).json({
        error: 'None of the CV files could be retrieved from storage.',
        failed: missingOrFailedFiles
      });
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const safeJobOrder = (position.jobOrderId || 'Position').replace(/[^\w.-]/g, '_');
    const zipName = `${safeJobOrder}_Attempt_${attempt.attemptNumber}_CVs.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    if (missingOrFailedFiles.length > 0) {
      res.setHeader('X-Partial-Download', 'true');
      res.setHeader('X-Failed-Count', String(missingOrFailedFiles.length));
    }

    return res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/cvs/submissions/:submissionId/withdraw
 * Records candidate withdrawal after client shortlisting.
 * Strictly requires candidate to be currently client-shortlisted.
 * Preserves candidate submission, CV file, attempt, and client decision history.
 */
async function withdrawCandidate(req, res) {
  try {
    const { submissionId } = req.params;
    const { withdrawalReason, withdrawalExplanation, withdrawalDate } = req.body;

    const submission = await CandidateSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'CV record not found' });
    }

    const attempt = await PositionAttempt.findById(submission.attempt);
    if (!attempt || attempt.status !== 'Active') {
      return res.status(403).json({
        error: 'Cannot record withdrawal on a closed or historical recruitment attempt.'
      });
    }

    // 1. Eligibility Check: must be currently Shortlisted by client
    if (submission.clientShortlistStatus !== 'Shortlisted') {
      return res.status(400).json({
        error: 'Withdrawal can only be recorded for candidates whose client decision is Shortlisted.'
      });
    }

    // 2. Prevent duplicate withdrawal actions
    if (submission.isWithdrawn) {
      return res.status(400).json({
        error: 'This candidate has already been marked as withdrawn.'
      });
    }

    // 3. Validate withdrawal reason
    const allowedReasons = [
      'Candidate withdrew',
      'Candidate declined the opportunity',
      'Candidate no longer available',
      'Other'
    ];
    if (!withdrawalReason || !allowedReasons.includes(withdrawalReason)) {
      return res.status(400).json({
        error: `Invalid withdrawal reason. Allowed reasons are: ${allowedReasons.join(', ')}.`
      });
    }

    if (withdrawalReason === 'Other' && (!withdrawalExplanation || !withdrawalExplanation.trim())) {
      return res.status(400).json({
        error: 'A brief explanation is required when "Other" is selected as the withdrawal reason.'
      });
    }

    submission.isWithdrawn = true;
    submission.withdrawalDate = withdrawalDate ? new Date(withdrawalDate) : new Date();
    submission.withdrawalReason = withdrawalReason;
    submission.withdrawalExplanation = withdrawalExplanation ? withdrawalExplanation.trim() : '';

    await submission.save();

    const populated = await CandidateSubmission.findById(submission._id)
      .populate(SUBMISSION_TA_POPULATE)
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAttempts,
  createAttempt,
  updateAttempt,
  closeAttempt,
  getSubmissions,
  uploadCvs,
  getDownloadUrl,
  deleteSubmission,
  updateSubmissionStatus,
  getSubmissionFile,
  downloadAttemptZip,
  formatZipFileName,
  withdrawCandidate
};


