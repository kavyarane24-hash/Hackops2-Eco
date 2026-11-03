/**
 * routes/fieldUpdates.routes.js
 *
 * Field Updates module for on-site inspection evidence, actions, and before/after photos.
 * Mounted at: /api/field-updates (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const { imageUpload } = require('../config/multer');
const { handleMulterError } = require('../middleware/validateUpload');
const fieldUpdatesController = require('../controllers/fieldUpdates.controller');

// ── Health Check ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Field Updates',
    status: 'operational',
    endpoints: [
      'POST /api/field-updates           - Submit inspection notes, action taken, and before/after photos',
      'GET  /api/field-updates           - Query field inspection logs (?incident_id= &officer_id=)',
      'GET  /api/field-updates/media/:fn - View on-site proof photos securely',
    ],
  });
});

// ── Submit Field Update with Evidence Photos ─────────────────────────────────
// Accepts up to 5 evidence photos under field 'evidence' or 'media'
router.post(
  '/',
  imageUpload.array('evidence', 5),
  handleMulterError,
  fieldUpdatesController.submitFieldUpdate
);

// ── Query Field Updates ──────────────────────────────────────────────────────
router.get('/', fieldUpdatesController.listFieldUpdates);

// ── Secure Evidence Media Access ─────────────────────────────────────────────
router.get('/media/:filename', fieldUpdatesController.serveEvidenceMedia);

module.exports = router;
