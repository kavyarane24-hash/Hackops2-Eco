/**
 * tests/upload.test.js
 *
 * Automated verification suite for upload validation, security, and error handling.
 *
 * Covers:
 *  1. Valid image upload (JPEG signature & MIME)
 *  2. Invalid image extension (.exe rejected)
 *  3. Spoofed image MIME type (text content with image/jpeg header rejected & cleaned up)
 *  4. Valid CSV upload (valid UTF-8 text structure)
 *  5. Invalid CSV content (binary data with null bytes rejected & cleaned up)
 *  6. Valid XLSX upload (ZIP container magic bytes)
 *  7. Missing file in request
 *  8. Oversized upload (> limit triggers LIMIT_FILE_SIZE)
 *  9. Multiple files where only one is allowed
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

// Sample file buffers
const VALID_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB
]);

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
]);

const VALID_CSV = Buffer.from(
  'timestamp,aqi,pm25,pm10\n2026-11-03T10:00:00Z,142,65.2,110.5\n2026-11-03T11:00:00Z,155,72.1,118.0\n'
);

const INVALID_CSV_BINARY = Buffer.from([
  0x00, 0x01, 0x02, 0xFF, 0xFE, 0x00, 0x00, 0x50, 0x4B
]);

const VALID_XLSX_ZIP = Buffer.from([
  0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00
]);

const SPOOFED_IMAGE = Buffer.from(
  'This is plain text pretending to be a JPEG image file.'
);

async function runUploadTests() {
  console.log('\n======================================================');
  console.log(' RUNNING PHASE 1 UPLOAD CORRECTION VERIFICATION SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       Details:`, details);
      failed++;
    }
  }

  // ── TEST 1: Valid Image Upload ─────────────────────────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-image')
      .attach('image', VALID_JPEG, { filename: 'smoke_stack.jpg', contentType: 'image/jpeg' });

    assert(
      res.status === 200 && res.body.success === true && res.body.fileInfo.detectedType === 'JPEG',
      'Test 1: Valid image upload (JPEG)',
      res.body
    );
  }

  // ── TEST 2: Invalid Image Extension ────────────────────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-image')
      .attach('image', VALID_JPEG, { filename: 'payload.exe', contentType: 'image/jpeg' });

    assert(
      res.status === 400 && res.body.code === 'INVALID_FILE_TYPE' && res.body.error.includes('.exe'),
      'Test 2: Invalid image extension (.exe rejected)',
      res.body
    );
  }

  // ── TEST 3: Spoofed Image MIME Type ────────────────────────────────────────
  {
    const beforeCount = fs.readdirSync(path.join(__dirname, '../uploads/images')).length;

    const res = await request(app)
      .post('/api/intelligence/upload-image')
      .attach('image', SPOOFED_IMAGE, { filename: 'fake_smoke.jpg', contentType: 'image/jpeg' });

    const afterCount = fs.readdirSync(path.join(__dirname, '../uploads/images')).length;

    assert(
      res.status === 400 &&
      res.body.code === 'INVALID_FILE_SIGNATURE' &&
      res.body.error.includes('signature does not match') &&
      afterCount === beforeCount, // Ensure rejected file was cleaned from disk
      'Test 3: Spoofed image MIME type rejected & cleaned from disk',
      res.body
    );
  }

  // ── TEST 4: Valid CSV Upload ───────────────────────────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-data')
      .attach('dataFile', VALID_CSV, { filename: 'aqi_readings.csv', contentType: 'text/csv' });

    assert(
      res.status === 200 && res.body.success === true && res.body.fileInfo.detectedType === 'CSV',
      'Test 4: Valid CSV upload',
      res.body
    );
  }

  // ── TEST 5: Invalid CSV Content (Binary / Null Bytes) ──────────────────────
  {
    const beforeCount = fs.readdirSync(path.join(__dirname, '../uploads/data')).length;

    const res = await request(app)
      .post('/api/intelligence/upload-data')
      .attach('dataFile', INVALID_CSV_BINARY, { filename: 'binary_data.csv', contentType: 'text/csv' });

    const afterCount = fs.readdirSync(path.join(__dirname, '../uploads/data')).length;

    assert(
      res.status === 400 &&
      res.body.code === 'INVALID_FILE_SIGNATURE' &&
      res.body.error.includes('null byte') &&
      afterCount === beforeCount, // Ensure rejected file was deleted
      'Test 5: Invalid CSV content (binary null bytes rejected & cleaned)',
      res.body
    );
  }

  // ── TEST 6: Valid XLSX Upload ──────────────────────────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-data')
      .attach('dataFile', VALID_XLSX_ZIP, {
        filename: 'station_metrics.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    assert(
      res.status === 200 && res.body.success === true && res.body.fileInfo.detectedType === 'XLSX',
      'Test 6: Valid XLSX upload (ZIP container signature verified)',
      res.body
    );
  }

  // ── TEST 7: Missing File ───────────────────────────────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-image');

    assert(
      res.status === 400 && res.body.code === 'MISSING_FILE',
      'Test 7: Missing file in upload request',
      res.body
    );
  }

  // ── TEST 8: Oversized Upload ───────────────────────────────────────────────
  {
    // Generate 5MB + 2KB buffer exceeding MAX_DATA_SIZE (5 MB)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 2048, 0x20); // filled with spaces

    const res = await request(app)
      .post('/api/intelligence/upload-data')
      .attach('dataFile', oversizedBuffer, { filename: 'too_big.csv', contentType: 'text/csv' });

    assert(
      res.status === 400 && res.body.code === 'LIMIT_FILE_SIZE',
      'Test 8: Oversized data file upload triggers LIMIT_FILE_SIZE',
      res.body
    );
  }

  // ── TEST 9: Multiple Files Where Only One Is Allowed ──────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/upload-image')
      .attach('image', VALID_JPEG, { filename: 'img1.jpg', contentType: 'image/jpeg' })
      .attach('image', VALID_PNG, { filename: 'img2.png', contentType: 'image/png' });

    assert(
      res.status === 400 &&
      (res.body.code === 'LIMIT_UNEXPECTED_FILE' || res.body.code === 'LIMIT_FILE_COUNT'),
      'Test 9: Multiple files rejected when only single file allowed',
      res.body
    );
  }

  // ── TEST 10: Clean Up Valid Uploads Created During Tests ───────────────────
  const imagesDir = path.join(__dirname, '../uploads/images');
  const dataDir   = path.join(__dirname, '../uploads/data');

  fs.readdirSync(imagesDir)
    .filter(f => f !== '.gitkeep')
    .forEach(f => fs.unlinkSync(path.join(imagesDir, f)));

  fs.readdirSync(dataDir)
    .filter(f => f !== '.gitkeep')
    .forEach(f => fs.unlinkSync(path.join(dataDir, f)));

  console.log('\n======================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runUploadTests().catch((err) => {
    console.error('Test runner caught unexpected error:', err);
    process.exit(1);
  });
}

module.exports = { runUploadTests };

