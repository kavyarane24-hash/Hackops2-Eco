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

const path = require('path');

// ── Environment variables – must load before anything else ────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { isConfigured, checkDatabaseConnection } = require('./config/supabase');

// ── Route modules ─────────────────────────────────────────────────────────────
const intelligenceRoutes = require('./routes/intelligence.routes');
const complaintsRoutes = require('./routes/complaints.routes');
const reportsRoutes = require('./routes/reports.routes');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

// Root health check
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    system: 'Eco Intelligence & Compliance Management System',
    status: 'operational',
    message: 'Air Pollution Intelligence & Compliance API is running',
    timestamp: new Date().toISOString(),
  });
});

// Top-level system health check (includes database status)
app.get('/api/health', async (req, res) => {
  const dbHealth = await checkDatabaseConnection();
  res.status(200).json({
    success: true,
    system: 'Eco Intelligence & Compliance Management System',
    status: 'operational',
    version: '1.0.0-phase1',
    timestamp: new Date().toISOString(),
    database: {
      configured: dbHealth.configured,
      connected: dbHealth.connected,
      latencyMs: dbHealth.latencyMs,
    },
    modules: {
      intelligence: '/api/intelligence/health',
      complaints: '/api/complaints/health',
      reports: '/api/reports/health',
    },
  });
});

// Dedicated database connectivity health endpoint
app.get('/api/health/db', async (req, res) => {
  const dbHealth = await checkDatabaseConnection();
  const statusCode = dbHealth.connected ? 200 : 503;
  res.status(statusCode).json({
    success: dbHealth.connected,
    database: 'supabase',
    configured: dbHealth.configured,
    connected: dbHealth.connected,
    latencyMs: dbHealth.latencyMs,
    message: dbHealth.message,
    timestamp: new Date().toISOString(),
  });
});

// Module routers
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/reports', reportsRoutes);

// ── 404 handler (must come after all routes) ──────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

// ── Start server (only when run directly, not when required by tests) ─────────
if (require.main === module) {
  app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`System health   : http://localhost:${PORT}/api/health`);
    logger.info(`Database health : http://localhost:${PORT}/api/health/db`);
    logger.info(`Intelligence    : http://localhost:${PORT}/api/intelligence/health`);

    // Verify initial database connection on boot
    const dbHealth = await checkDatabaseConnection();
    if (dbHealth.connected) {
      logger.info(`Supabase connection verified (${dbHealth.latencyMs}ms)`);
    } else {
      logger.warn(`Supabase connection check: ${dbHealth.message}`);
    }
  });
}

module.exports = app; // exported for testing without starting a server
