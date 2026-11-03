/**
 * services/environmentalValidator.service.js
 *
 * Deterministic validation engine for environmental intelligence data.
 * Checks coordinate boundaries, timestamp freshness, physical plausible ranges,
 * negative concentration anomalies, and unit validity.
 *
 * Design principles:
 *  - Pure validation functions (zero network I/O, zero external dependencies).
 *  - Distinguishes fatal ERRORS (physically impossible data, e.g. negative concentration, lat > 90)
 *    from actionable WARNINGS (plausible extremes like PM2.5 > 500, stale data, missing optional metrics).
 *  - Never mutates input or imputes missing values.
 */

'use strict';

const STALE_DATA_THRESHOLD_HOURS = 72; // Flag data older than 3 days
const FUTURE_TOLERANCE_HOURS = 24;     // Tolerate numerical forecast models up to 24 hours ahead

/**
 * Validates geographic coordinates.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Array<{ level: 'error'|'warning', field: string, message: string }>}
 */
function validateCoordinates(latitude, longitude) {
  const issues = [];

  if (typeof latitude !== 'number' || Number.isNaN(latitude)) {
    issues.push({ level: 'error', field: 'latitude', message: `Latitude must be a valid number. Received: ${latitude}` });
  } else if (latitude < -90.0 || latitude > 90.0) {
    issues.push({ level: 'error', field: 'latitude', message: `Latitude ${latitude} is outside valid bounds [-90, 90].` });
  }

  if (typeof longitude !== 'number' || Number.isNaN(longitude)) {
    issues.push({ level: 'error', field: 'longitude', message: `Longitude must be a valid number. Received: ${longitude}` });
  } else if (longitude < -180.0 || longitude > 180.0) {
    issues.push({ level: 'error', field: 'longitude', message: `Longitude ${longitude} is outside valid bounds [-180, 180].` });
  }

  return issues;
}

/**
 * Validates an ISO timestamp for parseability, future horizon, and staleness.
 *
 * @param {string|null} timestampStr
 * @param {string} sourceName
 * @returns {Array<{ level: 'error'|'warning'|'info', field: string, message: string }>}
 */
function validateTimestamp(timestampStr, sourceName) {
  const issues = [];
  if (!timestampStr) {
    issues.push({ level: 'warning', field: 'timestamp', message: `${sourceName}: Timestamp is missing.` });
    return issues;
  }

  const date = new Date(timestampStr);
  if (Number.isNaN(date.getTime())) {
    issues.push({ level: 'error', field: 'timestamp', message: `${sourceName}: Invalid or unparseable timestamp '${timestampStr}'.` });
    return issues;
  }

  const now = Date.now();
  const diffHours = (now - date.getTime()) / (1000 * 60 * 60);

  // Future check (allowing forecast models up to tolerance)
  if (diffHours < -FUTURE_TOLERANCE_HOURS) {
    issues.push({
      level: 'warning',
      field: 'timestamp',
      message: `${sourceName}: Timestamp '${timestampStr}' is more than ${FUTURE_TOLERANCE_HOURS} hours in the future.`,
    });
  }

  // Staleness check
  if (diffHours > STALE_DATA_THRESHOLD_HOURS) {
    issues.push({
      level: 'warning',
      field: 'timestamp',
      message: `${sourceName}: Data timestamp '${timestampStr}' is stale (${Math.round(diffHours)} hours old).`,
    });
  }

  return issues;
}

/**
 * Validates pollutant concentration values against physical limits and extreme thresholds.
 *
 * @param {Object} pollutants
 * @returns {Array<{ level: 'error'|'warning'|'info', field: string, message: string }>}
 */
