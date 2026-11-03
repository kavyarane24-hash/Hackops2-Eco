/**
 * utils/logger.js
 *
 * Lightweight structured logger.
 * Wraps console methods so every log line includes a UTC timestamp and level.
 * Drop-in replacement: use logger.info(), logger.warn(), logger.error().
 */

const levels = {
  info:  { label: 'INFO ',  fn: console.log  },
  warn:  { label: 'WARN ',  fn: console.warn },
  error: { label: 'ERROR', fn: console.error },
};

function log(level, message, meta) {
  const { label, fn } = levels[level];
  const timestamp = new Date().toISOString();
  if (meta !== undefined) {
    fn(`[${timestamp}] ${label} | ${message}`, meta);
  } else {
    fn(`[${timestamp}] ${label} | ${message}`);
  }
}

const logger = {
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

module.exports = logger;
