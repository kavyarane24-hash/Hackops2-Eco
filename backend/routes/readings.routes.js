/**
 * routes/readings.routes.js
 *
 * Environmental readings module for AQI, PM2.5, PM10, temperature and wind data.
 * Mounted at: /api/readings (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const readingsController = require('../controllers/readings.controller');

// ── Health Check ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Readings & Environmental Data',
    status: 'operational',
    endpoints: [
      'POST /api/readings        - Ingest new sensor reading (AQI, PM2.5, PM10, weather)',
      'GET  /api/readings        - Query readings time-series (?incident_id= &limit=)',
      'GET  /api/readings/latest - Get most recent reading for summary KPI metrics',
    ],
  });
});

// ── Latest Reading ────────────────────────────────────────────────────────────
router.get('/latest', readingsController.getLatestReading);

// ── Ingest Reading ────────────────────────────────────────────────────────────
router.post('/', readingsController.recordReading);

// ── Query Readings ────────────────────────────────────────────────────────────
router.get('/', readingsController.listReadings);

module.exports = router;
