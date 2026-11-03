/**
 * routes/complaints.routes.js
 *
 * Complaints module for citizen reporting, file uploads, and public tracking.
 * Mounted at: /api/complaints (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const { imageUpload } = require('../config/multer');
const { handleMulterError } = require('../middleware/validateUpload');
const complaintsController = require('../controllers/complaints.controller');

// ── Health Check (Preserved) ──────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Complaints',
    status: 'operational',
    endpoints: [
      'POST /api/complaints            - Submit complaint with up to 3 media files',
      'GET  /api/complaints/:trackingId - Track complaint status by tracking ID',
      'GET  /api/complaints            - List complaints (supports ?status= &category=)',
      'GET  /api/complaints/media/:fn  - View uploaded complaint media securely',
    ],
  });
});

// ── Submit Complaint ─────────────────────────────────────────────────────────
// Accepts up to 3 images under field 'media'
router.post(
  '/',
  imageUpload.array('media', 3),
  handleMulterError,
  complaintsController.submitComplaint
);

// ── Secure Media Access ──────────────────────────────────────────────────────
router.get('/media/:filename', complaintsController.serveComplaintMedia);

// ── List Complaints (Staff / Triage View) ────────────────────────────────────
router.get('/', complaintsController.listComplaints);

// ── Track Complaint (Citizen View by Tracking ID) ────────────────────────────
router.get('/:trackingId', complaintsController.getComplaintByTrackingId);

module.exports = router;
