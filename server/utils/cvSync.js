const mongoose = require('mongoose');
const Position = require('../models/Position');
const CandidateSubmission = require('../models/CandidateSubmission');
const SubmissionSet = require('../models/SubmissionSet');
const liveEvents = require('./liveEvents');

/**
 * Synchronizes a Position's cvCount (Int Shortlist), extShortlistCount (Ext Shortlist),
 * and its SubmissionSets' cvCount fields based on actual CandidateSubmission records.
 * Safe to call in mocked unit tests (no-ops if DB is disconnected or ID is invalid).
 */
async function syncPositionCvCounts(positionId) {
  try {
    if (!positionId || !mongoose.Types.ObjectId.isValid(String(positionId))) {
      return null;
    }
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return null;
    }

    const [posDoc, submissions, sets] = await Promise.all([
      Position.findById(positionId)
        .select('_id activatedAt activationDateManuallyOverridden')
        .lean(),
      CandidateSubmission.find({ position: positionId })
        .select('_id submissionSet setNumber internalShortlistStatus qualityRating sentToClient clientShortlistStatus isWithdrawn')
        .lean(),
      SubmissionSet.find({ position: positionId })
        .sort({ setSequence: 1, createdAt: 1 })
        .lean()
    ]);

    if (!Array.isArray(submissions) || !Array.isArray(sets)) {
      return null;
    }

    // Normalize any Pending submissions in sets or sentToClient to Shortlisted
    const pendingToPromoteIds = submissions
      .filter(s => s.internalShortlistStatus === 'Pending' && (s.submissionSet || s.setNumber || s.sentToClient))
      .map(s => s._id);
    if (pendingToPromoteIds.length > 0) {
      await CandidateSubmission.updateMany(
        { _id: { $in: pendingToPromoteIds } },
        { $set: { internalShortlistStatus: 'Shortlisted', internalShortlistDate: new Date() } }
      );
      for (const sub of submissions) {
        if (pendingToPromoteIds.some(id => String(id) === String(sub._id))) {
          sub.internalShortlistStatus = 'Shortlisted';
        }
      }
    }

    const setIdByNumber = new Map();
    for (const set of sets) {
      if (set.setNumber) setIdByNumber.set(set.setNumber, String(set._id));
    }

    // 1. Sync each SubmissionSet's cvCount with actual non-rejected submissions in that set
    const setCountsMap = new Map();
    for (const sub of submissions) {
      if (sub.internalShortlistStatus === 'Rejected') continue;
      const key = sub.submissionSet
        ? String(sub.submissionSet)
        : (sub.setNumber ? setIdByNumber.get(sub.setNumber) : null);
      if (key) {
        setCountsMap.set(key, (setCountsMap.get(key) || 0) + 1);
      }
    }

    const setUpdatePromises = [];
    let setsTotalCvCount = 0;
    for (const set of sets) {
      const hasMatchedSubs = setCountsMap.has(String(set._id));
      const actualSetCount = hasMatchedSubs ? setCountsMap.get(String(set._id)) : (submissions.length > 0 ? 0 : (set.cvCount || 0));
      setsTotalCvCount += actualSetCount;
      if (set.cvCount !== actualSetCount) {
        setUpdatePromises.push(
          SubmissionSet.updateOne({ _id: set._id }, { $set: { cvCount: actualSetCount } })
        );
      }
    }
    if (setUpdatePromises.length > 0) {
      await Promise.all(setUpdatePromises);
    }

    // 2. Compute Position-level Int Shortlist (cvCount) and Ext Shortlist (extShortlistCount)
    const activeSubmissions = submissions.filter(s => s.internalShortlistStatus !== 'Rejected');
    const intShortlistCount = Math.max(activeSubmissions.length, setsTotalCvCount);

    const clientShortlistedCount = activeSubmissions.filter(
      s => s.clientShortlistStatus === 'Shortlisted'
    ).length;

    const hasClientReview = activeSubmissions.some(
      s => s.clientShortlistStatus === 'Client Review' || s.clientShortlistStatus === 'Review'
    );

    let extShortlistVal = 0;
    if (clientShortlistedCount > 0) {
      extShortlistVal = clientShortlistedCount;
    } else if (hasClientReview) {
      extShortlistVal = 'Client Review';
    } else {
      extShortlistVal = 0;
    }

    const updateFields = {
      cvCount: intShortlistCount,
      extShortlistCount: extShortlistVal
    };

    // Sync system-managed Activation Date from the first submission set's sentToClientAt
    // unless the user has manually overridden the Activation Date
    if (posDoc && !posDoc.activationDateManuallyOverridden) {
      const firstSet = sets[0];
      if (firstSet && firstSet.sentToClientAt) {
        updateFields.activatedAt = firstSet.sentToClientAt;
      }
    }

    await Position.updateOne(
      { _id: positionId },
      { $set: updateFields }
    );

    try {
      liveEvents.emit('positions:changed');
    } catch (_) {}

    return {
      cvCount: intShortlistCount,
      extShortlistCount: extShortlistVal
    };
  } catch (err) {
    console.warn('[cvSync] Non-fatal error syncing position CV counts:', err.message);
    return null;
  }
}

