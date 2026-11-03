/**
 * routes/incidents.routes.js
 *
 * Incidents module for Admin incident triage, severity escalation, and status tracking.
 * Mounted at: /api/incidents (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const incidentsController = require('../controllers/incidents.controller');

// ── Health Check ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Incidents',
    status: 'operational',
    endpoints: [
      'POST  /api/incidents           - Create incident from complaint or direct input',
      'GET   /api/incidents           - List incidents (supports ?status= &severity=)',
      'PATCH /api/incidents/:id/status - Progress incident lifecycle status',
    ],
  });
});

// ── Create Incident ──────────────────────────────────────────────────────────
router.post('/', incidentsController.createIncident);

// ── List Incidents (Admin & Stakeholder GIS Map) ─────────────────────────────
router.get('/', incidentsController.listIncidents);

// ── Update Incident Status ───────────────────────────────────────────────────
router.patch('/:id/status', incidentsController.updateIncidentStatus);

module.exports = router;
