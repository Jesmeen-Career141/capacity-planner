const mongoose = require('mongoose');
const SubmissionSet = require('../models/SubmissionSet');
const { ActivityCounter } = require('../models/ActivityCounter');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const CandidateSubmission = require('../models/CandidateSubmission');
const TA = require('../models/TA');
const {
  validateFileContent,
  deriveUnverifiedLabel,
  generateFileHash,
  generateR2StorageKey
} = require('../utils/cvValidator');
const {
  uploadFileToR2,
  deleteFileFromR2
} = require('../utils/r2Storage');
const { syncPositionCvCounts } = require('../utils/cvSync');

const SET_POPULATE = [
  {
    path: 'position',
    select: 'jobOrderId position client status assignee pLevel pipelineStage',
    populate: { path: 'client', select: 'clientName' }
  },
  { path: 'uploadedBy', select: 'name status color' },
  { path: 'sourcingTAs', select: 'name status color' },
  { path: 'createdBy', select: 'name status color' },
  { path: 'attempt', select: 'attemptNumber status primaryTA' },
  { path: 'dailyActivity', select: 'activityId activityDateStr workType' }
];

const SUBMISSION_TA_POPULATE = [
  { path: 'submittedBy', select: 'name status color' },
  { path: 'sourcedBy', select: 'name status color' }
];

/**
 * Computes metrics across a list of candidate submissions.
 * Explicitly separates submission records from unique candidates.
 */
function computeSetMetrics(submissions = []) {
  const uniqueNames = new Set();
  const uniqueHashes = new Set();
  let internallyShortlisted = 0;
  let goodCvs = 0;
  let optionalCvs = 0;
  let notRated = 0;
  let clientShortlisted = 0;
  let clientPending = 0;
  let clientRejected = 0;
  let clientReview = 0;
  let withdrawn = 0;

  for (const sub of submissions) {
    if (sub.unverifiedLabel) uniqueNames.add(sub.unverifiedLabel.trim().toLowerCase());
    if (sub.fileHash) uniqueHashes.add(sub.fileHash);

    if (sub.internalShortlistStatus !== 'Rejected') internallyShortlisted++;
    if (sub.qualityRating === 'Good') goodCvs++;
    if (sub.qualityRating === 'Optional') optionalCvs++;
    if (sub.qualityRating === 'Not Rated') notRated++;

    if (sub.clientShortlistStatus === 'Shortlisted') clientShortlisted++;
    else if (sub.clientShortlistStatus === 'Rejected') clientRejected++;
    else if (sub.clientShortlistStatus === 'Client Review' || sub.clientShortlistStatus === 'Review') clientReview++;
    else clientPending++;

    if (sub.isWithdrawn) withdrawn++;
  }

  return {
    totalSubmissions: submissions.length,
    uniqueCandidatesByName: uniqueNames.size,
    uniqueCandidatesByHash: uniqueHashes.size,
    internallyShortlisted,
    goodCvs,
    optionalCvs,
    notRated,
    clientShortlisted,
    clientPending,
    clientRejected,
    clientReview,
    withdrawn
  };
}

/**
 * GET /api/submission-sets
 * Lists submission sets with filters: position, ta, dateFrom, dateTo, search
 */
