/**
 * services/environmentalNormalizer.service.js
 *
 * Normalizes responses from Open-Meteo Air Quality, Open-Meteo Weather,
 * and NASA FIRMS Area API into a consistent, unified internal representation.
 *
 * Design principles:
 *  - Pure transformation functions (zero network I/O, zero side effects).
 *  - Strict data integrity: NEVER replaces missing values with zero.
 *  - Clear data category tagging: explicitly distinguishes numerical model estimates,
 *    meteorological forecasts, satellite thermal radiometry, and ground sensor measurements.
 *  - Preserves native units, timestamps, grid coordinates, and source attributions.
 *  - Foreign AQI separation: European AQI and US EPA AQI are never conflated with Indian CPCB NAQI.
 */

'use strict';

/**
 * Normalizes Open-Meteo Air Quality data into the unified schema.
 *
 * @param {Object} rawAirQuality - Raw or formatted Air Quality response
 * @returns {Object} Normalized air quality object
 */
function normalizeAirQuality(rawAirQuality) {
  if (!rawAirQuality || typeof rawAirQuality !== 'object') {
    return {
      status: 'unavailable',
      dataCategory: 'atmospheric_composition_model',
      isGroundMeasurement: false,
      timestamp: null,
      pollutants: {},
      indices: {},
      metadata: { error: 'No air quality data provided' },
    };
  }

  const meta = rawAirQuality.modelMetadata || {};
  const pollutantsRaw = rawAirQuality.pollutants || {};
  const indicesRaw = rawAirQuality.indices || {};

  // Extract pollutants preserving nulls (never replace with zero)
  const extractPollutant = (entry) => {
    if (!entry || entry.value === undefined || entry.value === null) {
      return { value: null, unit: entry?.unit || 'μg/m³', hasValue: false };
    }
    return {
      value: typeof entry.value === 'number' ? entry.value : parseFloat(entry.value),
      unit: entry.unit || 'μg/m³',
      hasValue: true,
    };
  };

  return {
    status: rawAirQuality.status || 'available',
    dataCategory: 'atmospheric_composition_model',
    isGroundMeasurement: false,
    sourceProvider: rawAirQuality.provider || 'Open-Meteo Air Quality (CAMS Global)',
    modelAttribution: {
      domain: meta.domain || 'cams_global',
      modelName: meta.modelName || 'Copernicus Atmosphere Monitoring Service (CAMS) Global',
      spatialResolution: meta.spatialResolution || '~0.4° (~40-45 km over India)',
      gridCoordinates: meta.modelGridCoordinates || null,
      requestedCoordinates: meta.requestedCoordinates || null,
      generationTimeMs: meta.generationTimeMs ?? null,
    },
    timestamp: rawAirQuality.timestamp || null,
    pollutants: {
      pm25: extractPollutant(pollutantsRaw.pm25),
      pm10: extractPollutant(pollutantsRaw.pm10),
      no2: extractPollutant(pollutantsRaw.nitrogenDioxide || pollutantsRaw.no2),
      so2: extractPollutant(pollutantsRaw.sulphurDioxide || pollutantsRaw.so2),
      co: extractPollutant(pollutantsRaw.carbonMonoxide || pollutantsRaw.co),
      o3: extractPollutant(pollutantsRaw.ozone || pollutantsRaw.o3),
    },
    indices: {
      foreignIndices: {
        europeanAqi: {
          value: indicesRaw.europeanAqi?.value ?? null,
          scale: 'European AQI (0-100+)',
          standard: 'European Environment Agency (EEA)',
          cpcbCalibrated: false,
        },
        usAqi: {
          value: indicesRaw.usAqi?.value ?? null,
          scale: 'US EPA AQI (0-500)',
          standard: 'United States EPA',
          cpcbCalibrated: false,
        },
      },
      cpcbNaqiDisclaimer:
        'Indices are foreign standards (European/US EPA). They are NOT calibrated to the Indian CPCB National Air Quality Index (NAQI).',
    },
    disclaimers: rawAirQuality.disclaimers || {},
  };
}

/**
 * Normalizes Open-Meteo Weather data into the unified schema.
 *
 * @param {Object} rawWeather - Raw or formatted Weather response
 * @returns {Object} Normalized weather object
 */
