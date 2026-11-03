/**
 * tests/stage3.test.js
 *
 * Comprehensive unit test suite for Stage 3:
 *  - environmentalNormalizer.service.js
 *  - environmentalValidator.service.js
 */

'use strict';

const {
  normalizeAirQuality,
  normalizeWeather,
  normalizeThermalHotspots,
  normalizeEnvironmentalDataset,
} = require('../services/environmentalNormalizer.service');

const {
  validateCoordinates,
  validateTimestamp,
  validatePollutants,
  validateWeatherMetrics,
  validateHotspots,
  validateNormalizedEnvironmentalData,
} = require('../services/environmentalValidator.service');

async function runStage3Tests() {
  console.log('\n======================================================');
  console.log(' RUNNING STAGE 3 TESTS: NORMALIZATION & DETERMINISTIC VALIDATION');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error('       Details:', details);
      failed++;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: ENVIRONMENTAL NORMALIZER TESTS
  // ══════════════════════════════════════════════════════════════════════════

  // 1.1: Air Quality Normalization (CAMS model, no ground sensors, null preservation)
  {
    const rawAq = {
      status: 'available',
      provider: 'Open-Meteo Air Quality API',
      modelMetadata: {
        domain: 'cams_global',
        modelName: 'Copernicus Atmosphere Monitoring Service (CAMS) Global',
        spatialResolution: '~0.4° (~40-45 km over India)',
        requestedCoordinates: { latitude: 28.6139, longitude: 77.2090 },
        modelGridCoordinates: { latitude: 28.625, longitude: 77.25, elevationMeters: 215 },
      },
      timestamp: '2026-11-03T12:00',
      pollutants: {
        pm25: { value: 85.5, unit: 'μg/m³' },
        pm10: { value: null, unit: 'μg/m³' }, // Missing value
      },
      indices: {
        europeanAqi: { value: 75, unit: 'AQI' },
        usAqi: { value: 160, unit: 'AQI' },
      },
    };

    const normAq = normalizeAirQuality(rawAq);
    assert(
      normAq.dataCategory === 'atmospheric_composition_model' && normAq.isGroundMeasurement === false,
      'Test 1.1: Air quality tagged as atmospheric model, not ground measurement'
    );
    assert(
      normAq.pollutants.pm25.value === 85.5 && normAq.pollutants.pm25.hasValue === true,
      'Test 1.2: Valid pollutant parsed with hasValue=true'
    );
    assert(
      normAq.pollutants.pm10.value === null && normAq.pollutants.pm10.hasValue === false,
      'Test 1.3: Missing pollutant preserved as null (NEVER replaced with zero)'
    );
    assert(
      normAq.indices.foreignIndices.europeanAqi.cpcbCalibrated === false &&
        normAq.indices.cpcbNaqiDisclaimer.includes('NOT calibrated to the Indian CPCB'),
      'Test 1.4: Foreign AQI clearly flagged as not CPCB NAQI'
    );
  }

  // 1.2: Weather Normalization (best_match config, wind origin)
  {
    const rawWeather = {
      status: 'available',
      modelMetadata: {
        selectedModelConfig: 'best_match',
        requestedCoordinates: { latitude: 28.6139, longitude: 77.2090 },
      },
      timestamp: '2026-11-03T12:00',
      weather: {
        temperature: { value: 26.2, unit: '°C' },
        relativeHumidity: { value: null, unit: '%' },
      },
      wind: {
        speed: { value: 14.5, unit: 'km/h' },
        direction: { degrees: 310, originCardinal: 'NW' },
      },
    };

    const normW = normalizeWeather(rawWeather);
    assert(
      normW.dataCategory === 'meteorological_numerical_forecast' && normW.isGroundMeasurement === false,
      'Test 1.5: Weather tagged as numerical forecast, not ground measurement'
    );
    assert(
      normW.metrics.temperature.value === 26.2 && normW.metrics.relativeHumidity.value === null,
      'Test 1.6: Metrics preserved accurately without zero-replacement'
    );
    assert(
      normW.wind.direction.originCardinal === 'NW' &&
        normW.wind.direction.meteorologicalDefinition.includes('Direction FROM which wind originates'),
      'Test 1.7: Meteorological wind direction definition preserved'
    );
  }

  // 1.3: Hotspot Normalization (VIIRS satellite, distance, upwind flag)
  {
    const rawFirms = {
      status: 'available',
      provider: 'NASA FIRMS Area API',
      sensorSource: 'VIIRS_SNPP_NRT',
      hotspots: [
        {
          latitude: 28.75,
          longitude: 77.10,
          distanceKm: 18.2,
          bearingDegrees: 320.5,
          acq_date: '2026-11-03',
          acq_time: '0730',
          satellite: 'N',
          instrument: 'VIIRS',
          confidence: 'nominal',
          fireRadiativePowerMw: 12.8,
          isPotentialUpwind: true,
          angularDifferenceDegrees: 10.5,
        },
      ],
    };

    const normH = normalizeThermalHotspots(rawFirms);
    assert(
      normH.dataCategory === 'satellite_thermal_radiometry' && normH.isGroundMeasurement === false,
      'Test 1.8: Hotspots tagged as satellite radiometry'
    );
    assert(
      normH.hotspots[0].distanceKm === 18.2 && normH.hotspots[0].isPotentialUpwind === true,
      'Test 1.9: Distance and upwind status preserved'
    );
    assert(
      normH.hotspots[0].fireRadiativePowerMw === 12.8,
      'Test 1.10: FRP value preserved'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: DETERMINISTIC VALIDATOR TESTS
  // ══════════════════════════════════════════════════════════════════════════

  // 2.1: Coordinate Validation
  {
    const validIssues = validateCoordinates(28.6139, 77.2090);
    assert(validIssues.length === 0, 'Test 2.1: Valid coordinates produce zero issues');

    const invalidLat = validateCoordinates(95.5, 77.2090);
    assert(
      invalidLat.length === 1 && invalidLat[0].level === 'error' && invalidLat[0].field === 'latitude',
      'Test 2.2: Latitude > 90 produces error'
    );

    const invalidLon = validateCoordinates(28.6139, -195.0);
    assert(
      invalidLon.length === 1 && invalidLon[0].level === 'error' && invalidLon[0].field === 'longitude',
      'Test 2.3: Longitude < -180 produces error'
    );
  }

  // 2.2: Timestamp Validation
  {
    const nowIso = new Date().toISOString();
    const validTs = validateTimestamp(nowIso, 'TestProvider');
    assert(validTs.length === 0, 'Test 2.4: Current ISO timestamp produces zero issues');

    const invalidTs = validateTimestamp('not-a-date', 'TestProvider');
    assert(
      invalidTs.length === 1 && invalidTs[0].level === 'error',
      'Test 2.5: Unparseable timestamp produces error'
    );

    // Stale timestamp (5 days / 120 hours old)
    const staleDate = new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString();
    const staleTs = validateTimestamp(staleDate, 'TestProvider');
    assert(
      staleTs.length === 1 && staleTs[0].level === 'warning' && staleTs[0].message.includes('stale'),
      'Test 2.6: 5-day-old timestamp produces stale warning'
    );
  }

  // 2.3: Pollutant Boundaries & Extreme Rules
  {
    // Physical impossibility: negative concentration
    const negativePm = validatePollutants({
      pm25: { value: -12.5, unit: 'μg/m³', hasValue: true },
    });
    assert(
      negativePm.some((i) => i.level === 'error' && i.message.includes('negative')),
      'Test 2.7: Negative PM2.5 triggers ERROR (physical impossibility)'
    );

    // Extreme plausible reading: PM2.5 = 1200 μg/m³
    const extremePm = validatePollutants({
      pm25: { value: 1200, unit: 'μg/m³', hasValue: true },
    });
    assert(
      extremePm.some((i) => i.level === 'warning' && i.message.includes('Extremely elevated')),
      'Test 2.8: PM2.5 > 1000 triggers WARNING for human review (NOT rejected as error)'
    );

    // Missing value triggers INFO, not error
    const missingPm = validatePollutants({
      pm10: { value: null, unit: 'μg/m³', hasValue: false },
    });
    assert(
      missingPm.some((i) => i.level === 'info' && i.message.includes('unavailable')),
      'Test 2.9: Missing PM10 triggers INFO message'
    );
  }

  // 2.4: Weather Boundaries
  {
    // Invalid Relative Humidity (> 100%)
    const badRh = validateWeatherMetrics({ relativeHumidity: { value: 115 } }, {});
    assert(
      badRh.some((i) => i.level === 'error' && i.field === 'relativeHumidity'),
      'Test 2.10: Relative humidity > 100% triggers ERROR'
    );

    // Negative Wind Speed
    const badWs = validateWeatherMetrics({}, { speed: { value: -5 } });
    assert(
      badWs.some((i) => i.level === 'error' && i.field === 'windSpeed'),
      'Test 2.11: Negative wind speed triggers ERROR'
    );

    // Wind Direction outside [0, 360]
    const badWd = validateWeatherMetrics({}, { direction: { degrees: 400 } });
    assert(
      badWd.some((i) => i.level === 'error' && i.field === 'windDirection'),
      'Test 2.12: Wind direction 400° triggers ERROR'
    );
  }

  // 2.5: Hotspot Bounds & Distance Enforcement
  {
    // Hotspot outside requested radius
    const badDist = validateHotspots(
      [{ latitude: 28.5, longitude: 77.1, distanceKm: 65, fireRadiativePowerMw: 10 }],
      50 // requested 50 km
    );
    assert(
      badDist.some((i) => i.level === 'error' && i.message.includes('exceeds requested radius')),
      'Test 2.13: Hotspot exceeding requested radius triggers ERROR'
    );

    // Negative FRP
    const badFrp = validateHotspots(
      [{ latitude: 28.5, longitude: 77.1, distanceKm: 20, fireRadiativePowerMw: -5 }],
      50
    );
    assert(
      badFrp.some((i) => i.level === 'error' && i.field.includes('.frp')),
      'Test 2.14: Negative FRP triggers ERROR'
    );
  }

  // 2.6: Composite Dataset Validation (VALID, VALID_WITH_WARNINGS, INVALID)
  {
    // A. Valid dataset with minor extreme warning
    const sampleDataset = normalizeEnvironmentalDataset({
      latitude: 28.6139,
      longitude: 77.2090,
      radiusKm: 50,
      airQuality: {
        status: 'available',
        timestamp: new Date().toISOString(),
        pollutants: { pm25: { value: 1200, unit: 'μg/m³' } }, // extreme reading > 1000 triggers warning
      },
      weather: {
        status: 'available',
        timestamp: new Date().toISOString(),
        weather: { temperature: { value: 28 } },
        wind: { speed: { value: 12 }, direction: { degrees: 310 } },
      },
      thermalHotspots: {
        status: 'available',
        hotspots: [{ latitude: 28.7, longitude: 77.2, distanceKm: 15 }],
      },
    });

    const report = validateNormalizedEnvironmentalData(sampleDataset);
    assert(report.isValid === true, 'Test 2.15: Dataset with plausible extremes is valid');
    assert(report.status === 'VALID_WITH_WARNINGS', 'Test 2.16: Status is VALID_WITH_WARNINGS');

    // B. Fatal error dataset (out of bounds latitude)
    sampleDataset.metadata.requestedLocation.latitude = 120.0;
    const errorReport = validateNormalizedEnvironmentalData(sampleDataset);
    assert(errorReport.isValid === false, 'Test 2.17: Out of bounds latitude marks dataset invalid');
    assert(errorReport.status === 'INVALID', 'Test 2.18: Status is INVALID when errors exist');
  }

  console.log('\n======================================================');
  console.log(` STAGE 3 SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runStage3Tests().catch((err) => {
    console.error('Stage 3 test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runStage3Tests };