async function getSubmissionSets(req, res) {
  try {
    const { position, ta, dateFrom, dateTo, search } = req.query;
    const filter = {};

    if (position && mongoose.Types.ObjectId.isValid(position)) {
      filter.position = position;
    }

    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      filter.$or = [
        { uploadedBy: ta },
        { sourcingTAs: ta }
      ];
    }

    if (dateFrom || dateTo) {
      filter.sentToClientAt = {};
      if (dateFrom) filter.sentToClientAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.sentToClientAt.$lte = toDate;
      }
    }

    let sets = await SubmissionSet.find(filter)
      .populate(SET_POPULATE)
      .sort({ sentToClientAt: -1, createdAt: -1 })
      .lean();

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      sets = sets.filter(s => {
        const clientName = (s.position?.client?.clientName || '').toLowerCase();
        const posName = (s.position?.position || '').toLowerCase();
        const setNum = (s.setNumber || '').toLowerCase();
        const setSeqStr = s.setSequence ? `set ${s.setSequence}` : '';
        const combined = `${clientName} ${posName} ${setNum} ${setSeqStr}`;
        return (
          clientName.includes(q) ||
          posName.includes(q) ||
          setNum.includes(q) ||
          setSeqStr.includes(q) ||
          combined.includes(q) ||
          (s.jobOrderId && s.jobOrderId.toLowerCase().includes(q)) ||
          (s.submissionSetId && s.submissionSetId.toLowerCase().includes(q))
        );
      });
    }

    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/submission-sets/:id
 * Retrieves a submission set along with all of its candidate submissions and aggregated metrics
 */
