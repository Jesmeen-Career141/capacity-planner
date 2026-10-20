const Client = require('../models/Client');

// GET all clients
async function getAllClients(req, res) {
  try {
    const clients = await Client.find().sort({ clientName: 1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST create a new client
async function createClient(req, res) {
  try {
    let { clientId, clientName } = req.body;
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'clientName is required' });
    }
    clientName = clientName.trim();
    if (!clientId || !clientId.trim()) {
      clientId = clientName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    } else {
      clientId = clientId.trim();
    }

    if (!clientId) {
      return res.status(400).json({ error: 'Could not generate a valid client identifier from client name' });
    }

    const existing = await Client.findOne({ clientId });
    if (existing) {
      return res.status(409).json({
        error: 'A client with this generated identifier already exists. Please use a different client name or contact an administrator.'
      });
    }

    const newClient = await Client.create({ clientId, clientName });
    res.status(201).json(newClient);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'A client with this generated identifier already exists. Please use a different client name or contact an administrator.'
      });
    }
    res.status(500).json({ error: err.message });
  }
}

// PUT update a client's name
async function updateClient(req, res) {
  try {
    const { id } = req.params;
    let { clientName } = req.body;
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'clientName is required' });
    }
    clientName = clientName.trim();

    const updatedClient = await Client.findByIdAndUpdate(
      id,
      { clientName },
      { new: true }
    );

    if (!updatedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(updatedClient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE a client (only allowed if no positions reference it)
async function deleteClient(req, res) {
  try {
    const { id } = req.params;
    const Position = require('../models/Position');

    const linkedCount = await Position.countDocuments({ client: id });
    if (linkedCount > 0) {
      return res.status(409).json({
        error: `Cannot delete client: ${linkedCount} position(s) reference this client.`
      });
    }

    const deleted = await Client.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ message: 'Client deleted', deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllClients,
  createClient,
  updateClient,
  deleteClient
};
