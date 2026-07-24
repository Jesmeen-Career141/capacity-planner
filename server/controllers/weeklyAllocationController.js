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

// ---- UTC‑based helpers ----
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function toISODate(date) {
  return date.toISOString().split('T')[0];
}

// ---- Existing getGridForWeek (now uses UTC helpers) ----
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

    const activeTAs = await TA.find({ status: 'Active' }).sort({ name: 1, _id: 1 });
    const taIds = activeTAs.map(ta => ta._id);

    const existing = await WeeklyAllocation.find({ weekStart: start, ta: { $in: taIds } });
    const existingTaIds = existing.map(doc => doc.ta.toString());

    const missingTaIds = taIds.filter(id => !existingTaIds.includes(id.toString()));

    if (missingTaIds.length > 0) {
      const docs = missingTaIds.map(taId => ({
        ta: taId,
        weekStart: start,
        weekEnd: end,
        days: defaultDays,
      }));
      await WeeklyAllocation.insertMany(docs);
    }

    const grid = await WeeklyAllocation.find({ weekStart: start, ta: { $in: taIds } })
      .populate('ta', 'name status')
      .populate({
        path: 'days.mon.position days.tue.position days.wed.position days.thu.position days.fri.position days.sat.position days.sun.position',
        select: 'jobOrderId position pLevel lsCount cvCount client',
        populate: {
          path: 'client',
          select: 'clientName'
        }
      });

    const orderedGrid = activeTAs.map(ta => {
      return grid.find(doc => doc.ta._id.toString() === ta._id.toString()) || null;
    }).filter(Boolean);

    res.json(orderedGrid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ---- NEW: batch get for multiple weeks with row insertion (UTC) ----
async function getGridBatch(req, res) {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Get all active TAs once
    const activeTAs = await TA.find({ status: 'Active' }).sort({ name: 1, _id: 1 });
    const taIds = activeTAs.map(ta => ta._id);

    // Generate all weeks between start and end (Monday‑Sunday) using UTC helpers
    const weeks = [];
    let cursor = getMondayOfWeek(start);
    while (cursor <= end) {
      const weekEnd = addDays(cursor, 6);
      weeks.push({ weekStart: new Date(cursor), weekEnd });
      cursor = addDays(cursor, 7);
    }

    // For each week, find missing rows and bulk insert
    const bulkOps = [];
    for (const week of weeks) {
      const existing = await WeeklyAllocation.find({
        weekStart: week.weekStart,
        ta: { $in: taIds }
      }).select('ta');
      const existingTaIds = existing.map(doc => doc.ta.toString());

      const missingTaIds = taIds.filter(id => !existingTaIds.includes(id.toString()));

      for (const taId of missingTaIds) {
        bulkOps.push({
          insertOne: {
            document: {
              ta: taId,
              weekStart: week.weekStart,
              weekEnd: week.weekEnd,
              days: {
                mon: { position: null, isAutoFilled: false },
                tue: { position: null, isAutoFilled: false },
                wed: { position: null, isAutoFilled: false },
                thu: { position: null, isAutoFilled: false },
                fri: { position: null, isAutoFilled: false },
                sat: { position: null, isAutoFilled: false },
                sun: { position: null, isAutoFilled: false }
              }
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await WeeklyAllocation.bulkWrite(bulkOps);
    }

    // Fetch all allocations for these weeks and TAs
    const allocations = await WeeklyAllocation.find({
      weekStart: { $in: weeks.map(w => w.weekStart) },
      ta: { $in: taIds }
    })
      .populate('ta', 'name status')
      .populate({
        path: 'days.mon.position days.tue.position days.wed.position days.thu.position days.fri.position days.sat.position days.sun.position',
        select: 'jobOrderId position pLevel lsCount cvCount client',
        populate: { path: 'client', select: 'clientName' }
      });

    // Build response with UTC ISO weekStart keys
    const result = weeks.map(week => {
      const weekGrid = activeTAs.map(ta => {
        const doc = allocations.find(a =>
          a.ta._id.toString() === ta._id.toString() &&
          a.weekStart.getTime() === week.weekStart.getTime()
        );
        return doc || null;
      }).filter(Boolean);
      return {
        weekStart: toISODate(week.weekStart), // now UTC‑consistent
        grid: weekGrid
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ---- updateCell (unchanged, but note it expects weekStart as UTC ISO) ----
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

// ---- autofillWeek (uses UTC helpers as well) ----
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
      end = addDays(start, 6); // UTC add
    }

    const activeTAs = await TA.find({ status: 'Active' }).sort({ name: 1, _id: 1 });

    await Promise.all(activeTAs.map(async (ta) => {
      const activePositions = await Position.find({
        assignee: ta._id,
        status: { $nin: ['Placed', 'Lost'] }
      }).sort({ updatedAt: -1 });

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
  getGridBatch,
  updateCell,
  autofillWeek
};