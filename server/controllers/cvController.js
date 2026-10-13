const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const {
  validateFileContent,
  deriveUnverifiedLabel,
  generateFileHash,
  generateR2StorageKey
} = require('../utils/cvValidator');
const {
  uploadFileToR2,
  deleteFileFromR2,
  generatePresignedDownloadUrl
} = require('../utils/r2Storage');

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
      .populate('primaryTA', 'name status color')
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
    const { reopenReason, primaryTA, requiredGoodCvTarget } = req.body;

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

    let targetNum = 0;
    if (requiredGoodCvTarget !== undefined && requiredGoodCvTarget !== null) {
      targetNum = Number(requiredGoodCvTarget);
      if (isNaN(targetNum) || targetNum < 0) {
        return res.status(400).json({ error: 'Required Good CV target must be a non-negative number.' });
      }
    }

    // Determine sequence number
    const latest = await PositionAttempt.findOne({ position: positionId }).sort({ attemptNumber: -1 });
    const nextNumber = latest ? latest.attemptNumber + 1 : 1;

    const newAttempt = await PositionAttempt.create({
      position: positionId,
      attemptNumber: nextNumber,
      status: 'Active',
      primaryTA: primaryTA || position.assignee || null,
      startDate: new Date(),
      reopenReason: reopenReason || '',
      requiredGoodCvTarget: targetNum,
      legacySnapshot: {
        cvCount: position.cvCount,
        extShortlistCount: position.extShortlistCount,
        lsCount: position.lsCount || null,
        targetCvCount: position.targetCvCount || null
      }
    });

    const populated = await PositionAttempt.findById(newAttempt._id)
      .populate('primaryTA', 'name status color')
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/cvs/positions/:positionId/attempts/:attemptId
 * Updates attempt-level properties (e.g. requiredGoodCvTarget) on an active attempt.
 */
async function updateAttempt(req, res) {
  try {
    const { positionId, attemptId } = req.params;
    const { requiredGoodCvTarget, primaryTA, reopenReason } = req.body;

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
      attempt.primaryTA = primaryTA || null;
    }

    if (reopenReason !== undefined) {
      attempt.reopenReason = reopenReason;
    }

    await attempt.save();

    const populated = await PositionAttempt.findById(attempt._id)
      .populate('primaryTA', 'name status color')
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
      .populate('primaryTA', 'name status color')
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
      .populate('primaryTA', 'name status color')
      .lean();

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found for this position' });
    }

    const submissions = await CandidateSubmission.find({ position: positionId, attempt: attemptId })
      .populate('submittedBy', 'name status color')
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
          originalFileName: file.originalname,
          unverifiedLabel: deriveUnverifiedLabel(file.originalname),
          nameIsVerified: false,
          fileHash,
          fileSize: file.size,
          mimeType: validation.detectedMimeType,
          r2StorageKey: storageKey,
          submittedBy: req.body.submittedBy || position.assignee || null,
          internalShortlistStatus: 'Shortlisted',
          internalShortlistDate: now,
          qualityRating: 'Not Rated',
          readyToSend: false,
          sentToClient: true,
          sentToClientDate: now,
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

    // Handle clientShortlistStatus (enforcing invariant: Sent to client only)
    if (clientShortlistStatus !== undefined) {
      if (!submission.sentToClient && clientShortlistStatus !== 'Pending') {
        return res.status(400).json({
          error: 'Client shortlist decision cannot be recorded before the CV is marked as sent to the client.'
        });
      }
      submission.clientShortlistStatus = clientShortlistStatus;
      if (clientShortlistStatus === 'Shortlisted' && !submission.clientShortlistDate) {
        submission.clientShortlistDate = new Date();
      }
    }

    if (internalShortlistNotes !== undefined) submission.internalShortlistNotes = internalShortlistNotes;
    if (clientFeedback !== undefined) submission.clientFeedback = clientFeedback;
    if (unverifiedLabel !== undefined) submission.unverifiedLabel = unverifiedLabel;
    if (nameIsVerified !== undefined) submission.nameIsVerified = Boolean(nameIsVerified);

    await submission.save();

    const populated = await CandidateSubmission.findById(submissionId)
      .populate('submittedBy', 'name status color')
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
  updateSubmissionStatus
};