function validatePollutants(pollutants = {}) {
  const issues = [];

  const limits = {
    pm25: { maxPlausible: 1000, label: 'PM2.5' },
    pm10: { maxPlausible: 2000, label: 'PM10' },
    no2:  { maxPlausible: 1000, label: 'NO2' },
    so2:  { maxPlausible: 1500, label: 'SO2' },
    co:   { maxPlausible: 100000, label: 'CO' },
    o3:   { maxPlausible: 1000, label: 'O3' },
  };

  for (const [key, config] of Object.entries(limits)) {
    const entry = pollutants[key];
    if (!entry || !entry.hasValue || entry.value === null) {
      issues.push({ level: 'info', field: key, message: `${config.label} reading is unavailable.` });
      continue;
    }

    const val = entry.value;

    if (typeof val !== 'number' || Number.isNaN(val)) {
      issues.push({ level: 'error', field: key, message: `${config.label} value is not a valid number: ${val}` });
      continue;
    }

    // Physical impossibility: Negative concentration
    if (val < 0) {
      issues.push({
        level: 'error',
        field: key,
        message: `${config.label} concentration is negative (${val} ${entry.unit}). Physical concentrations cannot be less than zero.`,
      });
      continue;
    }

    // Extreme plausible ceiling: triggers warning for human review, not rejected
    if (val > config.maxPlausible) {
      issues.push({
        level: 'warning',
        field: key,
        message: `Extremely elevated ${config.label} reading detected (${val} ${entry.unit}). Exceeds typical physical threshold of ${config.maxPlausible}. Requires review.`,
      });
    }
  }

  return issues;
}

/**
 * Validates meteorological metrics.
 *
 * @param {Object} metrics
 * @param {Object} wind
 * @returns {Array<{ level: 'error'|'warning'|'info', field: string, message: string }>}
 */
function validateWeatherMetrics(metrics = {}, wind = {}) {
  const issues = [];

  // Temperature (-60°C to +60°C plausible)
  const temp = metrics.temperature?.value;
  if (temp !== null && temp !== undefined) {
    if (temp < -60 || temp > 60) {
      issues.push({ level: 'warning', field: 'temperature', message: `Unusually extreme temperature reading: ${temp}°C.` });
    }
  }

  // Relative Humidity (strictly 0% to 100%)
  const rh = metrics.relativeHumidity?.value;
  if (rh !== null && rh !== undefined) {
    if (rh < 0 || rh > 100) {
      issues.push({ level: 'error', field: 'relativeHumidity', message: `Relative humidity ${rh}% is outside physically valid range [0, 100%].` });
    }
  }

  // Surface Pressure (typically 800 - 1100 hPa)
  const sp = metrics.surfacePressure?.value;
  if (sp !== null && sp !== undefined) {
    if (sp < 500 || sp > 1100) {
      issues.push({ level: 'warning', field: 'surfacePressure', message: `Unusual surface pressure reading: ${sp} hPa.` });
    }
  }

  // Wind speed (cannot be negative)
  const ws = wind.speed?.value;
  if (ws !== null && ws !== undefined) {
    if (ws < 0) {
      issues.push({ level: 'error', field: 'windSpeed', message: `Wind speed cannot be negative: ${ws} km/h.` });
    } else if (ws > 200) {
      issues.push({ level: 'warning', field: 'windSpeed', message: `Extreme hurricane-force wind speed detected: ${ws} km/h.` });
    }
  }

  // Wind direction (0° to 360°)
  const wd = wind.direction?.degrees;
  if (wd !== null && wd !== undefined) {
    if (wd < 0 || wd > 360) {
      issues.push({ level: 'error', field: 'windDirection', message: `Wind direction ${wd}° is outside standard compass range [0, 360°].` });
    }
  }

  return issues;
}

/**
 * Validates satellite thermal anomaly hotspots.
 *
 * @param {Array<Object>} hotspots
 * @param {number} maxRadiusKm
 * @returns {Array<{ level: 'error'|'warning'|'info', field: string, message: string }>}
 */
