/**
 * services/nasaFirms.service.js
 *
 * Framework-independent client for the NASA FIRMS (Fire Information for Resource Management System)
 * Area API. Retrieves active thermal anomalies (potential fire/biomass burning hotspots) detected
 * by VIIRS and MODIS polar-orbiting satellite instruments.
 *
 * Architecture standards:
 *  - Independent of Express req/res.
 *  - Secure credential management: reads NASA_FIRMS_MAP_KEY strictly from process.env.
 *    Never hardcodes, logs, or exposes the key in client-facing responses.
 *  - Robust RFC 4180 CSV parsing via csvParser.util.js.
 *  - Strict Haversine distance filtering (preserves actual requested radius).
 *  - Antimeridian and polar boundary handling via geoUtils.js.
 *  - Recalculates hotspot distances and bearings for each specific request.
 *  - Strict retry policy: 502, 503, 504 and timeouts only.
 *  - Absolute scientific attribution neutrality: Never claims a detected fire caused local pollution,
 *    and never assigns regional or state-level blame.
 */

'use strict';

const SimpleTtlCache = require('../utils/cache.util');
const { parseNasaFirmsCsv } = require('../utils/csvParser.util');
const {
  haversineDistance,
  calculateBearing,
  checkUpwindCorrelation,
  calculateBoundingBoxes,
} = require('../utils/geoUtils');
const logger = require('../utils/logger');

const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const DEFAULT_SOURCE = 'VIIRS_SNPP_NRT';

// Dedicated cache instance for NASA FIRMS queries
const nasaFirmsCache = new SimpleTtlCache({
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
 * Builds the URL for NASA FIRMS Area API.
 * Never includes mapKey in logs.
 *
 * @param {string} mapKey
 * @param {string} source
 * @param {string} bboxString
 * @param {number} dayRange
 * @returns {string}
 */
function buildFirmsUrl(mapKey, source, bboxString, dayRange) {
  return `${BASE_URL}/${encodeURIComponent(mapKey)}/${encodeURIComponent(source)}/${bboxString}/${dayRange}`;
}

/**
 * Fetches raw CSV text for a single bounding box with retries and timeout.
 *
 * @param {string} mapKey
 * @param {string} source
 * @param {string} bboxString
 * @param {number} dayRange
 * @param {Object} options
 * @returns {Promise<{ status: string, csvText?: string, error?: string }>}
 */
async function fetchBboxCsv(mapKey, source, bboxString, dayRange, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const targetUrl = buildFirmsUrl(mapKey, source, bboxString, dayRange);

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 250 * Math.pow(2, attempt - 1);
        logger.warn(`Retrying NASA FIRMS request (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after ${backoff}ms...`);
        await sleep(backoff);
      }

      const response = await fetchFn(targetUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'text/csv, text/plain',
          'User-Agent': 'HackOps2-Environmental-Intelligence/1.0',
        },
      });

      if (response.status === 429) {
        logger.warn('NASA FIRMS rate limited (429)');
        return { status: 'rate_limited', error: 'NASA FIRMS API rate limit reached.' };
      }

      if (response.status === 401 || response.status === 403) {
        logger.warn('NASA FIRMS authentication failed (invalid or expired MAP_KEY)');
        return {
          status: 'auth_error',
          error: 'NASA FIRMS authentication rejected. Please check NASA_FIRMS_MAP_KEY configuration.',
        };
      }

      if (!response.ok) {
        const errorText =
          typeof response.text === 'function' ? await response.text().catch(() => '') : '';
        const isRetryableStatus =
          response.status === 502 || response.status === 503 || response.status === 504;

        const err = new Error(`NASA FIRMS HTTP ${response.status}: ${errorText || response.statusText}`);
        err.statusCode = response.status;
        err.isTransient = isRetryableStatus;

        if (isRetryableStatus && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }

      const csvText = await response.text();
      return { status: 'ok', csvText };
    } catch (err) {
      lastError = err;

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

  return {
    status: lastError?.name === 'TimeoutError' ? 'timed_out' : 'unavailable',
    error: lastError?.message || 'NASA FIRMS API unavailable',
  };
}

/**
 * Queries NASA FIRMS Area API, handles multi-bbox antimeridian crossing,
 * deduplicates raw detections, filters strictly by circular Haversine radius,
 * and computes relative bearings and optional upwind correlation.
 *
 * @param {number} latitude - Requested center latitude [-90, 90]
 * @param {number} longitude - Requested center longitude [-180, 180]
 * @param {number} [radiusKm=50] - Circular search radius in kilometers (e.g. 50 km)
 * @param {Object} [options]
 * @param {number} [options.dayRange=1] - 1 to 10 days
 * @param {string} [options.source='VIIRS_SNPP_NRT'] - VIIRS or MODIS instrument product
 * @param {number} [options.windOriginDeg] - Optional meteorological wind origin direction [0, 360)
 * @param {number} [options.upwindToleranceDeg=30] - Sector width for potential upwind classification
 * @param {boolean} [options.bypassCache=false]
 * @param {Function} [options.fetchFn] - Injectable fetch for offline unit tests
 * @returns {Promise<Object>}
 */
