/**
 * routes/auth.routes.js
 *
 * Authentication & Role Management routes.
 * Mounted at: /api/auth (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');

// ── Health Check ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Authentication & Roles',
    status: 'operational',
    endpoints: [
      'POST /api/auth/register - Register new citizen account',
      'POST /api/auth/login    - Authenticate and receive JWT + role',
      'GET  /api/auth/me       - Check current session and profile',
      'GET  /api/auth/users    - List staff by role (?role=field_officer / stakeholder)',
    ],
  });
});

// ── Auth Actions ──────────────────────────────────────────────────────────────
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authController.getMe);
router.get('/users', authController.listUsers);

module.exports = router;