/**
 * Enriches an array of lean Position documents with live CV counts and SET-wise breakdown.
 * If a position has CandidateSubmission records (or SubmissionSet records), its cvCount and
 * extShortlistCount are derived from those records (and synced in the background if stale).
 * Legacy positions with 0 submissions and 0 sets keep their existing cvCount / extShortlistCount.
 */
async function enrichPositionsWithCvAndSetMetrics(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return positions;
  }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return positions;
  }

  try {
    const posIds = positions.map(p => p._id).filter(Boolean);
    if (posIds.length === 0) return positions;

    const [allSubmissions, allSets] = await Promise.all([
      CandidateSubmission.find({ position: { $in: posIds } })
        .select('_id position submissionSet setNumber internalShortlistStatus qualityRating sentToClient clientShortlistStatus isWithdrawn')
        .lean(),
      SubmissionSet.find({ position: { $in: posIds } })
        .select('_id position submissionSetId setNumber setSequence cvCount sentToClientAt')
        .sort({ setSequence: 1 })
        .lean()
    ]);

    const pendingPromoteIds = [];
    const subsByPos = new Map();
    for (const sub of allSubmissions) {
      if (sub.internalShortlistStatus === 'Pending' && (sub.submissionSet || sub.setNumber || sub.sentToClient)) {
        sub.internalShortlistStatus = 'Shortlisted';
        pendingPromoteIds.push(sub._id);
      }
      const key = String(sub.position);
      if (!subsByPos.has(key)) subsByPos.set(key, []);
      subsByPos.get(key).push(sub);
    }

    if (pendingPromoteIds.length > 0) {
      CandidateSubmission.updateMany(
        { _id: { $in: pendingPromoteIds } },
        { $set: { internalShortlistStatus: 'Shortlisted', internalShortlistDate: new Date() } }
      ).catch(() => {});
    }

    const setsByPos = new Map();
    for (const set of allSets) {
      const key = String(set.position);
      if (!setsByPos.has(key)) setsByPos.set(key, []);
      setsByPos.get(key).push(set);
    }

    const bulkPosUpdates = [];

    const enriched = positions.map(pos => {
      const posKey = String(pos._id);
      const posSubs = subsByPos.get(posKey) || [];
      const posSets = setsByPos.get(posKey) || [];

      // Determine system-managed Activation Date from first submission set if not manually overridden
      let liveActivatedAt = pos.activatedAt || null;
      let activatedAtNeedsSync = false;
      if (!pos.activationDateManuallyOverridden && posSets.length > 0 && posSets[0].sentToClientAt) {
        const firstSentDate = new Date(posSets[0].sentToClientAt);
        if (!isNaN(firstSentDate.getTime())) {
          const currentActStr = pos.activatedAt ? new Date(pos.activatedAt).toISOString().split('T')[0] : '';
          const firstSentStr = firstSentDate.toISOString().split('T')[0];
          if (currentActStr !== firstSentStr) {
            liveActivatedAt = firstSentDate;
            activatedAtNeedsSync = true;
          }
        }
      }

      // If no tracked submissions and no sets exist, preserve legacy manual counters
      if (posSubs.length === 0 && posSets.length === 0) {
        return {
          ...pos,
          submissionSets: [],
          unassignedCvCount: 0
        };
      }

      const setIdByNumber = new Map();
      for (const set of posSets) {
        if (set.setNumber) setIdByNumber.set(set.setNumber, String(set._id));
      }

      const activeSubs = posSubs.filter(s => s.internalShortlistStatus !== 'Rejected');

      // Compute per-set counts
      const subCountBySetId = new Map();
      const goodCountBySetId = new Map();
      const extCountBySetId = new Map();
      let unassignedCvCount = 0;

      for (const sub of activeSubs) {
        const sKey = sub.submissionSet
          ? String(sub.submissionSet)
          : (sub.setNumber ? setIdByNumber.get(sub.setNumber) : null);
        if (sKey) {
          subCountBySetId.set(sKey, (subCountBySetId.get(sKey) || 0) + 1);
          if (sub.qualityRating === 'Good') {
            goodCountBySetId.set(sKey, (goodCountBySetId.get(sKey) || 0) + 1);
          }
          if (sub.clientShortlistStatus === 'Shortlisted') {
            extCountBySetId.set(sKey, (extCountBySetId.get(sKey) || 0) + 1);
          }
        } else {
          unassignedCvCount++;
        }
      }

      const submissionSetsSummary = posSets.map(set => {
        const sKey = String(set._id);
        const matchedSubCount = subCountBySetId.get(sKey) || 0;
        const liveCount = matchedSubCount > 0 ? matchedSubCount : (posSubs.length === 0 ? (set.cvCount || 0) : 0);
        return {
          _id: set._id,
          submissionSetId: set.submissionSetId,
          setNumber: set.setNumber,
          setSequence: set.setSequence,
          cvCount: liveCount,
          goodCvCount: goodCountBySetId.get(sKey) || 0,
          clientShortlistedCount: extCountBySetId.get(sKey) || 0,
          sentToClientAt: set.sentToClientAt
        };
      });

      const setsTotalCvCount = submissionSetsSummary.reduce((sum, s) => sum + (s.cvCount || 0), 0);
      const liveCvCount = Math.max(activeSubs.length, setsTotalCvCount + unassignedCvCount);

      const clientShortlistedCount = activeSubs.filter(
        s => s.clientShortlistStatus === 'Shortlisted'
      ).length;
      const hasClientReview = activeSubs.some(
        s => s.clientShortlistStatus === 'Client Review' || s.clientShortlistStatus === 'Review'
      );

      let liveExtShortlist = pos.extShortlistCount;
      if (posSubs.length > 0) {
        if (clientShortlistedCount > 0) {
          liveExtShortlist = clientShortlistedCount;
        } else if (hasClientReview) {
          liveExtShortlist = 'Client Review';
        } else if (pos.extShortlistCount === 'Client Review') {
          liveExtShortlist = 'Client Review';
        } else {
          liveExtShortlist = 0;
        }
      }

      if (pos.cvCount !== liveCvCount || String(pos.extShortlistCount ?? '') !== String(liveExtShortlist ?? '') || activatedAtNeedsSync) {
        const setPayload = { cvCount: liveCvCount, extShortlistCount: liveExtShortlist };
        if (activatedAtNeedsSync) {
          setPayload.activatedAt = liveActivatedAt;
        }
        bulkPosUpdates.push({
          updateOne: {
            filter: { _id: pos._id },
            update: { $set: setPayload }
          }
        });
      }

      return {
        ...pos,
        activatedAt: liveActivatedAt,
        cvCount: liveCvCount,
        extShortlistCount: liveExtShortlist,
        submissionSets: submissionSetsSummary,
        unassignedCvCount
      };
    });

    if (bulkPosUpdates.length > 0) {
      Position.bulkWrite(bulkPosUpdates, { ordered: false }).catch(() => {});
    }

    return enriched;
  } catch (err) {
    console.warn('[cvSync] Non-fatal error enriching positions:', err.message);
    return positions;
  }
}

/**
 * One-time startup reconciliation: promotes any Pending submissions in SubmissionSets
 * to Shortlisted and synchronizes cvCount / extShortlistCount across all positions.
 */
async function syncAllPositionsAndSubmissionsOnStartup() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
  try {
    await CandidateSubmission.updateMany(
      {
        internalShortlistStatus: 'Pending',
        $or: [
          { submissionSet: { $ne: null } },
          { setNumber: { $ne: null } },
          { sentToClient: true }
        ]
      },
      {
        $set: {
          internalShortlistStatus: 'Shortlisted',
          internalShortlistDate: new Date()
        }
      }
    );

    const allPositions = await Position.find({}).select('_id cvCount extShortlistCount').lean();
    await enrichPositionsWithCvAndSetMetrics(allPositions);
  } catch (err) {
    console.warn('[cvSync] Startup reconciliation warning:', err.message);
  }
}

module.exports = {
  syncPositionCvCounts,
  enrichPositionsWithCvAndSetMetrics,
  syncAllPositionsAndSubmissionsOnStartup
};