async function fetchThermalHotspots(latitude, longitude, radiusKm = 50, options = {}) {
  // 1. Input validations
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be a float between -90 and 90.`);
  }
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be a float between -180 and 180.`);
  }
  if (typeof radiusKm !== 'number' || Number.isNaN(radiusKm) || radiusKm <= 0 || radiusKm > 1000) {
    throw new Error(`Invalid radiusKm: ${radiusKm}. Must be a number between 1 and 1000.`);
  }

  const dayRange = Math.min(Math.max(parseInt(options.dayRange, 10) || 1, 1), 10);
  const source = options.source || DEFAULT_SOURCE;

  // 2. Check for configured MAP_KEY strictly from environment
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!mapKey) {
    logger.warn('NASA_FIRMS_MAP_KEY is missing from environment. Hotspot analysis unavailable.');
    return {
      status: 'key_missing',
      provider: 'NASA FIRMS Area API',
      requestedCoordinates: { latitude, longitude, radiusKm },
      count: 0,
      hotspots: [],
      error: 'NASA_FIRMS_MAP_KEY is not configured in the environment.',
      disclaimers: {
        scientificDisclaimer:
          'Thermal anomaly monitoring requires a valid NASA FIRMS MAP_KEY configured server-side.',
      },
    };
  }

  // 3. Compute geographic bounding boxes (handles antimeridian splitting & poles)
  const bboxes = calculateBoundingBoxes(latitude, longitude, radiusKm);

  // Cache key based on rounded inputs (raw detections cached per bbox area)
  const cacheKey = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radiusKm}:${dayRange}:${source}`;

  let rawDetections = null;
  let sourceStatus = 'available';

  if (!options.bypassCache) {
    const cached = nasaFirmsCache.get(cacheKey);
    if (cached) {
      rawDetections = cached;
      sourceStatus = 'cached';
    }
  }

  // 4. Fetch raw data if not cached
  if (!rawDetections) {
    const combinedRows = [];
    let hasFailure = false;
    let failureStatus = 'unavailable';
    let failureError = null;

    for (const box of bboxes) {
      const fetchResult = await fetchBboxCsv(mapKey, source, box.bboxString, dayRange, options);

      if (fetchResult.status !== 'ok') {
        hasFailure = true;
        failureStatus = fetchResult.status;
        failureError = fetchResult.error;
        break;
      }

      const parsed = parseNasaFirmsCsv(fetchResult.csvText);
      if (!parsed.success) {
        hasFailure = true;
        failureStatus = 'parse_error';
        failureError = parsed.error;
        break;
      }

      combinedRows.push(...parsed.rows);
    }

    if (hasFailure) {
      logger.error(`NASA FIRMS query failed: ${failureError}`);
      return {
        status: failureStatus,
        provider: 'NASA FIRMS Area API',
        requestedCoordinates: { latitude, longitude, radiusKm },
        count: 0,
        hotspots: [],
        error: failureError,
      };
    }

    // Deduplicate across bounding boxes (if split across antimeridian)
    const seen = new Set();
    const deduped = [];
    for (const row of combinedRows) {
      if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') continue;
      const key = `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)},${row.acq_date || ''},${row.acq_time || ''},${row.satellite || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
      }
    }

    rawDetections = deduped;
    nasaFirmsCache.set(cacheKey, rawDetections);
  }

  // 5. Always recalculate exact circular Haversine distance, bearing, and upwind correlation
  //    for the CURRENT caller's exact coordinates (never return rounded calculations from cache)
  const windOrigin = typeof options.windOriginDeg === 'number' ? options.windOriginDeg : null;
  const upwindTol = options.upwindToleranceDeg || 30;

  const filteredHotspots = [];
  let upwindCount = 0;

  for (const det of rawDetections) {
    const distanceKm = haversineDistance(latitude, longitude, det.latitude, det.longitude);

    // Exact circular radius filter: bounding box is a square; discard outer corners
    if (distanceKm > radiusKm) {
      continue;
    }

    const bearing = calculateBearing(latitude, longitude, det.latitude, det.longitude);

    let upwindInfo = { isUpwind: false, angularDiff: null };
    if (windOrigin !== null) {
      upwindInfo = checkUpwindCorrelation(latitude, longitude, det.latitude, det.longitude, windOrigin, upwindTol);
      if (upwindInfo.isUpwind) {
        upwindCount++;
      }
    }

    filteredHotspots.push({
      latitude: det.latitude,
      longitude: det.longitude,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      bearingDegrees: parseFloat(bearing.toFixed(1)),
      acquisitionDate: det.acq_date || null,
      acquisitionTimeUtc: det.acq_time || null,
      satellite: det.satellite || 'Unknown',
      instrument: det.instrument || source.split('_')[0],
      confidence: det.confidence || 'nominal',
      brightnessKelvin: det.bright_ti4 || det.brightness || null,
      fireRadiativePowerMw: det.frp ?? null,
      dayNight: det.daynight || null,
      isPotentialUpwind: upwindInfo.isUpwind,
      angularDifferenceDegrees: upwindInfo.angularDiff,
    });
  }

  // Sort hotspots by distance ascending
  filteredHotspots.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    status: sourceStatus,
    provider: 'NASA FIRMS Area API',
    sensorSource: source,
    requestedCoordinates: {
      latitude,
      longitude,
      radiusKm,
    },
    count: filteredHotspots.length,
    hotspots: filteredHotspots,
    correlationSummary: {
      totalHotspotsWithinRadius: filteredHotspots.length,
      potentialUpwindHotspots: upwindCount,
      windOriginDegrees: windOrigin,
      upwindToleranceDegrees: upwindTol,
    },
    disclaimers: {
      scientificDisclaimer:
        'Detected hotspots represent active satellite thermal anomalies (elevated radiative temperature from biomass burning, agricultural activities, or industrial flares).',
      causalityDisclaimer:
        'Thermal anomaly detection does NOT establish a direct causal link to ground-level ambient pollution concentrations at the target location. Meteorological dispersion, planetary boundary layer height, and chemical transformation dictate surface impact.',
      regionalNeutralityDisclaimer:
        'Spatial correlations must not be used to assign regional or cross-border jurisdictional responsibility.',
    },
  };
}

module.exports = {
  fetchThermalHotspots,
  buildFirmsUrl,
  nasaFirmsCache,
};