function validateHotspots(hotspots = [], maxRadiusKm = 50) {
  const issues = [];

  for (let i = 0; i < hotspots.length; i++) {
    const h = hotspots[i];

    // Latitude & Longitude
    if (h.latitude < -90 || h.latitude > 90 || h.longitude < -180 || h.longitude > 180) {
      issues.push({
        level: 'error',
        field: `hotspot[${i}].coordinates`,
        message: `Hotspot #${i + 1} has out-of-bounds coordinates (${h.latitude}, ${h.longitude}).`,
      });
    }

    // FRP (Fire Radiative Power) cannot be negative
    if (h.fireRadiativePowerMw !== null && h.fireRadiativePowerMw !== undefined) {
      if (h.fireRadiativePowerMw < 0) {
        issues.push({
          level: 'error',
          field: `hotspot[${i}].frp`,
          message: `Hotspot #${i + 1} FRP cannot be negative (${h.fireRadiativePowerMw} MW).`,
        });
      }
    }

    // Distance check: ensure strict circular radius filtering was applied
    if (h.distanceKm > maxRadiusKm) {
      issues.push({
        level: 'error',
        field: `hotspot[${i}].distanceKm`,
        message: `Hotspot #${i + 1} distance (${h.distanceKm} km) exceeds requested radius of ${maxRadiusKm} km.`,
      });
    }
  }

  return issues;
}

/**
 * Comprehensive deterministic validator for a normalized environmental intelligence dataset.
 *
 * @param {Object} dataset - Output of normalizeEnvironmentalDataset
 * @returns {Object} Structured validation report
 */
function validateNormalizedEnvironmentalData(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    return {
      isValid: false,
      status: 'INVALID',
      issueCounts: { errors: 1, warnings: 0, info: 0 },
      issues: {
        errors: [{ level: 'error', field: 'dataset', message: 'Dataset is null or invalid.' }],
        warnings: [],
        info: [],
      },
    };
  }

  const allIssues = [];

  // 1. Validate Requested Coordinates
  const reqLoc = dataset.metadata?.requestedLocation || {};
  if (reqLoc.latitude !== undefined && reqLoc.longitude !== undefined) {
    allIssues.push(...validateCoordinates(reqLoc.latitude, reqLoc.longitude));
  }

  // 2. Validate Air Quality
  const aq = dataset.airQuality || {};
  if (aq.status === 'available' || aq.status === 'cached') {
    allIssues.push(...validateTimestamp(aq.timestamp, 'Air Quality'));
    allIssues.push(...validatePollutants(aq.pollutants));
  } else {
    allIssues.push({
      level: 'warning',
      field: 'airQuality.status',
      message: `Air Quality data status is '${aq.status}'.`,
    });
  }

  // 3. Validate Weather
  const weather = dataset.weather || {};
  if (weather.status === 'available' || weather.status === 'cached') {
    allIssues.push(...validateTimestamp(weather.timestamp, 'Weather'));
    allIssues.push(...validateWeatherMetrics(weather.metrics, weather.wind));
  } else {
    allIssues.push({
      level: 'warning',
      field: 'weather.status',
      message: `Weather data status is '${weather.status}'.`,
    });
  }

  // 4. Validate Hotspots
  const firms = dataset.thermalHotspots || {};
  const radiusKm = reqLoc.radiusKm || 50;
  if (firms.status === 'available' || firms.status === 'cached') {
    allIssues.push(...validateHotspots(firms.hotspots, radiusKm));
  } else {
    allIssues.push({
      level: 'info',
      field: 'thermalHotspots.status',
      message: `Thermal hotspot monitoring status is '${firms.status}'.`,
    });
  }

  // Group issues by level
  const errors = allIssues.filter((i) => i.level === 'error');
  const warnings = allIssues.filter((i) => i.level === 'warning');
  const info = allIssues.filter((i) => i.level === 'info');

  const isValid = errors.length === 0;
  let status = 'VALID';
  if (errors.length > 0) {
    status = 'INVALID';
  } else if (warnings.length > 0) {
    status = 'VALID_WITH_WARNINGS';
  }

  return {
    isValid,
    status,
    issueCounts: {
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
    },
    issues: {
      errors,
      warnings,
      info,
    },
  };
}

module.exports = {
  validateCoordinates,
  validateTimestamp,
  validatePollutants,
  validateWeatherMetrics,
  validateHotspots,
  validateNormalizedEnvironmentalData,
};
