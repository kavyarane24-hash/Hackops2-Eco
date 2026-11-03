/**
 * config/supabase.js
 *
 * Supabase client initialization.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from backend/.env.
 * Provides safe fallback handling so the server won't crash when testing without credentials.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const isConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseKey.includes('your-supabase-')
);

let supabase = null;

if (isConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    logger.info('Supabase client initialized successfully.');
  } catch (err) {
    logger.error(`Failed to initialize Supabase client: ${err.message}`);
  }
} else {
  logger.warn('Supabase credentials not configured in .env. Database operations will require real SUPABASE_URL and key.');
}

/**
 * Helper to obtain the active Supabase client or throw a descriptive error
 */
function getSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to backend/.env'
    );
  }
  return supabase;
}

/**
 * Lightweight connectivity check against the Supabase database
 * Safely uses the configured client without exposing credentials or requiring service_role key
 */
async function checkDatabaseConnection() {
  if (!isConfigured || !supabase) {
    return {
      connected: false,
      configured: false,
      message: 'Supabase credentials not configured in backend/.env',
    };
  }

  const start = Date.now();
  try {
    const { error } = await supabase.rpc('track_complaint', { p_tracking_id: 'HEALTH-PING' });
    const latencyMs = Date.now() - start;

    if (error && error.code !== 'PGRST116') {
      return {
        connected: false,
        configured: true,
        latencyMs,
        message: error.message || 'Database query error',
      };
    }

    return {
      connected: true,
      configured: true,
      latencyMs,
      message: 'Supabase connection healthy',
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      latencyMs: Date.now() - start,
      message: err.message,
    };
  }
}

module.exports = {
  supabase,
  isConfigured,
  getSupabase,
  checkDatabaseConnection,
};
