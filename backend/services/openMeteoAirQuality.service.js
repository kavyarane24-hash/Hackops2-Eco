/**
 * services/openMeteoAirQuality.service.js
 *
 * Framework-independent client for the Open-Meteo Air Quality API.
 * Requests the Copernicus Atmosphere Monitoring Service (CAMS) Global reanalysis
 * and forecast domain specifically configured for Indian regional deployments.
 *
 * Architecture standards:
 *  - Independent of Express req/res.
 *  - Distinct requested vs model-grid coordinates.
 *  - Clear model attribution (~0.4° resolution); never confused with direct ground sensors.
 *  - Foreign AQI scale disclaimers (European AQI, US AQI != CPCB NAQI).
 *  - Fixed-TTL caching, request timeouts, and exponential retries for transient errors.
 */

'use strict';

const SimpleTtlCache = require('../utils/cache.util');
const logger = require('../utils/logger');

const BASE_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

// Isolated cache instance for Air Quality queries
const airQualityCache = new SimpleTtlCache({
  maxSize: 100,
  defaultTtlMs: 15 * 60 * 1000, // 15-minute fixed TTL
});

/**
 * Helper to pause execution for retry backoff.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the API query parameters.
 * Explicitly sets domains=cams_global for Indian and international deployments.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Object} [options]
 * @returns {URL}
 */
function buildAirQualityUrl(latitude, longitude, options = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set('latitude', latitude.toString());
  url.searchParams.set('longitude', longitude.toString());
  url.searchParams.set(
    'current',
    'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi'
  );
  // Mandatory for Indian deployment: CAMS Global model domain
  url.searchParams.set('domains', options.domains || 'cams_global');
  url.searchParams.set('timezone', options.timezone || 'auto');

  return url;
}

/**
 * Normalizes Open-Meteo Air Quality JSON response into a consistent structure.
 *
 * @param {Object} data - Raw JSON response from Open-Meteo
 * @param {number} requestedLat - Original requested latitude
 * @param {number} requestedLon - Original requested longitude
 * @param {string} sourceStatus - 'available' | 'cached'
 * @returns {Object}
 */
function formatAirQualityResponse(data, requestedLat, requestedLon, sourceStatus) {
  const current = data.current || {};
  const units = data.current_units || {};

  return {
    status: sourceStatus,
    provider: 'Open-Meteo Air Quality API',
    modelMetadata: {
      domain: 'cams_global',
      modelName: 'Copernicus Atmosphere Monitoring Service (CAMS) Global',
      modelType: 'Atmospheric Numerical Composition Model',
      spatialResolution: '~0.4° (~40-45 km over India)',
      isDirectGroundMeasurement: false,
      requestedCoordinates: {
        latitude: requestedLat,
        longitude: requestedLon,
      },
      modelGridCoordinates: {
        latitude: data.latitude,
        longitude: data.longitude,
        elevationMeters: data.elevation ?? null,
      },
      generationTimeMs: data.generationtime_ms,
      utcOffsetSeconds: data.utc_offset_seconds,
      timezone: data.timezone,
    },
    timestamp: current.time || null,
    pollutants: {
      pm25: {
        value: current.pm2_5 ?? null,
        unit: units.pm2_5 || 'μg/m³',
      },
      pm10: {
        value: current.pm10 ?? null,
        unit: units.pm10 || 'μg/m³',
      },
      nitrogenDioxide: {
        value: current.nitrogen_dioxide ?? null,
        unit: units.nitrogen_dioxide || 'μg/m³',
      },
      sulphurDioxide: {
        value: current.sulphur_dioxide ?? null,
        unit: units.sulphur_dioxide || 'μg/m³',
      },
      carbonMonoxide: {
        value: current.carbon_monoxide ?? null,
        unit: units.carbon_monoxide || 'μg/m³',
      },
      ozone: {
        value: current.ozone ?? null,
        unit: units.ozone || 'μg/m³',
      },
    },
    indices: {
      europeanAqi: {
        value: current.european_aqi ?? null,
        unit: units.european_aqi || 'AQI',
        standard: 'European Air Quality Index',
        note: 'Calculated using European Environment Agency (EEA) pollutant sub-indices.',
      },
      usAqi: {
        value: current.us_aqi ?? null,
        unit: units.us_aqi || 'AQI',
        standard: 'United States EPA Air Quality Index',
        note: 'Calculated using US EPA breakpoint methodology.',
      },
    },
    disclaimers: {
      modelDisclaimer:
        'Air quality values are atmospheric numerical model forecasts from CAMS Global (~0.4° resolution), NOT direct continuous ambient ground-monitoring measurements.',
      cpcbDisclaimer:
        'Indices reported are European AQI and US EPA AQI. They are NOT calibrated to the Indian National Air Quality Index (CPCB NAQI), which uses distinct 24-hour breakpoint rules.',
    },
  };
}

