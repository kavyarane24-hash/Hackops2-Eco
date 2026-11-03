/**
 * middleware/errorHandler.js
 *
 * Global Express error handler.
 *
 * Must be registered LAST (after all routes) in server.js.
 * Catches any error passed via next(err).
 *
 * Rules:
 *  - Never expose stack traces or internal details to the client in production.
 *  - Always log the full error server-side.
 *  - Return a consistent JSON shape so the frontend can handle errors uniformly.
 */

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error(`[${req.method} ${req.originalUrl}] ${err.message}`, {
    stack:      err.stack,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    error:   err.message || 'An unexpected server error occurred.',
    // Include stack trace only in development mode
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
