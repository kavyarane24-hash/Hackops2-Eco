/**
 * config/multer.js
 *
 * Multer configuration for secure file uploads.
 *
 * Rules enforced:
 *  - Files are stored on disk in uploads/images/ or uploads/data/
 *  - Renamed using UUIDv4 + strictly validated lowercase extension
 *  - MIME type and file extension are cross-validated in fileFilter
 *  - Clear INVALID_FILE_TYPE error returned (never disguised as LIMIT_UNEXPECTED_FILE)
 *  - Strict limits: fileSize, files: 1, fields: 10
 */

const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── Size limits (read from .env, fall back to safe defaults) ──────────────────
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE_BYTES, 10) || 10 * 1024 * 1024; // 10 MB
const MAX_DATA_SIZE  = parseInt(process.env.MAX_DATA_FILE_SIZE_BYTES, 10) || 5 * 1024 * 1024;  //  5 MB

// ── Allowed extension-to-MIME mappings ────────────────────────────────────────
const ALLOWED_IMAGE_CONFIG = {
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.webp': ['image/webp'],
};

const ALLOWED_DATA_CONFIG = {
  '.csv':  ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip',
  ],
  '.xls':  ['application/vnd.ms-excel', 'application/x-msexcel'],
};

// ── Helper to build standardized INVALID_FILE_TYPE error ──────────────────────
function createInvalidTypeError(message) {
  const err = new Error(message);
  err.code = 'INVALID_FILE_TYPE';
  return err;
}

// ── Storage: disk, with UUID-based filenames and safe extensions ──────────────
function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '..', 'uploads', subfolder));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${uuidv4()}${ext}`;

      file.metadata = {
        storedAs:     uniqueName,
        originalName: file.originalname,
        mimeType:     file.mimetype,
        uploadedAt:   new Date().toISOString(),
      };

      logger.info(`Storing upload: ${file.originalname} → uploads/${subfolder}/${uniqueName}`);
      cb(null, uniqueName);
    },
  });
}

// ── Strict Extension + MIME Cross-Validation Filters ──────────────────────────
function imageFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (!ext || !ALLOWED_IMAGE_CONFIG[ext]) {
    return cb(createInvalidTypeError(
      `Invalid image extension '${ext || 'none'}'. Allowed: .jpg, .jpeg, .png, .webp.`
    ));
  }

  const allowedMimes = ALLOWED_IMAGE_CONFIG[ext];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(createInvalidTypeError(
      `Mismatched or invalid MIME type '${file.mimetype}' for image extension '${ext}'. Expected: ${allowedMimes.join(', ')}.`
    ));
  }

  cb(null, true);
}

function dataFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (!ext || !ALLOWED_DATA_CONFIG[ext]) {
    return cb(createInvalidTypeError(
      `Invalid data file extension '${ext || 'none'}'. Allowed: .csv, .xlsx, .xls.`
    ));
  }

  const allowedMimes = ALLOWED_DATA_CONFIG[ext];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(createInvalidTypeError(
      `Mismatched or invalid MIME type '${file.mimetype}' for data extension '${ext}'. Expected: ${allowedMimes.join(', ')}.`
    ));
  }

  cb(null, true);
}

// ── Exported Multer instances with explicit resource limits ───────────────────
const imageUpload = multer({
  storage:  makeStorage('images'),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files:    1,
    fields:   10,
  },
  fileFilter: imageFilter,
});

const dataUpload = multer({
  storage:  makeStorage('data'),
  limits: {
    fileSize: MAX_DATA_SIZE,
    files:    1,
    fields:   10,
  },
  fileFilter: dataFilter,
});

module.exports = {
  imageUpload,
  dataUpload,
  ALLOWED_IMAGE_CONFIG,
  ALLOWED_DATA_CONFIG,
};
