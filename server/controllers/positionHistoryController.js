const PositionHistory = require('../models/PositionHistory');

// GET full change history for one position
async function getHistoryForPosition(req, res) {
  try {
    const { positionId } = req.params;
    const history = await PositionHistory.find({ position: positionId })
      .sort({ changedAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getHistoryForPosition };
