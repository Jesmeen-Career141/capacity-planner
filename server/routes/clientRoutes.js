const express = require('express');
const router = express.Router();
const {
  getAllClients,
  createClient,
  updateClient,
  deleteClient
} = require('../controllers/clientController');

router.get('/', getAllClients);
router.post('/', createClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
