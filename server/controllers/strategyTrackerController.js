const Strategy = require('../models/Strategy');
const PositionStrategy = require('../models/PositionStrategy');

// GET /strategies – all active strategies sorted by order
async function getStrategies(req, res) {
  try {
    const strategies = await Strategy.find({ active: true }).sort({ order: 1 });
    res.json(strategies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /entries – all PositionStrategy docs as lean JSON (for list page progress/filters)
async function getEntries(req, res) {
  try {
    const entries = await PositionStrategy.find()
      .lean()
      .select('position strategy status assignees assignedDate doneDate');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /positions/:positionId – ensure rows exist, return populated for this position
async function getPositionEntries(req, res) {
  try {
    const { positionId } = req.params;

    // 1. Load active strategies
    const strategies = await Strategy.find({ active: true }).sort({ order: 1 });

    // 2. Upsert missing rows (race-safe via unique index + $setOnInsert)
    if (strategies.length > 0) {
      const bulkOps = strategies.map((strat) => ({
        updateOne: {
          filter: { position: positionId, strategy: strat._id },
          update: {
            $setOnInsert: {
              position: positionId,
              strategy: strat._id,
              status: 'not_started',
              assignees: [],
              assignedDate: null,
              doneDate: null,
              note: ''
            }
          },
          upsert: true
        }
      }));
      await PositionStrategy.bulkWrite(bulkOps, { ordered: false });
    }

    // 3. Return this position's rows, sorted by strategy order, populated
    const entries = await PositionStrategy.find({ position: positionId })
      .populate({ path: 'strategy', select: 'name order active' })
      .populate({ path: 'assignees', select: 'name status color' })
      .sort({ 'strategy.order': 1 })
      .lean();

    // Sort by strategy order in JS since populate doesn't guarantee sort on nested field
    entries.sort((a, b) => (a.strategy?.order ?? 0) - (b.strategy?.order ?? 0));

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /entries/:id – update a PositionStrategy entry
async function updateEntry(req, res) {
  try {
    const { id } = req.params;
    const { status, assignees, assignedDate, doneDate, note } = req.body;

    const entry = await PositionStrategy.findById(id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const validStatuses = ['not_started', 'in_progress', 'done', 'na'];

    // Validate status
    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
      const previousStatus = entry.status;
      entry.status = status;

      // If transitioning TO done and no doneDate provided/already set
      if (status === 'done') {
        if (doneDate === undefined && !entry.doneDate) {
          entry.doneDate = new Date();
        }
      }

      // If transitioning AWAY from done
      if (previousStatus === 'done' && status !== 'done') {
        if (doneDate === undefined) {
          entry.doneDate = null;
        }
      }
    }

    if (assignees !== undefined) {
      entry.assignees = assignees;
      // Auto-set assignedDate if now non-empty and none was already set
      if (assignees.length > 0 && !entry.assignedDate && assignedDate === undefined) {
        entry.assignedDate = new Date();
      }
    }

    // Explicit date overrides (can also be null to clear)
    if (assignedDate !== undefined) {
      entry.assignedDate = assignedDate ? new Date(assignedDate) : null;
    }
    if (doneDate !== undefined) {
      entry.doneDate = doneDate ? new Date(doneDate) : null;
    }

    if (note !== undefined) {
      entry.note = note;
    }

    await entry.save();

    const populated = await PositionStrategy.findById(entry._id)
      .populate({ path: 'strategy', select: 'name order active' })
      .populate({ path: 'assignees', select: 'name status color' })
      .lean();

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getStrategies,
  getEntries,
  getPositionEntries,
  updateEntry
};
