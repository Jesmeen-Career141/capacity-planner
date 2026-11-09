const mongoose = require('mongoose');
const { Placement, PLACEMENT_STATUS_VALUES } = require('../models/Placement');
const CandidateSubmission = require('../models/CandidateSubmission');
const Position = require('../models/Position');
const PositionAttempt = require('../models/PositionAttempt');
const Client = require('../models/Client');
const TA = require('../models/TA');
const { getNextSequence } = require('../models/ActivityCounter');

/**
 * 1. Record a New Placement
 */
exports.createPlacement = async (req, res) => {
  try {
    const {
      candidateSubmissionId,
      positionId,
      attemptId,
      placementDate,
      placementDateStr,
      status = 'Joined',
      salary = 0,
      packageDetails = '',
      billingAmount = 0,
      notes = '',
      placedById = null,
      closeAttempt = false,
      closePosition = false,
      createdBy = 'Coordinator'
    } = req.body;

    if (!candidateSubmissionId) {
      return res.status(400).json({ error: 'candidateSubmissionId is required' });
    }
    if (!positionId) {
      return res.status(400).json({ error: 'positionId is required' });
    }
    if (!PLACEMENT_STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${PLACEMENT_STATUS_VALUES.join(', ')}` });
    }

    const [candidateSub, pos] = await Promise.all([
      CandidateSubmission.findById(candidateSubmissionId),
      Position.findById(positionId).populate('client', 'clientName').populate('assignee', 'name')
    ]);

    if (!candidateSub) {
      return res.status(404).json({ error: 'Candidate submission not found' });
    }
    if (!pos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Resolve Attempt
    let targetAttempt = null;
    if (attemptId && mongoose.Types.ObjectId.isValid(attemptId)) {
      targetAttempt = await PositionAttempt.findById(attemptId);
    } else if (candidateSub.attempt) {
      targetAttempt = await PositionAttempt.findById(candidateSub.attempt);
    } else {
      // Find active attempt for position
      targetAttempt = await PositionAttempt.findOne({ position: pos._id, status: 'Active' });
      if (!targetAttempt) {
        // Fallback to latest attempt
        targetAttempt = await PositionAttempt.findOne({ position: pos._id }).sort({ attemptNumber: -1 });
      }
    }

    if (!targetAttempt) {
      return res.status(400).json({ error: 'No recruitment attempt found for this position to associate the placement.' });
    }

    // Check if this candidate is already recorded as placed
    const existingPlacement = await Placement.findOne({
      candidateSubmission: candidateSub._id,
      position: pos._id
    });

    if (existingPlacement) {
      return res.status(409).json({
        error: `Candidate is already placed under this position (${existingPlacement.placementId}).`
      });
    }

    const actualDate = placementDate ? new Date(placementDate) : new Date();
    const actualDateStr = placementDateStr || actualDate.toISOString().split('T')[0];

    const placementId = await getNextSequence('placement', 'PLC-', 4);

    const candidateName = candidateSub.unverifiedLabel ||
      candidateSub.originalFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    const newPlacement = new Placement({
      placementId,
      candidateSubmission: candidateSub._id,
      candidateName,
      position: pos._id,
      jobOrderId: pos.jobOrderId,
      positionName: pos.position,
      client: pos.client?._id || candidateSub.position,
      clientName: pos.client?.clientName || 'Unknown Client',
      attempt: targetAttempt._id,
      attemptId: targetAttempt.attemptId || null,
      attemptNumber: targetAttempt.attemptNumber,
      placedBy: placedById || targetAttempt.primaryTA || pos.assignee?._id || null,
      sourcingTA: candidateSub.sourcedBy || candidateSub.submittedBy || null,
      placementDate: actualDate,
      placementDateStr: actualDateStr,
      status,
      salary: Number(salary) || 0,
      packageDetails: packageDetails.trim(),
      billingAmount: Number(billingAmount) || 0,
      notes: notes.trim(),
      createdBy
    });

    await newPlacement.save();

    // Update candidate submission
    candidateSub.isPlaced = true;
    candidateSub.placementDate = actualDate;
    candidateSub.placement = newPlacement._id;
    await candidateSub.save();

    // Increment attempt placement count
    targetAttempt.placementCount = (targetAttempt.placementCount || 0) + 1;
    if (closeAttempt) {
      targetAttempt.status = 'Completed';
      targetAttempt.outcome = 'Placed';
      targetAttempt.endDate = actualDate;
    }
    await targetAttempt.save();

    // Update Position placedAt if requested or if not previously set
    if (closePosition) {
      pos.status = 'Placed';
      pos.placedAt = actualDate;
      await pos.save();
    } else if (!pos.placedAt) {
      pos.placedAt = actualDate;
      await pos.save();
    }

    const populated = await Placement.findById(newPlacement._id)
      .populate('client', 'clientName')
      .populate('position', 'jobOrderId position pLevel status')
      .populate('attempt', 'attemptNumber attemptNumberFormatted attemptId status')
      .populate('placedBy', 'name color')
      .populate('sourcingTA', 'name color')
      .lean();

    res.status(201).json({
      message: 'Placement recorded successfully',
      placement: populated
    });
  } catch (err) {
    console.error('Error creating placement:', err);
    res.status(500).json({ error: 'Failed to record placement', details: err.message });
  }
};

/**
 * 2. Get Placements with Filtering & Pagination
 */
exports.getPlacements = async (req, res) => {
  try {
    const {
      client,
      position,
      attempt,
      ta,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (client && mongoose.Types.ObjectId.isValid(client)) query.client = client;
    if (position && mongoose.Types.ObjectId.isValid(position)) query.position = position;
    if (attempt && mongoose.Types.ObjectId.isValid(attempt)) query.attempt = attempt;
    if (ta && mongoose.Types.ObjectId.isValid(ta)) {
      query.$or = [{ placedBy: ta }, { sourcingTA: ta }];
    }

    if (dateFrom || dateTo) {
      query.placementDate = {};
      if (dateFrom) query.placementDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const dTo = new Date(dateTo);
        dTo.setHours(23, 59, 59, 999);
        query.placementDate.$lte = dTo;
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      const sRegex = { $regex: s, $options: 'i' };
      const searchConditions = [
        { candidateName: sRegex },
        { jobOrderId: sRegex },
        { clientName: sRegex },
        { placementId: sRegex }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [placements, total] = await Promise.all([
      Placement.find(query)
        .populate('client', 'clientName')
        .populate('position', 'jobOrderId position pLevel status')
        .populate('attempt', 'attemptNumber attemptNumberFormatted attemptId status')
        .populate('placedBy', 'name color')
        .populate('sourcingTA', 'name color')
        .sort({ placementDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Placement.countDocuments(query)
    ]);

    res.json({
      placements,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (err) {
    console.error('Error fetching placements:', err);
    res.status(500).json({ error: 'Failed to fetch placements', details: err.message });
  }
};

/**
 * 3. Get Single Placement by ID
 */
exports.getPlacementById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { placementId: id };

    const placement = await Placement.findOne(query)
      .populate('client', 'clientName')
      .populate('position', 'jobOrderId position pLevel status assignee')
      .populate('attempt', 'attemptNumber attemptNumberFormatted attemptId status primaryTA')
      .populate('placedBy', 'name color')
      .populate('sourcingTA', 'name color')
      .populate('candidateSubmission', 'originalFileName unverifiedLabel qualityRating')
      .lean();

    if (!placement) {
      return res.status(404).json({ error: 'Placement not found' });
    }

    res.json(placement);
  } catch (err) {
    console.error('Error fetching placement by ID:', err);
    res.status(500).json({ error: 'Failed to retrieve placement', details: err.message });
  }
};

/**
 * 4. Update Placement Details
 */
exports.updatePlacement = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, salary, packageDetails, billingAmount, notes } = req.body;

    const placement = await Placement.findById(id);
    if (!placement) {
      return res.status(404).json({ error: 'Placement not found' });
    }

    if (status && PLACEMENT_STATUS_VALUES.includes(status)) {
      placement.status = status;
    }
    if (salary !== undefined) placement.salary = Number(salary) || 0;
    if (packageDetails !== undefined) placement.packageDetails = packageDetails.trim();
    if (billingAmount !== undefined) placement.billingAmount = Number(billingAmount) || 0;
    if (notes !== undefined) placement.notes = notes.trim();

    await placement.save();

    res.json({
      message: 'Placement updated successfully',
      placement
    });
  } catch (err) {
    console.error('Error updating placement:', err);
    res.status(500).json({ error: 'Failed to update placement', details: err.message });
  }
};