async function getSubmissionSetById(req, res) {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submissionSetId: id };

    const set = await SubmissionSet.findOne(query)
      .populate(SET_POPULATE)
      .lean();

    if (!set) {
      return res.status(404).json({ error: 'Submission set not found' });
    }

    // Query candidate submissions belonging to this set
    const submissions = await CandidateSubmission.find({ submissionSet: set._id })
      .populate(SUBMISSION_TA_POPULATE)
      .sort({ uploadedAt: -1 })
      .lean();

    const metrics = computeSetMetrics(submissions);

    res.json({
      set,
      submissions,
      metrics
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/submission-sets
 * Creates a new submission set with concurrency-safe set numbering
 */
async function createSubmissionSet(req, res) {
  let allocatedSeq = null;
  let targetPositionId = null;

  try {
    const { positionId, sentToClientAt, uploadedBy, sourcingTAs, sourcedBy, notes, dailyActivityId, attemptId } = req.body;

    if (!positionId || !mongoose.Types.ObjectId.isValid(positionId)) {
      return res.status(400).json({ error: 'Valid positionId is required.' });
    }

    if (!sentToClientAt) {
      return res.status(400).json({ error: 'sentToClientAt (actual date sent to client) is required.' });
    }

    const sentDate = new Date(sentToClientAt);
    if (isNaN(sentDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date provided for sentToClientAt.' });
    }

    const position = await Position.findById(positionId);
    if (!position) {
      return res.status(404).json({ error: 'Position not found.' });
    }

    let validUploadedBy = null;
    if (uploadedBy && mongoose.Types.ObjectId.isValid(uploadedBy)) {
      const ta = await TA.findById(uploadedBy);
      if (ta) validUploadedBy = ta._id;
    }

    // Parse multi-sourcing TAs
    let parsedSourcingTAs = [];
    if (Array.isArray(sourcingTAs)) {
      parsedSourcingTAs = sourcingTAs;
    } else if (typeof sourcingTAs === 'string') {
      try {
        const parsed = JSON.parse(sourcingTAs);
        if (Array.isArray(parsed)) parsedSourcingTAs = parsed;
        else if (mongoose.Types.ObjectId.isValid(sourcingTAs)) parsedSourcingTAs = [sourcingTAs];
      } catch (_) {
        if (mongoose.Types.ObjectId.isValid(sourcingTAs)) parsedSourcingTAs = [sourcingTAs];
        else if (sourcingTAs.includes(',')) {
          parsedSourcingTAs = sourcingTAs.split(',').map(s => s.trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
        }
      }
    }
    if (parsedSourcingTAs.length === 0 && sourcedBy && mongoose.Types.ObjectId.isValid(sourcedBy)) {
      parsedSourcingTAs = [sourcedBy];
    }
    parsedSourcingTAs = [...new Set(parsedSourcingTAs.filter(id => mongoose.Types.ObjectId.isValid(id)))];

    // Resolve or automatically allocate attempt
    let targetAttempt = null;
    if (attemptId && mongoose.Types.ObjectId.isValid(attemptId)) {
      targetAttempt = await PositionAttempt.findOne({ _id: attemptId, position: position._id });
    } else {
      targetAttempt = await PositionAttempt.findOne({ position: position._id, status: 'Active' });
    }

    if (!targetAttempt) {
      const latestAttempt = await PositionAttempt.findOne({ position: position._id }).sort({ attemptNumber: -1 });
      if (latestAttempt) {
        targetAttempt = latestAttempt;
      } else {
        const alloc = await PositionAttempt.allocateNextAttempt(position._id);
        targetAttempt = await PositionAttempt.create({
          attemptId: alloc.attemptId,
          position: position._id,
          jobOrderId: position.jobOrderId || '',
          attemptNumber: alloc.attemptNumber,
          attemptNumberFormatted: alloc.attemptNumberFormatted,
          status: 'Active',
          startDate: new Date(),
          primaryTA: position.assignee || (parsedSourcingTAs[0] || validUploadedBy || null),
          outcome: 'In Progress',
          createdBy: 'System (Submission Set)'
        });
      }
    }

    targetPositionId = position._id;

    // Concurrency-safe server-side allocation
    const allocation = await SubmissionSet.allocateNextSet(position._id);
    allocatedSeq = allocation.setSequence;

    const set = await SubmissionSet.create({
      submissionSetId: allocation.submissionSetId,
      position: position._id,
      jobOrderId: position.jobOrderId,
      setNumber: allocation.setNumber,
      setSequence: allocation.setSequence,
      sentToClientAt: sentDate,
      uploadedAt: new Date(),
      uploadedBy: validUploadedBy,
      sourcingTAs: parsedSourcingTAs,
      cvCount: 0,
      notes: notes || '',
      attempt: targetAttempt ? targetAttempt._id : null,
      dailyActivity: dailyActivityId || null,
      createdBy: req.body.createdBy || validUploadedBy || (parsedSourcingTAs[0] || null)
    });

    // Populate Position's Activation Date when the first submission set is created
    // (unless the user has manually overridden the Activation Date)
    if (!position.activationDateManuallyOverridden) {
      const priorSetCount = await SubmissionSet.countDocuments({
        position: position._id,
        _id: { $ne: set._id }
      });
      if (priorSetCount === 0 || allocation.setSequence === 1) {
        await Position.updateOne(
          { _id: position._id, activationDateManuallyOverridden: { $ne: true } },
          { $set: { activatedAt: sentDate } }
        );
      }
    }

    await syncPositionCvCounts(position._id);

    const populated = await SubmissionSet.findById(set._id)
      .populate(SET_POPULATE)
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    // Roll back sequence if creation failed
    if (targetPositionId && allocatedSeq) {
      await SubmissionSet.rollbackSetSequence(targetPositionId, allocatedSeq);
    }
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/submission-sets/:id/upload
 * Uploads CVs into an existing submission set
 */
async function uploadCvsToSet(req, res, injectedClient = null) {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submissionSetId: id };

    const set = await SubmissionSet.findOne(query);
    if (!set) {
      return res.status(404).json({ error: 'Submission set not found.' });
    }

    const position = await Position.findById(set.position);
    if (!position) {
      return res.status(404).json({ error: 'Associated position not found.' });
    }

    // Associate with attempt
    let targetAttempt = null;
    if (set.attempt) {
      targetAttempt = await PositionAttempt.findById(set.attempt);
    }
    if (!targetAttempt) {
      targetAttempt = await PositionAttempt.findOne({ position: position._id, status: 'Active' });
    }
    if (!targetAttempt) {
      const latestAttempt = await PositionAttempt.findOne({ position: position._id }).sort({ attemptNumber: -1 });
      if (latestAttempt) {
        targetAttempt = latestAttempt;
      } else {
        const alloc = await PositionAttempt.allocateNextAttempt(position._id);
        targetAttempt = await PositionAttempt.create({
          attemptId: alloc.attemptId,
          position: position._id,
          jobOrderId: position.jobOrderId || '',
          attemptNumber: alloc.attemptNumber,
          attemptNumberFormatted: alloc.attemptNumberFormatted,
          status: 'Active',
          startDate: new Date(),
          primaryTA: position.assignee || (set.uploadedBy || null),
          outcome: 'In Progress',
          createdBy: 'System (Add CVs to Set)'
        });
      }
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided for upload.' });
    }

    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;
    const successful = [];
    const failed = [];

    // Optional sourcing TA attribution (preserves distinct sourcing TA)
    let sourcedBy = null;
    if (req.body.sourcedBy && mongoose.Types.ObjectId.isValid(req.body.sourcedBy)) {
      sourcedBy = req.body.sourcedBy;
    }

    // Default internal shortlist status: Shortlisted for CVs included in a client submission set
    const rawShortlistStatus = req.body.internalShortlistStatus || 'Shortlisted';
    const internalShortlistStatus =
      rawShortlistStatus === 'Internally Shortlisted'
        ? 'Shortlisted'
        : rawShortlistStatus === 'Not Shortlisted'
        ? 'Pending'
        : ['Pending', 'Shortlisted', 'Rejected'].includes(rawShortlistStatus)
        ? rawShortlistStatus
        : 'Shortlisted';
    const qualityRating = req.body.qualityRating || 'Not Rated';

    for (const file of files) {
      // 1. Content validation
      const validation = validateFileContent(file.buffer, file.originalname);
      if (!validation.valid) {
        failed.push({ fileName: file.originalname, error: validation.error });
        continue;
      }

      // 2. Hash computation
      const fileHash = generateFileHash(file.buffer);

      // 3. Duplicate check within this recruitment attempt / set
      const duplicate = await CandidateSubmission.findOne({
        attempt: targetAttempt._id,
        fileHash
      });

      if (duplicate) {
        failed.push({
          fileName: file.originalname,
          error: `Duplicate file: This exact CV content was already submitted to this recruitment attempt (${duplicate.originalFileName}).`
        });
        continue;
      }

      // 4. Generate R2 key
      const storageKey = generateR2StorageKey(
        position.jobOrderId,
        targetAttempt.attemptNumber,
        file.originalname
      );

      // 5. Upload to R2
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
        failed.push({
          fileName: file.originalname,
          error: r2Err.message || 'Failed to upload file to storage.'
        });
        continue;
      }

      // 6. Save CandidateSubmission record
      let submission = null;
      try {
        const now = new Date();
        submission = await CandidateSubmission.create({
          position: position._id,
          attempt: targetAttempt._id,
          submissionSet: set._id,
          submissionSetId: set.submissionSetId,
          setNumber: set.setNumber,
          originalFileName: file.originalname,
          unverifiedLabel: deriveUnverifiedLabel(file.originalname),
          nameIsVerified: false,
          fileHash,
          fileSize: file.size,
          mimeType: validation.detectedMimeType,
          r2StorageKey: storageKey,
          submittedBy: set.uploadedBy,
          sourcedBy: sourcedBy || null,
          uploadedAt: now,
          sentToClient: true,
          sentToClientDate: set.sentToClientAt, // preserves actual client sent date
          internalShortlistStatus,
          internalShortlistDate: internalShortlistStatus === 'Shortlisted' ? now : null,
          qualityRating: qualityRating || 'Not Rated',
          clientShortlistStatus: 'Pending'
        });
      } catch (dbErr) {
        if (r2Success) {
          try {
            await deleteFileFromR2({ key: storageKey, client: storageClient });
          } catch (_) {}
        }
        failed.push({
          fileName: file.originalname,
          error: `Database record creation failed: ${dbErr.message}`
        });
        continue;
      }

      successful.push({
        submissionId: submission._id,
        fileName: submission.originalFileName,
        candidateName: submission.unverifiedLabel,
        fileSize: submission.fileSize,
        uploadedAt: submission.uploadedAt
      });
    }

    // Update set cvCount atomically and sync Position CV counts
    if (successful.length > 0) {
      set.cvCount += successful.length;
      if (!set.attempt) set.attempt = targetAttempt._id;
      await set.save();
      // Populate Position's Activation Date when the first submission set is created
      // (unless the user has manually overridden the Activation Date)
      if (!position.activationDateManuallyOverridden) {
        const priorSetCount = await SubmissionSet.countDocuments({
          position: position._id,
          _id: { $ne: set._id }
        });
        if (priorSetCount === 0 || set.setSequence === 1) {
          await Position.updateOne(
            { _id: position._id, activationDateManuallyOverridden: { $ne: true } },
            { $set: { activatedAt: set.sentToClientAt } }
          );
        }
      }

      await syncPositionCvCounts(position._id);
    }

    const summary = {
      total: files.length,
      succeeded: successful.length,
      failed: failed.length
    };

    const status = failed.length === 0 ? 201 : (successful.length === 0 ? 400 : 207);

    return res.status(status).json({
      summary,
      successful,
      failed,
      set: {
        _id: set._id,
        submissionSetId: set.submissionSetId,
        setNumber: set.setNumber,
        cvCount: set.cvCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/submission-sets/create-with-upload
 * Combined endpoint: creates a submission set and uploads files in a single flow
 */
async function createSetWithUpload(req, res, injectedClient = null) {
  let allocatedSeq = null;
  let targetPositionId = null;

  try {
    const { positionId, sentToClientAt, uploadedBy, sourcingTAs, sourcedBy, notes, dailyActivityId } = req.body;

    if (!positionId || !mongoose.Types.ObjectId.isValid(positionId)) {
      return res.status(400).json({ error: 'Valid positionId is required.' });
    }

    if (!sentToClientAt) {
      return res.status(400).json({ error: 'sentToClientAt (date sent to client) is required.' });
    }

    const sentDate = new Date(sentToClientAt);
    if (isNaN(sentDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date for sentToClientAt.' });
    }

    const position = await Position.findById(positionId);
    if (!position) {
      return res.status(404).json({ error: 'Position not found.' });
    }

    let validUploadedBy = null;
    if (uploadedBy && mongoose.Types.ObjectId.isValid(uploadedBy)) {
      const ta = await TA.findById(uploadedBy);
      if (ta) validUploadedBy = ta._id;
    }

    // Parse multi-sourcing TAs
    let parsedSourcingTAs = [];
    if (Array.isArray(sourcingTAs)) {
      parsedSourcingTAs = sourcingTAs;
    } else if (typeof sourcingTAs === 'string') {
      try {
        const parsed = JSON.parse(sourcingTAs);
        if (Array.isArray(parsed)) parsedSourcingTAs = parsed;
        else if (mongoose.Types.ObjectId.isValid(sourcingTAs)) parsedSourcingTAs = [sourcingTAs];
      } catch (_) {
        if (mongoose.Types.ObjectId.isValid(sourcingTAs)) parsedSourcingTAs = [sourcingTAs];
        else if (sourcingTAs.includes(',')) {
          parsedSourcingTAs = sourcingTAs.split(',').map(s => s.trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
        }
      }
    }
    if (parsedSourcingTAs.length === 0 && sourcedBy && mongoose.Types.ObjectId.isValid(sourcedBy)) {
      parsedSourcingTAs = [sourcedBy];
    }
    parsedSourcingTAs = [...new Set(parsedSourcingTAs.filter(id => mongoose.Types.ObjectId.isValid(id)))];

    // Preserve individual candidate-level sourcing attribution:
    // If exactly one sourcing TA was selected for the set, attribute candidate to that TA.
    // If multiple TAs were selected, do not assign every selected TA to every candidate.
    const candidateSourcedBy = parsedSourcingTAs.length === 1 ? parsedSourcingTAs[0] : null;

    let targetAttempt = await PositionAttempt.findOne({ position: position._id, status: 'Active' });
    if (!targetAttempt) {
      const latestAttempt = await PositionAttempt.findOne({ position: position._id }).sort({ attemptNumber: -1 });
      if (latestAttempt) {
        targetAttempt = latestAttempt;
      } else {
        const alloc = await PositionAttempt.allocateNextAttempt(position._id);
        targetAttempt = await PositionAttempt.create({
          attemptId: alloc.attemptId,
          position: position._id,
          jobOrderId: position.jobOrderId || '',
          attemptNumber: alloc.attemptNumber,
          attemptNumberFormatted: alloc.attemptNumberFormatted,
          status: 'Active',
          startDate: new Date(),
          primaryTA: position.assignee || (parsedSourcingTAs[0] || validUploadedBy || null),
          outcome: 'In Progress',
          createdBy: 'System (CV Upload)'
        });
      }
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one CV file for this submission set.' });
    }

    targetPositionId = position._id;

    // 1. Allocate set number
    const allocation = await SubmissionSet.allocateNextSet(position._id);
    allocatedSeq = allocation.setSequence;

    // 2. Create SubmissionSet
    const set = await SubmissionSet.create({
      submissionSetId: allocation.submissionSetId,
      position: position._id,
      jobOrderId: position.jobOrderId,
      setNumber: allocation.setNumber,
      setSequence: allocation.setSequence,
      sentToClientAt: sentDate,
      uploadedAt: new Date(),
      uploadedBy: validUploadedBy,
      sourcingTAs: parsedSourcingTAs,
      cvCount: 0,
      notes: notes || '',
      attempt: targetAttempt._id,
      dailyActivity: dailyActivityId || null,
      createdBy: validUploadedBy || (parsedSourcingTAs[0] || null)
    });

    // 3. Upload files
    const storageClient = (injectedClient && typeof injectedClient.send === 'function') ? injectedClient : null;
    const successful = [];
    const failed = [];

    const internalShortlistStatus = req.body.internalShortlistStatus || 'Shortlisted';
    const qualityRating = req.body.qualityRating || 'Not Rated';

    for (const file of files) {
      const validation = validateFileContent(file.buffer, file.originalname);
      if (!validation.valid) {
        failed.push({ fileName: file.originalname, error: validation.error });
        continue;
      }

      const fileHash = generateFileHash(file.buffer);
      const duplicate = await CandidateSubmission.findOne({
        attempt: targetAttempt._id,
        fileHash
      });

      if (duplicate) {
        failed.push({
          fileName: file.originalname,
          error: `Duplicate file: exact CV already submitted (${duplicate.originalFileName}).`
        });
        continue;
      }

      const storageKey = generateR2StorageKey(
        position.jobOrderId,
        targetAttempt.attemptNumber,
        file.originalname
      );

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
        failed.push({ fileName: file.originalname, error: r2Err.message });
        continue;
      }

      try {
        const now = new Date();
        const submission = await CandidateSubmission.create({
          position: position._id,
          attempt: targetAttempt._id,
          submissionSet: set._id,
          submissionSetId: set.submissionSetId,
          setNumber: set.setNumber,
          originalFileName: file.originalname,
          unverifiedLabel: deriveUnverifiedLabel(file.originalname),
          nameIsVerified: false,
          fileHash,
          fileSize: file.size,
          mimeType: validation.detectedMimeType,
          r2StorageKey: storageKey,
          submittedBy: validUploadedBy,
          sourcedBy: candidateSourcedBy,
          uploadedAt: now,
          sentToClient: true,
          sentToClientDate: sentDate,
          internalShortlistStatus,
          internalShortlistDate: internalShortlistStatus === 'Shortlisted' ? now : null,
          qualityRating: qualityRating || 'Not Rated',
          clientShortlistStatus: 'Pending'
        });

        successful.push({
          submissionId: submission._id,
          fileName: submission.originalFileName,
          candidateName: submission.unverifiedLabel,
          fileSize: submission.fileSize
        });
      } catch (dbErr) {
        if (r2Success) {
          try {
            await deleteFileFromR2({ key: storageKey, client: storageClient });
          } catch (_) {}
        }
        failed.push({ fileName: file.originalname, error: dbErr.message });
      }
    }

    if (successful.length > 0) {
      set.cvCount = successful.length;
      await set.save();
      // Populate Position's Activation Date when the first submission set is created
    // (unless the user has manually overridden the Activation Date)
    if (!position.activationDateManuallyOverridden) {
      const priorSetCount = await SubmissionSet.countDocuments({
        position: position._id,
        _id: { $ne: set._id }
      });
      if (priorSetCount === 0 || allocation.setSequence === 1) {
        await Position.updateOne(
          { _id: position._id, activationDateManuallyOverridden: { $ne: true } },
          { $set: { activatedAt: sentDate } }
        );
      }
    }

    await syncPositionCvCounts(position._id);
    } else {
      // All files failed: delete empty set and rollback sequence
      await SubmissionSet.findByIdAndDelete(set._id);
      await SubmissionSet.rollbackSetSequence(position._id, allocatedSeq);
      return res.status(400).json({
        error: 'All file uploads failed. The submission set was not created.',
        failed
      });
    }

    const populated = await SubmissionSet.findById(set._id)
      .populate(SET_POPULATE)
      .lean();

    const status = failed.length === 0 ? 201 : 207;

    return res.status(status).json({
      set: populated,
      summary: {
        total: files.length,
        succeeded: successful.length,
        failed: failed.length
      },
      successful,
      failed
    });
  } catch (err) {
    if (targetPositionId && allocatedSeq) {
      await SubmissionSet.rollbackSetSequence(targetPositionId, allocatedSeq);
    }
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/submission-sets/positions/:positionId
 * Retrieves all submission sets for a position
 */
async function getPositionSets(req, res) {
  try {
    const { positionId } = req.params;
    const sets = await SubmissionSet.find({ position: positionId })
      .populate(SET_POPULATE)
      .sort({ setSequence: -1 })
      .lean();

    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/submission-sets/:id
 * Deletes a submission set and either deletes its CVs (default, deleteCvs=true)
 * or unlinks them into unassigned CVs (deleteCvs=false), then syncs position counts.
 */
async function deleteSubmissionSet(req, res) {
  try {
    const { id } = req.params;
    const deleteCvsParam = req.query?.deleteCvs ?? req.body?.deleteCvs;
    const shouldDeleteCvs =
      deleteCvsParam === undefined ||
      deleteCvsParam === true ||
      String(deleteCvsParam).toLowerCase() === 'true';

    const set = await SubmissionSet.findById(id);
    if (!set) {
      return res.status(404).json({ error: 'Submission set not found' });
    }

    const linkedSubmissions = await CandidateSubmission.find({
      $or: [
        { submissionSet: set._id },
        { position: set.position, setNumber: set.setNumber }
      ]
    }).lean();

    let deletedCvCount = 0;
    let unlinkedCvCount = 0;

    if (linkedSubmissions.length > 0) {
      const subIds = linkedSubmissions.map(s => s._id);
      if (shouldDeleteCvs) {
        // Best-effort cleanup of R2 storage files
        for (const sub of linkedSubmissions) {
          if (sub.r2StorageKey) {
            try {
              await deleteFileFromR2(sub.r2StorageKey);
            } catch (_) {
              // Continue deleting DB records even if R2 object is already absent or unconfigured
            }
          }
        }
        const delRes = await CandidateSubmission.deleteMany({ _id: { $in: subIds } });
        deletedCvCount = delRes.deletedCount || linkedSubmissions.length;
      } else {
        const updRes = await CandidateSubmission.updateMany(
          { _id: { $in: subIds } },
          {
            $set: {
              submissionSet: null,
              submissionSetId: null,
              setNumber: null
            }
          }
        );
        unlinkedCvCount = updRes.modifiedCount || linkedSubmissions.length;
      }
    }

    const positionId = set.position;
    await SubmissionSet.findByIdAndDelete(set._id);

    // Sync the position's sequential set counter to the highest remaining setSequence
    try {
      const latestRemaining = await SubmissionSet.findOne({ position: positionId })
        .sort({ setSequence: -1 })
        .lean();
      const maxRemainingSeq = latestRemaining ? (Number(latestRemaining.setSequence) || 0) : 0;
      await ActivityCounter.findOneAndUpdate(
        { name: `submission_set_${positionId}` },
        { $set: { seq: maxRemainingSeq } },
        { upsert: true }
      );
    } catch (_) {}

    await syncPositionCvCounts(positionId);

    res.json({
      message: shouldDeleteCvs
        ? `Deleted ${set.setNumber} and ${deletedCvCount} CV(s) successfully`
        : `Deleted ${set.setNumber} and kept ${unlinkedCvCount} CV(s) as unassigned`,
      deletedSetId: set._id,
      setNumber: set.setNumber,
      deletedCvCount,
      unlinkedCvCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PUT / PATCH /api/submission-sets/:id
 * Updates a submission set (e.g. sentToClientAt, notes, sourcingTAs).
 * If the first submission set's sentToClientAt is modified and the position's Activation Date
 * has not been manually overridden, updates the position's Activation Date accordingly.
 */
async function updateSubmissionSet(req, res) {
  try {
    const { id } = req.params;
    const { sentToClientAt, notes, sourcingTAs } = req.body;

    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submissionSetId: id };
    const set = await SubmissionSet.findOne(query);
    if (!set) {
      return res.status(404).json({ error: 'Submission set not found' });
    }

    if (sentToClientAt !== undefined) {
      const sentDate = new Date(sentToClientAt);
      if (isNaN(sentDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date provided for sentToClientAt.' });
      }
      set.sentToClientAt = sentDate;

      // Update linked candidate submissions' sentToClientDate
      await CandidateSubmission.updateMany(
        { submissionSet: set._id },
        { $set: { sentToClientDate: sentDate } }
      );

      // Check if this is the first submission set for the position
      const firstSet = await SubmissionSet.findOne({ position: set.position })
        .sort({ setSequence: 1, createdAt: 1 })
        .select('_id')
        .lean();

      const isFirstSet = set.setSequence === 1 || (firstSet && String(firstSet._id) === String(set._id));
      if (isFirstSet) {
        const position = await Position.findById(set.position).select('_id activationDateManuallyOverridden').lean();
        if (position && !position.activationDateManuallyOverridden) {
          await Position.updateOne(
            { _id: set.position, activationDateManuallyOverridden: { $ne: true } },
            { $set: { activatedAt: sentDate } }
          );
        }
      }
    }

    if (notes !== undefined) {
      set.notes = notes;
    }

    if (sourcingTAs !== undefined) {
      let parsed = [];
      if (Array.isArray(sourcingTAs)) {
        parsed = sourcingTAs;
      } else if (typeof sourcingTAs === 'string') {
        try {
          const jsonParsed = JSON.parse(sourcingTAs);
          if (Array.isArray(jsonParsed)) parsed = jsonParsed;
        } catch (_) {}
      }
      set.sourcingTAs = [...new Set(parsed.filter(taId => mongoose.Types.ObjectId.isValid(taId)))];
    }

    await set.save();
    await syncPositionCvCounts(set.position);

    const populated = await SubmissionSet.findById(set._id)
      .populate(SET_POPULATE)
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getSubmissionSets,
  getSubmissionSetById,
  createSubmissionSet,
  uploadCvsToSet,
  createSetWithUpload,
  getPositionSets,
  updateSubmissionSet,
  deleteSubmissionSet,
  computeSetMetrics
};
