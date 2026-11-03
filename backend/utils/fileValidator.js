/**
 * utils/fileValidator.js
 *
 * File signature (magic bytes) and content validation.
 * Verifies that uploaded files match their claimed format on disk,
 * preventing spoofed MIME types, renamed executables, and malformed files.
 */

const fs   = require('fs');
const path = require('path');
const logger = require('./logger');

// Signatures (magic bytes)
const SIGNATURES = {
  JPEG: [0xFF, 0xD8, 0xFF],
  PNG:  [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  ZIP_XLSX: [0x50, 0x4B, 0x03, 0x04],
  XLS_LEGACY: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
};

function matchesPrefix(buffer, signature) {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function isWebP(buffer) {
  if (buffer.length < 12) return false;
  // Offset 0-3: 'RIFF' (0x52 0x49 0x46 0x46)
  // Offset 8-11: 'WEBP' (0x57 0x45 0x42 0x50)
  const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebp = buffer[8] === 0x57 && buffer[9] === 0x49 && buffer[10] === 0x42 && buffer[11] === 0x50;
  return isRiff && isWebp;
}

/**
 * Validates text content for CSV files.
 * Rejects binary files, files with null bytes, and non-text characters.
 */
function validateCsvContent(buffer) {
  if (buffer.length === 0) {
    return { valid: false, error: 'CSV file is empty' };
  }

  // Null byte check – immediate indicator of binary data
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x00) {
      return { valid: false, error: 'Binary or null byte detected in CSV file' };
    }
  }

  const sample = buffer.toString('utf8');

  // Must contain printable ASCII/UTF-8 characters and standard whitespace
  // Disallow excessive control characters (ASCII < 32 except \t, \r, \n)
  let controlCharCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlCharCount++;
    }
  }

  if (controlCharCount > 0) {
    return { valid: false, error: 'Invalid control characters found in CSV text' };
  }

  // Check for basic delimited or line-based text structure
  const lines = sample.trim().split(/\r?\n/);
  if (lines.length === 0 || lines[0].length === 0) {
    return { valid: false, error: 'CSV file does not contain readable data lines' };
  }

  return { valid: true };
}

/**
 * Validates file signature from disk.
 *
 * @param {string} filePath - Absolute path to the uploaded file on disk
 * @param {string} category - 'image' or 'data'
 * @param {string} ext - Lowercase file extension (e.g. '.jpg', '.csv', '.xlsx')
 * @returns {Promise<{ valid: boolean, error?: string, detectedType?: string }>}
 */
async function validateFileSignature(filePath, category, ext) {
  let fd;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) {
      return { valid: false, error: 'Uploaded file is empty (0 bytes).' };
    }

    // Read up to first 4KB for signature inspection
    const bytesToRead = Math.min(stat.size, 4096);
    const buffer = Buffer.alloc(bytesToRead);

    fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, bytesToRead, 0);
    await fd.close();
    fd = null;

    if (category === 'image') {
      if (ext === '.jpg' || ext === '.jpeg') {
        if (!matchesPrefix(buffer, SIGNATURES.JPEG)) {
          return { valid: false, error: 'Corrupt or spoofed JPEG: File signature does not match JPEG header.' };
        }
        return { valid: true, detectedType: 'JPEG' };
      }

      if (ext === '.png') {
        if (!matchesPrefix(buffer, SIGNATURES.PNG)) {
          return { valid: false, error: 'Corrupt or spoofed PNG: File signature does not match PNG header.' };
        }
        return { valid: true, detectedType: 'PNG' };
      }

      if (ext === '.webp') {
        if (!isWebP(buffer)) {
          return { valid: false, error: 'Corrupt or spoofed WEBP: File signature does not match WEBP header.' };
        }
        return { valid: true, detectedType: 'WEBP' };
      }

      return { valid: false, error: `Unsupported image extension: ${ext}` };
    }

    if (category === 'data') {
      if (ext === '.csv') {
        const csvCheck = validateCsvContent(buffer);
        if (!csvCheck.valid) {
          return { valid: false, error: `Invalid CSV content: ${csvCheck.error}` };
        }
        return { valid: true, detectedType: 'CSV' };
      }

      if (ext === '.xlsx') {
        if (!matchesPrefix(buffer, SIGNATURES.ZIP_XLSX)) {
          return { valid: false, error: 'Corrupt or spoofed XLSX: File signature does not match ZIP/Office Open XML container.' };
        }
        return { valid: true, detectedType: 'XLSX' };
      }

      if (ext === '.xls') {
        if (!matchesPrefix(buffer, SIGNATURES.XLS_LEGACY)) {
          return { valid: false, error: 'Corrupt or spoofed XLS: File signature does not match Compound Document format.' };
        }
        return { valid: true, detectedType: 'XLS' };
      }

      return { valid: false, error: `Unsupported data extension: ${ext}` };
    }

    return { valid: false, error: `Unknown category: ${category}` };
  } catch (err) {
    if (fd) {
      try { await fd.close(); } catch (_) {}
    }
    logger.error(`Error reading file for signature check: ${err.message}`);
    return { valid: false, error: `Failed to inspect file signature: ${err.message}` };
  }
}

/**
 * Safely removes a file from disk if validation fails.
 */
async function safeDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`Cleaned unvalidated or rejected upload: ${path.basename(filePath)}`);
    }
  } catch (err) {
    logger.warn(`Failed to delete unvalidated file ${filePath}: ${err.message}`);
  }
}

module.exports = {
  validateFileSignature,
  safeDeleteFile,
};

