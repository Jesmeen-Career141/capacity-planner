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
    const { clientId, clientName } = req.body;
    if (!clientId || !clientName) {
      return res.status(400).json({ error: 'clientId and clientName are required' });
    }
    const newClient = await Client.create({ clientId, clientName });
    res.status(201).json(newClient);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A client with this clientId already exists' });
    }
    res.status(500).json({ error: err.message });
  }
}

// PUT update a client's name
async function updateClient(req, res) {
  try {
    const { id } = req.params;
    const { clientName } = req.body;

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
