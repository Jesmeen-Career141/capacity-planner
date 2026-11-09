const PositionHistory = require('../models/PositionHistory');
const TA = require('../models/TA');

// GET full change history for one position
async function getHistoryForPosition(req, res) {
  try {
    const { positionId } = req.params;
    const history = await PositionHistory.find({ position: positionId })
      .sort({ changedAt: -1 })
      .lean();

    // Collect all unique TA ObjectIds from assignee fields
    const taIds = new Set();
    for (const h of history) {
      if (h.field === 'assignee') {
        if (h.oldValue && /^[0-9a-fA-F]{24}$/.test(h.oldValue.trim())) taIds.add(h.oldValue.trim());
        if (h.newValue && /^[0-9a-fA-F]{24}$/.test(h.newValue.trim())) taIds.add(h.newValue.trim());
      }
    }

    let taMap = {};
    if (taIds.size > 0) {
      const tas = await TA.find({ _id: { $in: Array.from(taIds) } }).select('name').lean();
      tas.forEach(t => {
        taMap[String(t._id)] = t.name;
      });
    }

    // Attach resolved labels for display convenience while preserving raw values
    const enriched = history.map(h => {
      if (h.field === 'assignee') {
        return {
          ...h,
          resolvedOldValue: taMap[h.oldValue] || h.oldValue,
          resolvedNewValue: taMap[h.newValue] || h.newValue
        };
      }
      return h;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getHistoryForPosition };
