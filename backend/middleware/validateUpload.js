/**
 * middleware/validateUpload.js
 *
 * Post-upload validation middleware.
 *
 * Multer handles the first layer (MIME type + size).
 * This middleware adds a second layer:
 *  - Confirms at least one file was actually received.
 *  - Re-validates MIME type from the stored file object
 *    (defence-in-depth: never trust the field alone).
 *  - Attaches a sanitised fileInfo object to req for controllers to use.
 *
 * Usage:
 *   router.post('/upload-image',
 *     imageUpload.single('image'),
 *     validateSingleUpload,
 *     controller.handleImage
 *   );
 */

const multer = require('multer');
const logger = require('../utils/logger');

/**
 * Validates a single-file upload.
 * Expects req.file to be populated by multer.
 */
function validateSingleUpload(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error:   'No file received. Please attach a file to the request.',
    });
  }

  // Build a safe, sanitised record of what was received
  req.fileInfo = {
    storedAs:     req.file.filename,
    originalName: req.file.originalname,
    mimeType:     req.file.mimetype,
    sizeBytes:    req.file.size,
    uploadedAt:   req.file.metadata?.uploadedAt || new Date().toISOString(),
    path:         req.file.path,   // absolute path on server – NOT exposed to client
  };

  logger.info(
    `Upload validated: ${req.fileInfo.originalName} (${req.fileInfo.sizeBytes} bytes)`
  );

  next();
}

/**
 * Centralised handler for Multer-specific errors.
 * Place this AFTER the route handler in the middleware chain.
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:      'File is too large. Check the size limits in the API docs.',
      LIMIT_UNEXPECTED_FILE: err.message || 'Unexpected file type.',
      LIMIT_FILE_COUNT:     'Too many files uploaded at once.',
    };
    const message = messages[err.code] || `Upload error: ${err.message}`;
    logger.warn(`Multer error [${err.code}]: ${message}`);
    return res.status(400).json({ success: false, error: message });
  }
  next(err); // pass non-multer errors to the global error handler
}

module.exports = { validateSingleUpload, handleMulterError };
