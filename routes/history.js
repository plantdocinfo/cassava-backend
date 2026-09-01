const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

// GET /api/history - Get diagnosis history
router.get('/', historyController.getHistory);

// GET /api/history/:id - Get single diagnosis record
router.get('/:id', historyController.getRecord);

// DELETE /api/history/:id - Delete a record
router.delete('/:id', historyController.deleteRecord);

module.exports = router;