/**
 * Fetches air-quality data from Open-Meteo with caching, timeouts, and retries.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=8000]
 * @param {boolean} [options.bypassCache=false]
 * @param {string} [options.domains='cams_global']
 * @param {Function} [options.fetchFn=globalThis.fetch] - Injectable fetch for unit tests
 * @returns {Promise<Object>}
 */
async function fetchAirQualityData(latitude, longitude, options = {}) {
  // Validate coordinates input
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be a float between -90 and 90.`);
  }
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be a float between -180 and 180.`);
  }

  const domains = options.domains || 'cams_global';
  const cacheKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${domains}`;

  // Check fixed-TTL cache
  if (!options.bypassCache) {
    const cachedRaw = airQualityCache.get(cacheKey);
    if (cachedRaw) {
      logger.info(`Air Quality cache hit for [${latitude}, ${longitude}]`);
      // Reconstruct request-specific metadata using exact requested coordinates
      return formatAirQualityResponse(cachedRaw, latitude, longitude, 'cached');
    }
  }

  const targetUrl = buildAirQualityUrl(latitude, longitude, options);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetchFn || globalThis.fetch;

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 250 * Math.pow(2, attempt - 1);
        logger.warn(`Retrying Air Quality request (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after ${backoff}ms...`);
        await sleep(backoff);
      }

      const response = await fetchFn(targetUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HackOps2-Environmental-Intelligence/1.0',
        },
      });

      // Handle rate limiting specifically (do not retry 429)
      if (response.status === 429) {
        logger.warn(`Open-Meteo Air Quality rate limited (429)`);
        return {
          status: 'rate_limited',
          provider: 'Open-Meteo Air Quality API',
          error: 'Rate limit exceeded. Please try again later.',
          disclaimers: {
            cpcbDisclaimer: 'Service temporarily rate-limited upstream.',
          },
        };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Strict retry policy: ONLY retry HTTP 502, 503, 504
        const isRetryableStatus =
          response.status === 502 || response.status === 503 || response.status === 504;

        const err = new Error(
          `Open-Meteo Air Quality returned HTTP ${response.status}: ${errorText || response.statusText}`
        );
        err.statusCode = response.status;
        err.isTransient = isRetryableStatus;

        if (isRetryableStatus && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        // Non-retryable HTTP error (e.g. 500, 400, 404): abort immediately without retrying
        throw err;
      }

      const rawJson = await response.json();

      // Cache the raw upstream response with fixed TTL
      airQualityCache.set(cacheKey, rawJson);

      // Construct request-specific response with exact requested coordinates
      return formatAirQualityResponse(rawJson, latitude, longitude, 'available');
    } catch (err) {
      lastError = err;

      // Retry transient network failures and timeouts up to MAX_RETRIES
      const isTimeout = err.name === 'TimeoutError' || err.code === 'UND_ERR_HEADERS_TIMEOUT';
      const isNetworkFailure =
        err.name === 'TypeError' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND';

      const isRetryable = err.isTransient || isTimeout || isNetworkFailure;

      if (!isRetryable || attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  logger.error(`Open-Meteo Air Quality fetch failed: ${lastError?.message}`);
  return {
    status: lastError?.name === 'TimeoutError' ? 'timed_out' : 'unavailable',
    provider: 'Open-Meteo Air Quality API',
    error: lastError?.message || 'Upstream provider unavailable',
    requestedCoordinates: { latitude, longitude },
  };
}

module.exports = {
  fetchAirQualityData,
  buildAirQualityUrl,
  formatAirQualityResponse,
  airQualityCache,
};
