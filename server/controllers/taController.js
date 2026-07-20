const TA = require('../models/TA');
const Position = require('../models/Position');

// GET all TAs
async function getAllTAs(req, res) {
  try {
    const tas = await TA.find().sort({ name: 1 });
    res.json(tas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET only active TAs (used for dropdowns)
async function getActiveTAs(req, res) {
  try {
    const tas = await TA.find({ status: 'Active' }).sort({ name: 1 });
    res.json(tas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST create a new TA
async function createTA(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const newTA = await TA.create({ name });
    res.status(201).json(newTA);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A TA with this name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
}

// PUT update a TA's status (Active/Left) – with override logic
async function updateTAStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Left'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Active or Left' });
    }

    const updatedTA = await TA.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedTA) {
      return res.status(404).json({ error: 'TA not found' });
    }

    // ---- NEW: if TA is marked as Left, set reAssign override on all their positions ----
    if (status === 'Left') {
      const positions = await Position.find({ assignee: id });

      for (const pos of positions) {
        // Ensure flagOverrides is a Map (if using Mongoose Map)
        if (!pos.flagOverrides) pos.flagOverrides = new Map();
        pos.flagOverrides.set('reAssign', 'on');
        await pos.save();
      }
    }

    res.json(updatedTA);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE a TA (only allowed if not assigned to any position)
async function deleteTA(req, res) {
  try {
    const { id } = req.params;
    const Position = require('../models/Position');

    const assignedCount = await Position.countDocuments({ assignee: id });
    if (assignedCount > 0) {
      return res.status(409).json({
        error: `Cannot delete TA: currently assigned to ${assignedCount} position(s). Reassign or mark as Left instead.`
      });
    }

    const deleted = await TA.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'TA not found' });
    }

    res.json({ message: 'TA deleted', deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllTAs,
  getActiveTAs,
  createTA,
  updateTAStatus,
  deleteTA
};