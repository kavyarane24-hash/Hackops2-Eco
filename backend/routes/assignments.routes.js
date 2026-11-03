/**
 * routes/assignments.routes.js
 *
 * Assignments router for task allocation to Stakeholders and Field Officers.
 * Mounted at: /api/assignments (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const assignmentsController = require('../controllers/assignments.controller');

// ── Health Check ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Assignments',
    status: 'operational',
    endpoints: [
      'POST  /api/assignments            - Allocate incident to officer / stakeholder',
      'GET   /api/assignments            - Query assignments (?officer_id= &stakeholder_id= &incident_id=)',
      'PATCH /api/assignments/:id/status - Update assignment status (acknowledged / completed)',
    ],
  });
});

// ── Create Assignment ────────────────────────────────────────────────────────
router.post('/', assignmentsController.createAssignment);

// ── Query Assignments (Field Officer / Stakeholder Task List) ────────────────
router.get('/', assignmentsController.listAssignments);

// ── Update Assignment Status (Acknowledge / Complete) ─────────────────────────
router.patch('/:id/status', assignmentsController.updateAssignmentStatus);

module.exports = router;
