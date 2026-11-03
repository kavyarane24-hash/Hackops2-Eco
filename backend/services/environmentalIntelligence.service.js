/**
 * services/environmentalIntelligence.service.js
 *
 * Composite Environmental Assessment Service.
 * Coordinates parallel fetching from Open-Meteo Air Quality, Open-Meteo Weather,
 * and NASA FIRMS Area API. Normalizes all data streams into a unified representation
 * and applies deterministic validation rules.
 *
 * Architecture standards:
 *  - Independent of Express req/res.
 *  - Parallel data acquisition via Promise.allSettled() ensuring graceful degradation
 *    (failure in one provider never blocks the others).
 *  - Normalization via environmentalNormalizer.service.js.
 *  - Deterministic validation via environmentalValidator.service.js.
 *  - Zero data fabrication (never invents missing readings or coordinates).
 */

'use strict';

const { fetchAirQualityData } = require('./openMeteoAirQuality.service');
const { fetchWeatherData } = require('./openMeteoWeather.service');
const { fetchThermalHotspots } = require('./nasaFirms.service');
const { normalizeEnvironmentalDataset } = require('./environmentalNormalizer.service');
const { validateNormalizedEnvironmentalData } = require('./environmentalValidator.service');
const logger = require('../utils/logger');

/**
 * Generates an integrated environmental intelligence assessment for given coordinates.
 *
 * @param {number} latitude - Target latitude [-90, 90]
 * @param {number} longitude - Target longitude [-180, 180]
 * @param {number} [radiusKm=50] - Thermal anomaly search radius in km
 * @param {Object} [options]
 * @param {boolean} [options.bypassCache=false]
 * @param {Function} [options.fetchFn] - Injectable fetch for testing
 * @returns {Promise<Object>} Composite environmental intelligence assessment
 */
async function getEnvironmentalAssessment(latitude, longitude, radiusKm = 50, options = {}) {
  // Validate coordinates input
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    return {
      success: false,
      code: 'INVALID_COORDINATES',
      error: `Invalid latitude: ${latitude}. Must be a float between -90 and 90.`,
    };
  }
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    return {
      success: false,
      code: 'INVALID_COORDINATES',
      error: `Invalid longitude: ${longitude}. Must be a float between -180 and 180.`,
    };
  }

  const radius = Math.min(Math.max(radiusKm, 1), 500);

  // 1. Fetch Weather first to obtain current wind direction for upwind correlation
  let weatherResult = null;
  try {
    weatherResult = await fetchWeatherData(latitude, longitude, options);
  } catch (err) {
    logger.warn(`Weather fetch failed: ${err.message}`);
    weatherResult = { status: 'unavailable', error: err.message };
  }

  const windOriginDeg = weatherResult?.wind?.direction?.degrees ?? null;

  // 2. Fetch Air Quality and NASA FIRMS in parallel
  const [aqSettled, firmsSettled] = await Promise.allSettled([
    fetchAirQualityData(latitude, longitude, options),
    fetchThermalHotspots(latitude, longitude, radius, {
      ...options,
      windOriginDeg,
    }),
  ]);

  const aqResult =
    aqSettled.status === 'fulfilled'
      ? aqSettled.value
      : { status: 'unavailable', error: aqSettled.reason?.message };

  const firmsResult =
    firmsSettled.status === 'fulfilled'
      ? firmsSettled.value
      : { status: 'unavailable', error: firmsSettled.reason?.message };

  // 3. Normalize all streams into unified schema
  const normalized = normalizeEnvironmentalDataset({
    airQuality: aqResult,
    weather: weatherResult,
    thermalHotspots: firmsResult,
    latitude,
    longitude,
    radiusKm: radius,
  });

  // 4. Validate composite dataset
  const validationReport = validateNormalizedEnvironmentalData(normalized);

  // 5. Construct composite intelligence response
  return {
    success: true,
    assessmentStatus: validationReport.status,
    timestamp: new Date().toISOString(),
    query: {
      latitude,
      longitude,
      radiusKm: radius,
    },
    data: normalized,
    validation: validationReport,
    providerStatuses: {
      openMeteoAirQuality: aqResult.status,
      openMeteoWeather: weatherResult.status,
      nasaFirms: firmsResult.status,
    },
  };
}

module.exports = {
  getEnvironmentalAssessment,
};
