/**
 * config/multer.js
 *
 * Multer configuration for secure file uploads.
 *
 * Rules enforced here:
 *  - Files are stored on disk in uploads/images/ or uploads/data/
 *    (never in memory, to avoid DoS via large payloads in RAM).
 *  - Each file is renamed to a UUID so that:
 *      1. The original filename (potentially malicious) is never used on disk.
 *      2. Collisions are impossible.
 *  - The original filename and MIME type are preserved in file.metadata
 *    so they can be stored in the database for auditing.
 *  - MIME type is checked against an allowlist (file extension is NOT trusted).
 *  - File size limits are read from .env with safe defaults.
 *
 * Two multer instances are exported:
 *   imageUpload  – for pollution images  (JPEG, PNG, WEBP)
 *   dataUpload   – for AQI data files   (CSV, XLSX, XLS)
 */

const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── Size limits (read from .env, fall back to safe defaults) ──────────────────
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE_BYTES, 10) || 10 * 1024 * 1024; // 10 MB
const MAX_DATA_SIZE  = parseInt(process.env.MAX_DATA_FILE_SIZE_BYTES, 10) || 5 * 1024 * 1024;  //  5 MB

// ── Allowed MIME types ────────────────────────────────────────────────────────
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_DATA_MIMES = new Set([
  'text/csv',
  'text/plain',                                                        // some OS report CSV as this
  'application/vnd.ms-excel',                                          // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
]);

// ── Storage: disk, with UUID-based filenames ──────────────────────────────────
function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '..', 'uploads', subfolder));
    },
    filename: (req, file, cb) => {
      // Determine extension from original name (kept only for human readability)
      const ext = path.extname(file.originalname).toLowerCase() || '';
      const uniqueName = `${uuidv4()}${ext}`;

      // Attach metadata to the file object so controllers can log / store it
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

// ── MIME-type filters ─────────────────────────────────────────────────────────
function imageFilter(req, file, cb) {
  if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      `Invalid image type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP.`));
  }
}

function dataFilter(req, file, cb) {
  if (ALLOWED_DATA_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      `Invalid data file type: ${file.mimetype}. Allowed: CSV, XLS, XLSX.`));
  }
}

// ── Exported multer instances ─────────────────────────────────────────────────
const imageUpload = multer({
  storage:  makeStorage('images'),
  limits:   { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFilter,
});

const dataUpload = multer({
  storage:  makeStorage('data'),
  limits:   { fileSize: MAX_DATA_SIZE },
  fileFilter: dataFilter,
});

module.exports = { imageUpload, dataUpload };
