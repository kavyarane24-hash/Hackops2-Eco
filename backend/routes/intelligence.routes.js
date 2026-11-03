/**
 * routes/intelligence.routes.js
 *
 * Intelligence Engine – API routes.
 *
 * Phase 1: Upload stubs with two-stage validation (type/size + signature/content)
 *          and module health check.
 *          All AI-processing endpoints return 501 Not Implemented until
 *          their service layer is built in later phases.
 *
 * Mounted at: /api/intelligence  (see server.js)
 */

const express  = require('express');
const { imageUpload, dataUpload } = require('../config/multer');
const {
  validateImageUpload,
  validateDataUpload,
  handleMulterError,
} = require('../middleware/validateUpload');
const { analyzeComplaintText, formatAIAnalysisOutput } = require('../services/complaintAnalysis.service');
const { getEnvironmentalAssessment } = require('../services/environmentalIntelligence.service');

const router = express.Router();

// Helper to run multer single upload with immediate error handling
const uploadSingleImage = (req, res, next) => {
  imageUpload.single('image')(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
};

const uploadSingleData = (req, res, next) => {
  dataUpload.single('dataFile')(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
};

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
        'POST /api/intelligence/upload-image  (extension, MIME & signature verified)',
        'POST /api/intelligence/upload-data   (extension, MIME & content verified)',
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
 * Validates:
 *  - MIME + extension match (.jpg, .jpeg, .png, .webp)
 *  - Disk-level magic byte file signature (JPEG, PNG, WEBP)
 *  - Size limit (≤ 10 MB) & single file constraint
 * Stores file privately in uploads/images/.
 */
router.post(
  '/upload-image',
  uploadSingleImage,
  validateImageUpload,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Image received, verified and stored securely. Analysis not yet implemented (Phase 3).',
      fileInfo: {
        originalName: req.fileInfo.originalName,
        storedAs:     req.fileInfo.storedAs,
        mimeType:     req.fileInfo.mimeType,
        detectedType: req.fileInfo.detectedType,
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
 * Validates:
 *  - MIME + extension match (.csv, .xlsx, .xls)
 *  - Content structure (CSV text/printable characters, XLSX ZIP container, XLS legacy)
 *  - Size limit (≤ 5 MB) & single file constraint
 * Stores file privately in uploads/data/.
 */
router.post(
  '/upload-data',
  uploadSingleData,
  validateDataUpload,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Data file received, verified and stored securely. Parsing not yet implemented (Phase 2).',
      fileInfo: {
        originalName: req.fileInfo.originalName,
        storedAs:     req.fileInfo.storedAs,
        mimeType:     req.fileInfo.mimeType,
        detectedType: req.fileInfo.detectedType,
        sizeBytes:    req.fileInfo.sizeBytes,
        uploadedAt:   req.fileInfo.uploadedAt,
      },
    });
  }
);

// ── Text Complaint Analysis (Deterministic + Frontend AIAnalysisOutput Adapter) ──
/**
 * POST /api/intelligence/analyze-complaint
 * Accepts:
 *  - Frontend format: JSON { id, text, language, location: { address, lat, lng }, timestamp, media }
 *  - Backend format: JSON { text: string, metadata?: object }
 * Analyzes citizen complaint text deterministically without external AI APIs.
 * Categorizes pollution type (air, water, noise, waste, other), extracts explicit
 * locations, identifies indicators, estimates severity, and returns both the exact
 * frontend AIAnalysisOutput contract and rich backend classification diagnostics.
 */
router.post('/analyze-complaint', async (req, res) => {
  const { id, text, complaintText, language, location, timestamp, media, metadata } = req.body || {};
  const actualText = text || complaintText;

  if (!actualText || typeof actualText !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_TEXT',
      error: 'Complaint text is required and must be a string.',
    });
  }

  const mergedMetadata = {
    complaintId: id || metadata?.complaintId,
    language: language || metadata?.language,
    location: location || metadata?.location,
    timestamp: timestamp || metadata?.timestamp,
    media: media || metadata?.media || [],
    ...(metadata || {}),
  };

  const rawResult = analyzeComplaintText(actualText, mergedMetadata);
  if (!rawResult.success) {
    return res.status(400).json(rawResult);
  }

  // Attempt real environmental assessment if coordinates provided
  let environmentalAssessment = null;
  const lat = location?.lat;
  const lng = location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    try {
      environmentalAssessment = await getEnvironmentalAssessment(lat, lng, 15);
    } catch {
      // Graceful degradation: failure to fetch env data never blocks text analysis
    }
  }

  const analysisOutput = formatAIAnalysisOutput(rawResult, {
    complaintId: mergedMetadata.complaintId,
    media: mergedMetadata.media,
    location: mergedMetadata.location,
    timestamp: mergedMetadata.timestamp,
    environmentalAssessment,
  });

  return res.status(200).json({
    success: true,
    analysis: analysisOutput,
    ...rawResult,
  });
});

// ── Environmental Data & Assessment Pipeline ──────────────────────────────────
/**
 * GET /api/intelligence/environmental-data
 * Query params: lat (float), lon (float), radius (optional float, default 50)
 * Aggregates Open-Meteo Air Quality, Open-Meteo Weather, and NASA FIRMS hotspots.
 */
async function handleEnvironmentalDataRequest(req, res) {
  const latStr = req.query.lat || req.query.latitude || req.body?.lat || req.body?.latitude;
  const lonStr = req.query.lon || req.query.longitude || req.body?.lon || req.body?.longitude;
  const radiusStr = req.query.radius || req.query.radiusKm || req.body?.radius || req.body?.radiusKm;

  if (latStr === undefined || lonStr === undefined) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_COORDINATES',
      error: 'Query parameters "lat" and "lon" are required.',
    });
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  const radius = radiusStr ? parseFloat(radiusStr) : 50;

  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LATITUDE',
      error: 'Latitude must be a valid float between -90 and 90.',
    });
  }

  if (Number.isNaN(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LONGITUDE',
      error: 'Longitude must be a valid float between -180 and 180.',
    });
  }

  try {
    const assessment = await getEnvironmentalAssessment(lat, lon, radius);
    return res.status(200).json(assessment);
  } catch (err) {
    return res.status(500).json({
      success: false,
      code: 'ASSESSMENT_FAILED',
      error: err.message || 'An unexpected error occurred generating environmental assessment.',
    });
  }
}

router.get('/environmental-data', handleEnvironmentalDataRequest);
router.post('/analyze-data', handleEnvironmentalDataRequest);

// ── Remaining Stub endpoints (Phases 3 & 5) ───────────────────────────────────
const notImplemented = (label) => (req, res) => {
  res.status(501).json({
    success: false,
    error:   `${label} is not yet implemented. See the phased build plan.`,
  });
};

router.post('/analyze-image',     notImplemented('Image analysis (Phase 3)'));
router.post('/full-assessment',   notImplemented('Full assessment (Phase 5)'));

module.exports = router;
