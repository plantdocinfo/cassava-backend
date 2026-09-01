const express = require('express');
const router = express.Router();
const diagnoseController = require('../controllers/diagnoseController');

// POST /api/diagnose - Diagnose a leaf image
// Supports: multipart/form-data with "image" field OR JSON with base64 "image"
router.post('/', diagnoseController.diagnoseLeaf);

module.exports = router;