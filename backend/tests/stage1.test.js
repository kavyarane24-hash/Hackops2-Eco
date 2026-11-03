/**
 * tests/stage1.test.js
 *
 * Unit test suite for Stage 1:
 *  - SimpleTtlCache: fixed TTL, non-sliding expiry, max size eviction, isolation.
 *  - OpenMeteoAirQualityService: domains=cams_global, coordinate distinction, CPCB disclaimer, timeouts, rate limits, caching.
 *  - OpenMeteoWeatherService: model config attribution (best_match), wind direction meteorological origin, error handling.
 *  - Strict Retry Policy: Retries ONLY on 502, 503, 504 and transient network/timeout errors; does NOT retry 500 or 4xx.
 *  - Cache Coordinate Accuracy: Verifies two different coordinates with the same cache key receive their own exact requestedCoordinates.
 */

'use strict';

const SimpleTtlCache = require('../utils/cache.util');
const {
  fetchAirQualityData,
  buildAirQualityUrl,
  formatAirQualityResponse,
  airQualityCache,
} = require('../services/openMeteoAirQuality.service');
const {
  fetchWeatherData,
  buildWeatherUrl,
  degreesToCardinal,
  weatherCache,
} = require('../services/openMeteoWeather.service');

async function runStage1Tests() {
  console.log('\n======================================================');
  console.log(' RUNNING STAGE 1 UNIT TESTS: OPEN-METEO CLIENTS & CACHE');
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

  // ── TEST 1: Cache Fixed TTL Expiry (Non-sliding) ───────────────────────────
  {
    const cache = new SimpleTtlCache({ defaultTtlMs: 50 });
    cache.set('key1', 'val1');

    assert(cache.get('key1') === 'val1', 'Test 1.1: Cache returns active item');

    // Wait 60ms for expiration
    await new Promise((r) => setTimeout(r, 60));

    assert(cache.get('key1') === null, 'Test 1.2: Cache item expires after fixed TTL');
  }

  // ── TEST 2: Cache Maximum Capacity & FIFO Eviction ─────────────────────────
  {
    const cache = new SimpleTtlCache({ maxSize: 3, defaultTtlMs: 10000 });
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.set('k3', 'v3');
    assert(cache.size() === 3, 'Test 2.1: Cache holds up to maxSize');

    // Adding 4th item must evict oldest ('k1')
    cache.set('k4', 'v4');
    assert(cache.size() === 3, 'Test 2.2: Cache size does not exceed maxSize');
    assert(cache.get('k1') === null, 'Test 2.3: Oldest item k1 was evicted');
    assert(cache.get('k4') === 'v4', 'Test 2.4: New item k4 exists');
  }

  // ── TEST 3: Air Quality URL contains domains=cams_global ───────────────────
  {
    const url = buildAirQualityUrl(28.6139, 77.2090);
    assert(
      url.searchParams.get('domains') === 'cams_global',
      'Test 3.1: Air Quality explicitly requests domains=cams_global'
    );
    assert(
      url.searchParams.get('latitude') === '28.6139' && url.searchParams.get('longitude') === '77.209',
      'Test 3.2: Coordinates correctly passed in URL'
    );
  }

  // ── TEST 4: Air Quality Coordinate Distinction & Disclaimers ──────────────
  {
    const mockApiResponse = {
      latitude: 28.625,
      longitude: 77.25,
      elevation: 215.0,
      generationtime_ms: 0.8,
      utc_offset_seconds: 19800,
      timezone: 'Asia/Kolkata',
      current_units: {
        time: 'iso8601',
        pm10: 'μg/m³',
        pm2_5: 'μg/m³',
        european_aqi: 'AQI',
        us_aqi: 'AQI',
      },
      current: {
        time: '2026-11-03T12:00',
        pm10: 160.2,
        pm2_5: 92.5,
        nitrogen_dioxide: 42.1,
        sulphur_dioxide: 10.5,
        carbon_monoxide: 600.0,
        ozone: 35.0,
        european_aqi: 85,
        us_aqi: 170,
      },
    };

    const formatted = formatAirQualityResponse(mockApiResponse, 28.6139, 77.2090, 'available');

    assert(
      formatted.modelMetadata.requestedCoordinates.latitude === 28.6139 &&
        formatted.modelMetadata.modelGridCoordinates.latitude === 28.625,
      'Test 4.1: Distinguishes requested vs model-grid coordinates'
    );
    assert(
      formatted.modelMetadata.isDirectGroundMeasurement === false,
      'Test 4.2: Explicitly flags that data is not a direct ground sensor measurement'
    );
    assert(
      formatted.disclaimers.cpcbDisclaimer.includes('NOT calibrated to the Indian National Air Quality Index (CPCB NAQI)'),
      'Test 4.3: Includes mandatory Indian CPCB NAQI distinction disclaimer'
    );
    assert(
      formatted.pollutants.pm25.value === 92.5 && formatted.pollutants.pm25.unit === 'μg/m³',
      'Test 4.4: Pollutant values and units preserved accurately'
    );
  }

  // ── TEST 5: Air Quality Client Mock Fetch & Caching ────────────────────────
  {
    airQualityCache.clear();

    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 28.625,
          longitude: 77.25,
          current: { pm2_5: 80.0, pm10: 140.0 },
          current_units: { pm2_5: 'μg/m³', pm10: 'μg/m³' },
        }),
      };
    };

    const res1 = await fetchAirQualityData(28.6139, 77.2090, { fetchFn: mockFetch });
    assert(res1.status === 'available' && fetchCount === 1, 'Test 5.1: First call executes upstream fetch');

    const res2 = await fetchAirQualityData(28.6139, 77.2090, { fetchFn: mockFetch });
    assert(res2.status === 'cached' && fetchCount === 1, 'Test 5.2: Second call served from cache without extra fetch');
  }

  // ── TEST 6: Cache Coordinate Accuracy: Reconstructs Call-Specific Metadata ─
  {
    airQualityCache.clear();

    // Two distinct coordinates that round to the same key 28.614:77.209:cams_global
    const coord1 = { lat: 28.6139, lon: 77.2091 };
    const coord2 = { lat: 28.6141, lon: 77.2093 };

    let fetchCalls = 0;
    const mockFetch = async () => {
      fetchCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 28.625,
          longitude: 77.25,
          elevation: 215,
          current: { pm2_5: 75.0, pm10: 130.0 },
          current_units: { pm2_5: 'μg/m³', pm10: 'μg/m³' },
        }),
      };
    };

    const res1 = await fetchAirQualityData(coord1.lat, coord1.lon, { fetchFn: mockFetch });
    assert(fetchCalls === 1, 'Test 6.1: First request hits network');
    assert(
      res1.modelMetadata.requestedCoordinates.latitude === coord1.lat &&
        res1.modelMetadata.requestedCoordinates.longitude === coord1.lon,
      'Test 6.2: First request gets exact coord1'
    );

    const res2 = await fetchAirQualityData(coord2.lat, coord2.lon, { fetchFn: mockFetch });
    assert(fetchCalls === 1, 'Test 6.3: Second request uses cached upstream grid data');
    assert(res2.status === 'cached', 'Test 6.4: Second request status is cached');
    assert(
      res2.modelMetadata.requestedCoordinates.latitude === coord2.lat &&
        res2.modelMetadata.requestedCoordinates.longitude === coord2.lon,
      'Test 6.5: Second request metadata reflects exact coord2, NEVER returning coord1'
    );
  }

  // ── TEST 7: Strict Retry Policy Verification ───────────────────────────────
  {
    // A. HTTP 500 must NOT be retried (1 attempt only)
    let http500Attempts = 0;
    const mock500Fetch = async () => {
      http500Attempts++;
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      };
    };

    const res500 = await fetchAirQualityData(28.1, 77.1, { bypassCache: true, fetchFn: mock500Fetch });
    assert(http500Attempts === 1, 'Test 7.1: HTTP 500 is NOT retried (1 attempt only)');
    assert(res500.status === 'unavailable', 'Test 7.2: HTTP 500 returns unavailable');

    // B. HTTP 502 Bad Gateway MUST be retried up to MAX_RETRIES (3 attempts total)
    let http502Attempts = 0;
    const mock502Fetch = async () => {
      http502Attempts++;
      return {
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway',
      };
    };

    const res502 = await fetchAirQualityData(28.2, 77.2, { bypassCache: true, fetchFn: mock502Fetch });
    assert(http502Attempts === 3, 'Test 7.3: HTTP 502 is retried up to 2 times (3 attempts total)');
    assert(res502.status === 'unavailable', 'Test 7.4: HTTP 502 finishes with unavailable');

    // C. HTTP 503 Service Unavailable MUST be retried
    let http503Attempts = 0;
    const mock503Fetch = async () => {
      http503Attempts++;
      if (http503Attempts < 3) {
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ latitude: 28.3, longitude: 77.3, current: { pm2_5: 50 } }),
      };
    };

    const res503 = await fetchAirQualityData(28.3, 77.3, { bypassCache: true, fetchFn: mock503Fetch });
    assert(http503Attempts === 3, 'Test 7.5: HTTP 503 was retried until attempt 3');
    assert(res503.status === 'available', 'Test 7.6: HTTP 503 recovered on retry 2');

    // D. Transient Network Timeout Error MUST be retried
    let timeoutAttempts = 0;
    const mockTimeoutFetch = async () => {
      timeoutAttempts++;
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    };

    const resTimeout = await fetchAirQualityData(28.4, 77.4, { bypassCache: true, fetchFn: mockTimeoutFetch });
    assert(timeoutAttempts === 3, 'Test 7.7: Timeout is retried up to 2 times (3 attempts total)');
    assert(resTimeout.status === 'timed_out', 'Test 7.8: Timeout returns timed_out status');

    // E. HTTP 429 Rate Limit must NOT be retried
    let rateLimitAttempts = 0;
    const mock429Fetch = async () => {
      rateLimitAttempts++;
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      };
    };

    const res429 = await fetchAirQualityData(28.5, 77.5, { bypassCache: true, fetchFn: mock429Fetch });
    assert(rateLimitAttempts === 1, 'Test 7.9: HTTP 429 is NOT retried (1 attempt only)');
    assert(res429.status === 'rate_limited', 'Test 7.10: HTTP 429 returns rate_limited status');
  }

  // ── TEST 8: Weather Wind Cardinal & Interpretation ────────────────────────
  {
    assert(degreesToCardinal(0) === 'N', 'Test 8.1: 0° is North (origin)');
    assert(degreesToCardinal(315) === 'NW', 'Test 8.2: 315° is Northwest (origin)');
    assert(degreesToCardinal(180) === 'S', 'Test 8.3: 180° is South (origin)');
    assert(degreesToCardinal(90) === 'E', 'Test 8.4: 90° is East (origin)');
  }

  // ── TEST 9: Weather Model Configuration Attribution (best_match) ──────────
  {
    const url = buildWeatherUrl(28.6139, 77.2090, { models: 'best_match' });
    assert(
      url.searchParams.get('models') === 'best_match',
      'Test 9.1: Weather URL documents requested model config accurately'
    );

    weatherCache.clear();
    const mockWeatherFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 28.625,
        longitude: 77.25,
        current: {
          temperature_2m: 26.5,
          relative_humidity_2m: 55,
          wind_speed_10m: 12.0,
          wind_direction_10m: 310,
        },
        current_units: {
          temperature_2m: '°C',
          relative_humidity_2m: '%',
          wind_speed_10m: 'km/h',
          wind_direction_10m: '°',
        },
      }),
    });

    const weatherRes = await fetchWeatherData(28.6139, 77.2090, { fetchFn: mockWeatherFetch });
    assert(
      weatherRes.modelMetadata.selectedModelConfig === 'best_match',
      'Test 9.2: Weather metadata records selectedModelConfig as best_match'
    );
    assert(
      weatherRes.wind.direction.originCardinal === 'NW',
      'Test 9.3: Wind direction 310° correctly identified as originating from NW'
    );
    assert(
      weatherRes.wind.meteorologicalInterpretation.includes('direction FROM which air is moving'),
      'Test 9.4: Documentation states wind represents origin direction'
    );
  }

  // ── TEST 10: Weather Cache Coordinate Accuracy ────────────────────────────
  {
    weatherCache.clear();
    const wCoord1 = { lat: 28.6139, lon: 77.2091 };
    const wCoord2 = { lat: 28.6141, lon: 77.2093 };

    let wFetchCalls = 0;
    const mockWFetch = async () => {
      wFetchCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 28.625,
          longitude: 77.25,
          current: { temperature_2m: 25.0, wind_direction_10m: 180 },
          current_units: { temperature_2m: '°C', wind_direction_10m: '°' },
        }),
      };
    };

    const wRes1 = await fetchWeatherData(wCoord1.lat, wCoord1.lon, { fetchFn: mockWFetch });
    assert(wFetchCalls === 1, 'Test 10.1: Weather first request hits network');
    assert(wRes1.modelMetadata.requestedCoordinates.latitude === wCoord1.lat, 'Test 10.2: Weather wRes1 has wCoord1 lat');

    const wRes2 = await fetchWeatherData(wCoord2.lat, wCoord2.lon, { fetchFn: mockWFetch });
    assert(wFetchCalls === 1, 'Test 10.3: Weather second request uses cache');
    assert(wRes2.status === 'cached', 'Test 10.4: Weather wRes2 status is cached');
    assert(
      wRes2.modelMetadata.requestedCoordinates.latitude === wCoord2.lat &&
        wRes2.modelMetadata.requestedCoordinates.longitude === wCoord2.lon,
      'Test 10.5: Weather wRes2 metadata reflects exact wCoord2, not wCoord1'
    );
  }

  // ── TEST 11: Invalid Coordinates Validation ───────────────────────────────
  {
    let caught = false;
    try {
      await fetchAirQualityData(95.0, 77.0);
    } catch (err) {
      caught = true;
      assert(err.message.includes('Invalid latitude'), 'Test 11.1: Rejects latitude > 90');
    }
    assert(caught, 'Test 11.2: Throws on invalid latitude');
  }

  console.log('\n======================================================');
  console.log(` STAGE 1 SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runStage1Tests().catch((err) => {
    console.error('Stage 1 test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runStage1Tests };
