const WeeklyAllocation = require('../models/WeeklyAllocation');
const TA = require('../models/TA');
const Position = require('../models/Position');

const defaultDays = {
  mon: { position: null, isAutoFilled: false },
  tue: { position: null, isAutoFilled: false },
  wed: { position: null, isAutoFilled: false },
  thu: { position: null, isAutoFilled: false },
  fri: { position: null, isAutoFilled: false },
  sat: { position: null, isAutoFilled: false },
  sun: { position: null, isAutoFilled: false }
};

// GET grid for a given weekStart/weekEnd (creates empty rows on the fly if needed)
async function getGridForWeek(req, res) {
  try {
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'weekStart and weekEnd query parameters are required' });
    }

    const start = new Date(weekStart);
    const end = new Date(weekEnd);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid Date format for weekStart or weekEnd' });
    }

    const activeTAs = await TA.find({ status: 'Active' }).sort({ name: 1 });

    const grid = await Promise.all(activeTAs.map(async (ta) => {
      return await WeeklyAllocation.findOneAndUpdate(
        { ta: ta._id, weekStart: start },
        {
          $setOnInsert: {
            weekEnd: end,
            days: defaultDays
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .populate('ta', 'name status')
      .populate({
        path: 'days.mon.position days.tue.position days.wed.position days.thu.position days.fri.position days.sat.position days.sun.position',
        select: 'jobOrderId position pLevel lsCount cvCount client',
        populate: {
          path: 'client',
          select: 'clientName'
        }
      });
    }));

    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT update a specific day's allocation cell (manual override)
async function updateCell(req, res) {
  try {
    const { taId, weekStart } = req.params;
    const { day, positionId } = req.body;

    if (!day) {
      return res.status(400).json({ error: 'day is required in the body' });
    }

    const start = new Date(weekStart);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid weekStart date format' });
    }

    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    if (!validDays.includes(day)) {
      return res.status(400).json({ error: `Invalid day. Must be one of: ${validDays.join(', ')}` });
    }

    const updateObj = {
      [`days.${day}.position`]: positionId || null,
      [`days.${day}.isAutoFilled`]: false
    };

    const updated = await WeeklyAllocation.findOneAndUpdate(
      { ta: taId, weekStart: start },
      { $set: updateObj },
      { new: true, runValidators: true }
    )
    .populate('ta', 'name status')
    .populate({
      path: 'days.mon.position days.tue.position days.wed.position days.thu.position days.fri.position days.sat.position days.sun.position',
      select: 'jobOrderId position pLevel lsCount cvCount client',
      populate: {
        path: 'client',
        select: 'clientName'
      }
    });

    if (!updated) {
      return res.status(404).json({ error: 'Weekly allocation not found for this TA and week.' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST autofill empty or previously auto-filled days for all active TAs
async function autofillWeek(req, res) {
  try {
    const { weekStart, weekEnd } = req.body;

    if (!weekStart) {
      return res.status(400).json({ error: 'weekStart is required in the body' });
    }

    const start = new Date(weekStart);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid weekStart date format' });
    }

    let end;
    if (weekEnd) {
      end = new Date(weekEnd);
    } else {
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    }

    const activeTAs = await TA.find({ status: 'Active' });

    // Seed allocations for each active TA
    await Promise.all(activeTAs.map(async (ta) => {
      // Find the most recently updated active position assigned to this TA
      const activePositions = await Position.find({
        assignee: ta._id,
        status: { $nin: ['Placed', 'Lost'] }
      }).sort({ updatedAt: -1 });

      // Find or create the allocation row safely
      const allocation = await WeeklyAllocation.findOneAndUpdate(
        { ta: ta._id, weekStart: start },
        {
          $setOnInsert: {
            weekEnd: end,
            days: defaultDays
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (activePositions.length > 0) {
        const posId = activePositions[0]._id;
        let changed = false;
        const daysList = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

        for (const d of daysList) {
          const dayCell = allocation.days[d];
          // Fill only if empty or if previously auto-filled (do not overwrite manual overrides)
          if (dayCell.position === null || dayCell.isAutoFilled === true) {
            if (String(dayCell.position) !== String(posId)) {
              dayCell.position = posId;
              dayCell.isAutoFilled = true;
              changed = true;
            }
          }
        }

        if (changed) {
          await allocation.save();
        }
      }
    }));

    // Fetch and return the fully populated grid
    const grid = await Promise.all(activeTAs.map(async (ta) => {
      return await WeeklyAllocation.findOne({ ta: ta._id, weekStart: start })
        .populate('ta', 'name status')
        .populate({
          path: 'days.mon.position days.tue.position days.wed.position days.thu.position days.fri.position days.sat.position days.sun.position',
          select: 'jobOrderId position pLevel lsCount cvCount client',
          populate: {
            path: 'client',
            select: 'clientName'
          }
        });
    }));

    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getGridForWeek,
  updateCell,
  autofillWeek
};
