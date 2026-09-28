const TA = require('../models/TA');
const Position = require('../models/Position');

// GET all TAs
async function getAllTAs(req, res) {
  try {
    // Fixed: secondary sort by _id for stable ordering
    const tas = await TA.find().sort({ name: 1, _id: 1 });
    res.json(tas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET only active TAs (used for dropdowns)
async function getActiveTAs(req, res) {
  try {
    // Fixed: secondary sort by _id for stable ordering
    const tas = await TA.find({ status: 'Active' }).sort({ name: 1, _id: 1 });
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

    if (status === 'Left') {
      const existingTA = await TA.findById(id);
      if (!existingTA) {
        return res.status(404).json({ error: 'TA not found' });
      }
      if (existingTA.isTransferTarget) {
        return res.status(400).json({ error: 'The transfer receiver cannot be marked as Left. Designate another TA first.' });
      }
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

// PUT update a TA's name
async function updateTAName(req, res) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const updatedTA = await TA.findByIdAndUpdate(
      id,
      { name: trimmedName },
      { new: true, runValidators: true }
    );

    if (!updatedTA) {
      return res.status(404).json({ error: 'TA not found' });
    }

    res.json(updatedTA);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A TA with this name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
}

// PUT designate a TA as the transfer receiver
async function setTransferTarget(req, res) {
  try {
    const { id } = req.params;
    const ta = await TA.findById(id);
    if (!ta) {
      return res.status(404).json({ error: 'TA not found' });
    }
    if (ta.status !== 'Active') {
      return res.status(400).json({ error: 'A TA who has left cannot be the transfer receiver.' });
    }

    await TA.updateMany({ _id: { $ne: id } }, { isTransferTarget: false });
    ta.isTransferTarget = true;
    await ta.save();

    res.json(ta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT update a TA's color
async function updateTAColor(req, res) {
  try {
    const { id } = req.params;
    const { color } = req.body;

    const validColors = ['blue', 'yellow', 'purple', 'darkGreen', 'lightGreen', 'lightBlue', 'turquoise', 'pink', 'slate', 'maroon', null];
    if (!validColors.includes(color)) {
      return res.status(400).json({ error: 'Invalid color' });
    }

    const updatedTA = await TA.findByIdAndUpdate(
      id,
      { color },
      { new: true }
    );

    if (!updatedTA) {
      return res.status(404).json({ error: 'TA not found' });
    }

    res.json(updatedTA);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE a TA (with position transfer to designated receiver if assigned to positions)
async function deleteTA(req, res) {
  try {
    const { id } = req.params;

    const ta = await TA.findById(id);
    if (!ta) {
      return res.status(404).json({ error: 'TA not found' });
    }

    if (ta.isTransferTarget) {
      return res.status(400).json({
        error: 'This TA is the transfer receiver. Designate another TA as receiver before deleting.'
      });
    }

    const assignedCount = await Position.countDocuments({ assignee: id });
    const parallelCount = await Position.countDocuments({ parallelAssignees: id });
    const hasPositions = assignedCount > 0 || parallelCount > 0;

    let receiver = null;
    let transferredCount = 0;

    if (hasPositions) {
      receiver = await TA.findOne({ isTransferTarget: true, status: 'Active' });
      if (!receiver) {
        return res.status(400).json({
          error: 'No transfer receiver is set. Set one on the TAs page first.'
        });
      }

      if (assignedCount > 0) {
        const updateResult = await Position.updateMany(
          { assignee: id },
          { $set: { assignee: receiver._id } }
        );
        transferredCount = updateResult.modifiedCount !== undefined ? updateResult.modifiedCount : assignedCount;
      }

      if (parallelCount > 0) {
        await Position.updateMany(
          { parallelAssignees: id },
          { $pull: { parallelAssignees: id } }
        );
      }

      await Position.updateMany(
        { assignee: receiver._id, parallelAssignees: receiver._id },
        { $pull: { parallelAssignees: receiver._id } }
      );
    }

    const deleted = await TA.findByIdAndDelete(id);

    res.json({
      message: 'TA deleted',
      deleted,
      transferredCount,
      transferredTo: receiver ? receiver.name : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllTAs,
  getActiveTAs,
  createTA,
  updateTAStatus,
  updateTAName,
  setTransferTarget,
  updateTAColor,
  deleteTA
};