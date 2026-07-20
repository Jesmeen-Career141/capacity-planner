const ColorLegend = require('../models/ColorLegend');

const DEFAULT_ENTRIES = ColorLegend.PRESET_KEYS.map(key => ({ key, label: '' }));

// The legend is a single shared document -- there's only ever one.
async function getOrCreateLegend() {
  let legend = await ColorLegend.findOne();
  if (!legend) {
    legend = await ColorLegend.create({ entries: DEFAULT_ENTRIES });
  }
  return legend;
}

async function getLegend(req, res) {
  try {
    const legend = await getOrCreateLegend();
    res.json(legend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateLegend(req, res) {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries must be an array' });
    }
    for (const e of entries) {
      if (!ColorLegend.PRESET_KEYS.includes(e.key)) {
        return res.status(400).json({ error: `Invalid color key: ${e.key}` });
      }
    }

    let legend = await ColorLegend.findOne();
    if (!legend) {
      legend = await ColorLegend.create({ entries });
    } else {
      legend.entries = entries;
      await legend.save();
    }

    res.json(legend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getLegend, updateLegend };