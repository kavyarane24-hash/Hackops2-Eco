/**
 * middleware/validateUpload.js
 *
 * Post-upload validation middleware.
 *
 * Two-stage validation pipeline:
 *  1. Multer handles size limits, file counts, and extension/MIME matching.
 *  2. This middleware handles:
 *     - Verifying at least one file was received.
 *     - Reading disk-level file signatures (magic bytes) to defeat spoofing.
 *     - Validating CSV structure and content against binary contamination.
 *     - Removing unvalidated or corrupt uploads from disk immediately.
 *     - Attaching clean, sanitized metadata to req.fileInfo.
 */

const path = require('path');
const multer = require('multer');
const logger = require('../utils/logger');
const { validateFileSignature, safeDeleteFile } = require('../utils/fileValidator');

/**
 * Creates a route-level file validator for a specific category ('image' | 'data').
 */
function createUploadValidator(category) {
  return async function validateUpload(req, res, next) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code:    'MISSING_FILE',
        error:   'No file received. Please attach a file to the request.',
      });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();

    // Verify disk-level magic bytes / content
    const signatureResult = await validateFileSignature(req.file.path, category, ext);
    if (!signatureResult.valid) {
      logger.warn(
        `File signature check failed for ${req.file.originalname} (${category}): ${signatureResult.error}`
      );
      // Clean up the rejected file from disk immediately
      await safeDeleteFile(req.file.path);

      return res.status(400).json({
        success: false,
        code:    'INVALID_FILE_SIGNATURE',
        error:   signatureResult.error,
      });
    }

    // Attach sanitized, non-sensitive file info to the request object
    req.fileInfo = {
      storedAs:     req.file.filename,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      detectedType: signatureResult.detectedType,
      sizeBytes:    req.file.size,
      uploadedAt:   req.file.metadata?.uploadedAt || new Date().toISOString(),
      path:         req.file.path, // server-internal path (never exposed in JSON response)
    };

    logger.info(
      `Upload validated [${category} / ${req.fileInfo.detectedType}]: ${req.fileInfo.originalName} (${req.fileInfo.sizeBytes} bytes)`
    );

    next();
  };
}

const validateImageUpload = createUploadValidator('image');
const validateDataUpload  = createUploadValidator('data');

/**
 * Centralised handler for Multer and file-filter errors.
 */
function handleMulterError(err, req, res, next) {
  if (!err) {
    return next();
  }

  // Custom extension/MIME mismatch from fileFilter
  if (err.code === 'INVALID_FILE_TYPE' || (err.message && err.message.startsWith('INVALID_FILE_TYPE'))) {
    logger.warn(`File rejected [INVALID_FILE_TYPE]: ${err.message}`);
    return res.status(400).json({
      success: false,
      code:    'INVALID_FILE_TYPE',
      error:   err.message.replace(/^INVALID_FILE_TYPE:\s*/, ''),
    });
  }

  // Multer-generated errors (size limits, file counts, field limits)
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:       'File is too large. Check the allowed size limits in the API docs.',
      LIMIT_FILE_COUNT:      'Too many files uploaded at once. Only 1 file is permitted.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field or multiple files submitted where only one is allowed.',
      LIMIT_FIELD_COUNT:     'Too many form fields submitted.',
      LIMIT_FIELD_VALUE:     'Form field value is too long.',
    };

    const message = messages[err.code] || `Upload error: ${err.message}`;
    logger.warn(`Multer error [${err.code}]: ${message}`);
    return res.status(400).json({
      success: false,
      code:    err.code,
      error:   message,
    });
  }

  // Pass unexpected non-multer errors to global error handler
  next(err);
}

module.exports = {
  validateImageUpload,
  validateDataUpload,
  validateSingleUpload: validateImageUpload, // backward-compatible alias
  handleMulterError,
};
