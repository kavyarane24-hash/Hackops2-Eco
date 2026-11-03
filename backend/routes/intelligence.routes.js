/**
 * routes/intelligence.routes.js
 *
 * Intelligence Engine – API routes.
 *
 * Phase 1: Only the upload stubs and the module health check are active.
 *          All AI-processing endpoints return 501 Not Implemented until
 *          their service layer is built in later phases.
 *
 * Mounted at: /api/intelligence  (see server.js)
 */

const express  = require('express');
const multer   = require('multer');
const { imageUpload, dataUpload }            = require('../config/multer');
const { validateSingleUpload, handleMulterError } = require('../middleware/validateUpload');

const router = express.Router();

// ── Health check ──────────────────────────────────────────────────────────────
/**
 * GET /api/intelligence/health
 * Returns the live status of the Intelligence Engine module.
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module:  'Intelligence Engine',
    status:  'operational',
    phase:   1,
    timestamp: new Date().toISOString(),
    endpoints: {
      implemented: [
        'GET  /api/health',
        'GET  /api/intelligence/health',
        'POST /api/intelligence/upload-image  (file validation only)',
        'POST /api/intelligence/upload-data   (file validation only)',
      ],
      pending: [
        'POST /api/intelligence/analyze-complaint  (Phase 3)',
        'POST /api/intelligence/analyze-image      (Phase 3)',
        'POST /api/intelligence/analyze-data       (Phase 2)',
        'POST /api/intelligence/full-assessment    (Phase 5)',
      ],
    },
  });
});

// ── Image upload (validation only – no AI yet) ────────────────────────────────
/**
 * POST /api/intelligence/upload-image
 * Accepts: multipart/form-data, field name "image"
 * Validates MIME type (JPEG/PNG/WEBP) and size (≤ 10 MB).
 * Stores file privately in uploads/images/.
 */
router.post(
  '/upload-image',
  imageUpload.single('image'),
  handleMulterError,
  validateSingleUpload,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Image received and stored securely. Analysis not yet implemented (Phase 3).',
      fileInfo: {
        originalName: req.fileInfo.originalName,
        storedAs:     req.fileInfo.storedAs,
        mimeType:     req.fileInfo.mimeType,
        sizeBytes:    req.fileInfo.sizeBytes,
        uploadedAt:   req.fileInfo.uploadedAt,
        // path is intentionally NOT returned – must not be exposed to clients
      },
    });
  }
);

// ── Data file upload (validation only – no parsing yet) ───────────────────────
/**
 * POST /api/intelligence/upload-data
 * Accepts: multipart/form-data, field name "dataFile"
 * Validates MIME type (CSV/XLS/XLSX) and size (≤ 5 MB).
 * Stores file privately in uploads/data/.
 */
router.post(
  '/upload-data',
  dataUpload.single('dataFile'),
  handleMulterError,
  validateSingleUpload,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Data file received and stored securely. Parsing not yet implemented (Phase 2).',
      fileInfo: {
        originalName: req.fileInfo.originalName,
        storedAs:     req.fileInfo.storedAs,
        mimeType:     req.fileInfo.mimeType,
        sizeBytes:    req.fileInfo.sizeBytes,
        uploadedAt:   req.fileInfo.uploadedAt,
      },
    });
  }
);

// ── Stub endpoints (Phases 2–5) ───────────────────────────────────────────────
const notImplemented = (label) => (req, res) => {
  res.status(501).json({
    success: false,
    error:   `${label} is not yet implemented. See the phased build plan.`,
  });
};

router.post('/analyze-complaint', notImplemented('Complaint analysis'));
router.post('/analyze-image',     notImplemented('Image analysis'));
router.post('/analyze-data',      notImplemented('Data analysis'));
router.post('/full-assessment',   notImplemented('Full assessment'));

module.exports = router;
