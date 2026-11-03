/**
 * services/openMeteoWeather.service.js
 *
 * Framework-independent client for the Open-Meteo Weather Forecast API.
 * Retrieves surface weather conditions necessary for atmospheric dispersion analysis:
 * temperature, relative humidity, wind speed, wind direction, gusts, and surface pressure.
 *
 * Architecture standards:
 *  - Independent of Express req/res.
 *  - Accurate model attribution: records exact requested model config (e.g. 'best_match'
 *    combining regional DWD ICON, ECMWF IFS, or GFS depending on coordinates).
 *  - Explicit distinction between requested and model-grid coordinates.
 *  - Meteorological wind interpretation: wind direction is the direction FROM which wind blows.
 *  - Fixed-TTL caching, request timeouts, and exponential retries for transient errors.
 */

'use strict';

const SimpleTtlCache = require('../utils/cache.util');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

// Isolated cache instance for Weather queries
const weatherCache = new SimpleTtlCache({
  maxSize: 100,
  defaultTtlMs: 15 * 60 * 1000, // 15-minute fixed TTL
});

/**
 * Helper to convert degree bearing (0°-360°) to cardinal wind direction.
 * Note: Wind direction represents the direction FROM which the wind arrives.
 *
 * @param {number} deg
 * @returns {string}
 */
function degreesToCardinal(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return 'Unknown';
  const normalized = ((deg % 360) + 360) % 360;
  const sectors = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % 16;
  return sectors[index];
}

/**
 * Helper to pause execution for retry backoff.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the API query parameters.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Object} [options]
 * @returns {URL}
 */
function buildWeatherUrl(latitude, longitude, options = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set('latitude', latitude.toString());
  url.searchParams.set('longitude', longitude.toString());
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure'
  );
  // Accurately records requested model configuration (defaults to 'best_match')
  url.searchParams.set('models', options.models || 'best_match');
  url.searchParams.set('timezone', options.timezone || 'auto');

  return url;
}

/**
 * Normalizes Open-Meteo Weather JSON response into a consistent structure.
 *
 * @param {Object} data - Raw JSON response from Open-Meteo
 * @param {number} requestedLat - Original requested latitude
 * @param {number} requestedLon - Original requested longitude
 * @param {string} sourceStatus - 'available' | 'cached'
 * @param {string} requestedModel - Selected model configuration
 * @returns {Object}
 */
function formatWeatherResponse(data, requestedLat, requestedLon, sourceStatus, requestedModel) {
  const current = data.current || {};
  const units = data.current_units || {};
  const windDir = current.wind_direction_10m ?? null;
  const cardinal = windDir !== null ? degreesToCardinal(windDir) : null;

  return {
    status: sourceStatus,
    provider: 'Open-Meteo Weather API',
    modelMetadata: {
      selectedModelConfig: requestedModel,
      modelType: 'Numerical Weather Prediction (NWP) Ensemble / Forecast Model',
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
    weather: {
      temperature: {
        value: current.temperature_2m ?? null,
        unit: units.temperature_2m || '°C',
      },
      apparentTemperature: {
        value: current.apparent_temperature ?? null,
        unit: units.apparent_temperature || '°C',
      },
      relativeHumidity: {
        value: current.relative_humidity_2m ?? null,
        unit: units.relative_humidity_2m || '%',
      },
      precipitation: {
        value: current.precipitation ?? null,
        unit: units.precipitation || 'mm',
      },
      surfacePressure: {
        value: current.surface_pressure ?? null,
        unit: units.surface_pressure || 'hPa',
      },
    },
    wind: {
      speed: {
        value: current.wind_speed_10m ?? null,
        unit: units.wind_speed_10m || 'km/h',
      },
      gusts: {
        value: current.wind_gusts_10m ?? null,
        unit: units.wind_gusts_10m || 'km/h',
      },
      direction: {
        degrees: windDir,
        unit: units.wind_direction_10m || '°',
        originCardinal: cardinal,
      },
      meteorologicalInterpretation:
        'Wind direction denotes the origin direction FROM which air is moving (e.g. 310° / NW indicates wind arrives from the Northwest).',
    },
    disclaimer:
      'Weather parameters are generated by numerical meteorological prediction models (Open-Meteo best_match / reanalysis), NOT real-time on-site weather stations.',
  };
}

/**
 * Fetches weather data from Open-Meteo with caching, timeouts, and retries.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=8000]
 * @param {boolean} [options.bypassCache=false]
 * @param {string} [options.models='best_match']
 * @param {Function} [options.fetchFn=globalThis.fetch]
 * @returns {Promise<Object>}
 */
async function fetchWeatherData(latitude, longitude, options = {}) {
  // Validate coordinates input
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be a float between -90 and 90.`);
  }
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be a float between -180 and 180.`);
  }

  const selectedModel = options.models || 'best_match';
  const cacheKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${selectedModel}`;

  // Check fixed-TTL cache
  if (!options.bypassCache) {
    const cachedRaw = weatherCache.get(cacheKey);
    if (cachedRaw) {
      logger.info(`Weather cache hit for [${latitude}, ${longitude}]`);
      // Reconstruct request-specific metadata using exact requested coordinates
      return formatWeatherResponse(cachedRaw, latitude, longitude, 'cached', selectedModel);
    }
  }

  const targetUrl = buildWeatherUrl(latitude, longitude, options);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetchFn || globalThis.fetch;

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 250 * Math.pow(2, attempt - 1);
        logger.warn(`Retrying Weather request (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after ${backoff}ms...`);
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
        logger.warn(`Open-Meteo Weather rate limited (429)`);
        return {
          status: 'rate_limited',
          provider: 'Open-Meteo Weather API',
          error: 'Rate limit exceeded. Please try again later.',
        };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Strict retry policy: ONLY retry HTTP 502, 503, 504
        const isRetryableStatus =
          response.status === 502 || response.status === 503 || response.status === 504;

        const err = new Error(
          `Open-Meteo Weather returned HTTP ${response.status}: ${errorText || response.statusText}`
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

      // Cache raw upstream response with fixed TTL
      weatherCache.set(cacheKey, rawJson);

      // Reconstruct response with current caller's exact coordinates
      return formatWeatherResponse(rawJson, latitude, longitude, 'available', selectedModel);
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

  logger.error(`Open-Meteo Weather fetch failed: ${lastError?.message}`);
  return {
    status: lastError?.name === 'TimeoutError' ? 'timed_out' : 'unavailable',
    provider: 'Open-Meteo Weather API',
    error: lastError?.message || 'Upstream provider unavailable',
    requestedCoordinates: { latitude, longitude },
  };
}

module.exports = {
  fetchWeatherData,
  buildWeatherUrl,
  formatWeatherResponse,
  degreesToCardinal,
  weatherCache,
};
