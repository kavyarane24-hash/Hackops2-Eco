/**
 * server.js
 *
 * Environmental Intelligence & Compliance Management System
 * Single Express server entry point.
 *
 * Architecture notes:
 *  - One server, one port. Each module gets its own router mounted here.
 *  - The uploads/ directory is NEVER served as static files.
 *  - API keys are loaded from .env – never hard-coded.
 *  - Error handler is registered last (after all routes).
 */

'use strict';

// ── Environment variables – must load before anything else ────────────────────
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const path     = require('path');

const logger       = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// ── Route modules ─────────────────────────────────────────────────────────────
const intelligenceRoutes = require('./routes/intelligence.routes');
const complaintsRoutes   = require('./routes/complaints.routes');
const reportsRoutes      = require('./routes/reports.routes');

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman) in development
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── HTTP request logger ───────────────────────────────────────────────────────
// Use concise 'dev' format in development, combined in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Security: uploads are stored privately – do NOT add express.static here ──
// If a file needs to be sent to a client, use res.download() with authorisation.

// ── Routes ────────────────────────────────────────────────────────────────────

// Top-level system health check (no module prefix)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success:   true,
    system:    'Eco Intelligence & Compliance Management System',
    status:    'operational',
    version:   '1.0.0-phase1',
    timestamp: new Date().toISOString(),
    modules: {
      intelligence: '/api/intelligence/health',
      complaints:   '/api/complaints/health',
      reports:      '/api/reports/health',
    },
  });
});

// Module routers
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/complaints',   complaintsRoutes);
app.use('/api/reports',      reportsRoutes);

// ── 404 handler (must come after all routes) ──────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

// ── Start server (only when run directly, not when required by tests) ─────────
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`System health : http://localhost:${PORT}/api/health`);
    logger.info(`Intelligence  : http://localhost:${PORT}/api/intelligence/health`);
  });
}

module.exports = app; // exported for testing without starting a server
