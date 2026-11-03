/**
 * controllers/readings.controller.js
 *
 * Core Environmental Data Controller for AQI, PM2.5, PM10, and Weather Readings.
 * Ingests and serves environmental sensor data directly from the Supabase readings table.
 * Returns honest database errors (no mock fallbacks).
 */

'use strict';

const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

/**
 * POST /api/readings
 * Ingests a new environmental measurement data point (AQI, PM2.5, PM10, weather) directly into Supabase.
 */
async function recordReading(req, res, next) {
  try {
    const {
      incident_id,
      aqi,
      pm2_5,
      pm10,
      temperature,
      wind_speed,
      wind_direction,
      data_source = 'Open-Meteo Air Quality',
      latitude,
      longitude,
      timestamp,
    } = req.body;

    if (aqi === undefined && pm2_5 === undefined && pm10 === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: At least one pollutant reading ("aqi", "pm2_5", or "pm10") is required.',
      });
    }

    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;

    const readingPayload = {
      incident_id: incident_id || null,
      aqi: aqi !== undefined ? parseFloat(aqi) : null,
      pm2_5: pm2_5 !== undefined ? parseFloat(pm2_5) : null,
      pm10: pm10 !== undefined ? parseFloat(pm10) : null,
      temperature: temperature !== undefined ? parseFloat(temperature) : null,
      wind_speed: wind_speed !== undefined ? parseFloat(wind_speed) : null,
      wind_direction: wind_direction !== undefined ? parseFloat(wind_direction) : null,
      data_source: data_source.trim(),
      latitude: Number.isNaN(lat) ? null : lat,
      longitude: Number.isNaN(lng) ? null : lng,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    };

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('readings')
      .insert(readingPayload)
      .select()
      .single();

    if (error) {
      logger.error(`Database error recording reading: ${error.message} (code: ${error.code})`);
      const statusCode = error.code === '42501' ? 403 : 500;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    logger.info(`AQI reading successfully persisted in Supabase (AQI: ${readingPayload.aqi})`);

    return res.status(201).json({
      success: true,
      message: 'Reading recorded successfully.',
      data,
    });
  } catch (err) {
    logger.error(`Error in recordReading: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/readings
 * Retrieves time-series readings directly from Supabase, filterable by ?incident_id=
 */
async function listReadings(req, res, next) {
  try {
    const { incident_id, limit = 50 } = req.query;
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    let query = supabase
      .from('readings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit, 10) || 50);

    if (incident_id) query = query.eq('incident_id', incident_id);

    const { data, error } = await query;
    if (error) {
      logger.error(`Database error fetching readings: ${error.message}`);
      return res.status(error.code === '42501' ? 403 : 500).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      count: data ? data.length : 0,
      data: data || [],
    });
  } catch (err) {
    logger.error(`Error in listReadings: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/readings/latest
 * Returns the single most recent reading directly from Supabase.
 */
async function getLatestReading(req, res, next) {
  try {
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('readings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'No sensor readings found in database.',
        });
      }
      logger.error(`Database error fetching latest reading: ${error.message}`);
      return res.status(error.code === '42501' ? 403 : 500).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error(`Error in getLatestReading: ${err.message}`);
    next(err);
  }
}

module.exports = {
  recordReading,
  listReadings,
  getLatestReading,
};