function normalizeWeather(rawWeather) {
  if (!rawWeather || typeof rawWeather !== 'object') {
    return {
      status: 'unavailable',
      dataCategory: 'meteorological_numerical_forecast',
      isGroundMeasurement: false,
      timestamp: null,
      weather: {},
      wind: {},
      metadata: { error: 'No weather data provided' },
    };
  }

  const meta = rawWeather.modelMetadata || {};
  const weatherRaw = rawWeather.weather || {};
  const windRaw = rawWeather.wind || {};

  const extractMetric = (entry, defaultUnit) => {
    if (!entry || entry.value === undefined || entry.value === null) {
      return { value: null, unit: entry?.unit || defaultUnit, hasValue: false };
    }
    return {
      value: typeof entry.value === 'number' ? entry.value : parseFloat(entry.value),
      unit: entry.unit || defaultUnit,
      hasValue: true,
    };
  };

  const windDegrees = windRaw.direction?.degrees ?? null;

  return {
    status: rawWeather.status || 'available',
    dataCategory: 'meteorological_numerical_forecast',
    isGroundMeasurement: false,
    sourceProvider: rawWeather.provider || 'Open-Meteo Weather API',
    modelAttribution: {
      selectedModelConfig: meta.selectedModelConfig || 'best_match',
      modelType: meta.modelType || 'Numerical Weather Prediction (NWP) Ensemble',
      gridCoordinates: meta.modelGridCoordinates || null,
      requestedCoordinates: meta.requestedCoordinates || null,
      generationTimeMs: meta.generationTimeMs ?? null,
    },
    timestamp: rawWeather.timestamp || null,
    metrics: {
      temperature: extractMetric(weatherRaw.temperature, '°C'),
      apparentTemperature: extractMetric(weatherRaw.apparentTemperature, '°C'),
      relativeHumidity: extractMetric(weatherRaw.relativeHumidity, '%'),
      precipitation: extractMetric(weatherRaw.precipitation, 'mm'),
      surfacePressure: extractMetric(weatherRaw.surfacePressure, 'hPa'),
    },
    wind: {
      speed: extractMetric(windRaw.speed, 'km/h'),
      gusts: extractMetric(windRaw.gusts, 'km/h'),
      direction: {
        degrees: windDegrees !== null && !Number.isNaN(windDegrees) ? windDegrees : null,
        unit: '°',
        originCardinal: windRaw.direction?.originCardinal || null,
        meteorologicalDefinition:
          'Direction FROM which wind originates (e.g. 310° indicates air is arriving from the Northwest).',
      },
    },
    disclaimer: rawWeather.disclaimer || null,
  };
}

/**
 * Normalizes NASA FIRMS thermal anomaly hotspot data into the unified schema.
 *
 * @param {Object} rawFirms - Formatted NASA FIRMS response
 * @returns {Object} Normalized hotspot object
 */
function normalizeThermalHotspots(rawFirms) {
  if (!rawFirms || typeof rawFirms !== 'object') {
    return {
      status: 'unavailable',
      dataCategory: 'satellite_thermal_radiometry',
      isGroundMeasurement: false,
      count: 0,
      hotspots: [],
      metadata: { error: 'No NASA FIRMS data provided' },
    };
  }

  const rawHotspots = Array.isArray(rawFirms.hotspots) ? rawFirms.hotspots : [];

  const normalizedHotspots = rawHotspots.map((h) => ({
    latitude: typeof h.latitude === 'number' ? h.latitude : parseFloat(h.latitude),
    longitude: typeof h.longitude === 'number' ? h.longitude : parseFloat(h.longitude),
    distanceKm: typeof h.distanceKm === 'number' ? h.distanceKm : parseFloat(h.distanceKm),
    bearingDegrees: typeof h.bearingDegrees === 'number' ? h.bearingDegrees : parseFloat(h.bearingDegrees),
    acquisitionTimestampUtc:
      h.acquisitionDate && h.acquisitionTimeUtc
        ? `${h.acquisitionDate}T${h.acquisitionTimeUtc.slice(0, 2)}:${h.acquisitionTimeUtc.slice(2, 4)}:00Z`
        : null,
    satellite: h.satellite || 'Unknown',
    instrument: h.instrument || 'VIIRS',
    confidence: h.confidence || 'nominal',
    brightnessKelvin: h.brightnessKelvin ?? null,
    fireRadiativePowerMw: h.fireRadiativePowerMw ?? null,
    dayNight: h.dayNight === 'D' ? 'Day' : h.dayNight === 'N' ? 'Night' : (h.dayNight || 'Unknown'),
    isPotentialUpwind: Boolean(h.isPotentialUpwind),
    angularDifferenceDegrees: h.angularDifferenceDegrees ?? null,
  }));

  return {
    status: rawFirms.status || 'available',
    dataCategory: 'satellite_thermal_radiometry',
    isGroundMeasurement: false,
    sourceProvider: rawFirms.provider || 'NASA FIRMS Area API',
    sensorSource: rawFirms.sensorSource || 'VIIRS_SNPP_NRT',
    requestedCoordinates: rawFirms.requestedCoordinates || null,
    count: normalizedHotspots.length,
    hotspots: normalizedHotspots,
    correlationSummary: rawFirms.correlationSummary || {
      totalHotspotsWithinRadius: normalizedHotspots.length,
      potentialUpwindHotspots: normalizedHotspots.filter((h) => h.isPotentialUpwind).length,
    },
    disclaimers: rawFirms.disclaimers || {},
  };
}

/**
 * Combines normalized streams into an integrated environmental intelligence dataset.
 *
 * @param {Object} params
 * @param {Object} params.airQuality
 * @param {Object} params.weather
 * @param {Object} params.thermalHotspots
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {number} [params.radiusKm=50]
 * @returns {Object} Composite normalized report
 */
function normalizeEnvironmentalDataset({ airQuality, weather, thermalHotspots, latitude, longitude, radiusKm = 50 }) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      requestedLocation: {
        latitude,
        longitude,
        radiusKm,
      },
      pipelineVersion: 'HackOps2-Phase2-NormVal',
    },
    airQuality: normalizeAirQuality(airQuality),
    weather: normalizeWeather(weather),
    thermalHotspots: normalizeThermalHotspots(thermalHotspots),
  };
}

module.exports = {
  normalizeAirQuality,
  normalizeWeather,
  normalizeThermalHotspots,
  normalizeEnvironmentalDataset,
};
