/**
 * tests/stage2.test.js
 *
 * Comprehensive unit test suite for Stage 2:
 *  - RFC 4180 CSV parser (quoted commas, escaped quotes, newlines, CRLF, errors, empty)
 *  - Geographic utilities (Haversine, bearing, circular angular difference, upwind, antimeridian split, poles)
 *  - NASA FIRMS Service (missing key, mock fetch, exact radius filtering, retry policy, disclaimers)
 */

'use strict';

const { parseCsvToTokens, parseNasaFirmsCsv } = require('../utils/csvParser.util');
const {
  haversineDistance,
  calculateBearing,
  angularDifference,
  checkUpwindCorrelation,
  calculateBoundingBoxes,
} = require('../utils/geoUtils');
const {
  fetchThermalHotspots,
  buildFirmsUrl,
  nasaFirmsCache,
} = require('../services/nasaFirms.service');

async function runStage2Tests() {
  console.log('\n======================================================');
  console.log(' RUNNING STAGE 2 UNIT TESTS: NASA FIRMS & GEO UTILITIES');
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
  // SECTION 1: RFC 4180 CSV PARSER TESTS
  // ══════════════════════════════════════════════════════════════════════════

  // 1.1: Quoted field with embedded comma
  {
    const csv = 'latitude,longitude,note\n28.6139,77.2090,"Anand Vihar, Delhi"\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === true &&
        parsed.rows.length === 1 &&
        parsed.rows[0].note === 'Anand Vihar, Delhi',
      'Test 1.1: CSV parses quoted field with embedded comma'
    );
  }

  // 1.2: Escaped quotes ("")
  {
    const csv = 'latitude,longitude,desc\n28.5,77.1,"Sensor with ""high"" precision"\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === true &&
        parsed.rows[0].desc === 'Sensor with "high" precision',
      'Test 1.2: CSV parses escaped quotes ("") correctly'
    );
  }

  // 1.3: Embedded newlines inside quoted fields
  {
    const csv = 'latitude,longitude,notes\n28.5,77.1,"Line 1\nLine 2"\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === true &&
        parsed.rows[0].notes === 'Line 1\nLine 2',
      'Test 1.3: CSV parses embedded newline within quoted field'
    );
  }

  // 1.4: CRLF line endings
  {
    const csv = 'latitude,longitude,frp\r\n28.5,77.1,14.2\r\n28.6,77.2,8.5\r\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === true &&
        parsed.rows.length === 2 &&
        parsed.rows[0].frp === 14.2 &&
        parsed.rows[1].frp === 8.5,
      'Test 1.4: CSV parses Windows CRLF (\\r\\n) line endings'
    );
  }

  // 1.5: Empty fields
  {
    const csv = 'latitude,longitude,scan,track,confidence\n28.5,77.1,,,nominal\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === true &&
        parsed.rows[0].scan === null &&
        parsed.rows[0].confidence === 'nominal',
      'Test 1.5: CSV handles empty fields (,,) gracefully'
    );
  }

  // 1.6: Malformed unclosed quote returns clean error without crashing
  {
    const csv = 'latitude,longitude,note\n28.5,77.1,"Unclosed quote here\n';
    const parsed = parseNasaFirmsCsv(csv);
    assert(
      parsed.success === false && parsed.error.includes('Unclosed quote'),
      'Test 1.6: Malformed unclosed quote is rejected cleanly'
    );
  }

  // 1.7: 0-byte or empty CSV returns empty rows
  {
    const parsed = parseNasaFirmsCsv('');
    assert(
      parsed.success === true && parsed.rows.length === 0,
      'Test 1.7: Empty CSV returns success with 0 rows'
    );
  }

  // 1.8: HTML error page detection
  {
    const html = '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>';
    const parsed = parseNasaFirmsCsv(html);
    assert(
      parsed.success === false && parsed.error.includes('HTML or XML error page'),
      'Test 1.8: Detects upstream HTML error page'
    );
  }

  // 1.9: NASA text error message detection (e.g. Invalid MAP_KEY)
  {
    const errorText = 'Invalid MAP_KEY\n';
    const parsed = parseNasaFirmsCsv(errorText);
    assert(
      parsed.success === false && parsed.error.includes('NASA FIRMS returned an error'),
      'Test 1.9: Detects raw NASA error message ("Invalid MAP_KEY")'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: GEOGRAPHIC UTILITIES (geoUtils.js)
  // ══════════════════════════════════════════════════════════════════════════

  // 2.1: Haversine distance accuracy
  {
    // Equator 1 degree longitude difference at lat 0 is ~111.19 km
    const dEquator = haversineDistance(0, 0, 0, 1);
    assert(
      Math.abs(dEquator - 111.19) < 0.5,
      'Test 2.1: Haversine accurately measures 1° on Equator (~111.19 km)'
    );

    // Distance between Delhi (28.6139, 77.2090) and Agra (27.1767, 78.0081) is ~178 km
    const dDelhiAgra = haversineDistance(28.6139, 77.2090, 27.1767, 78.0081);
    assert(
      Math.abs(dDelhiAgra - 178) < 3,
      'Test 2.2: Haversine accurately calculates Delhi to Agra distance (~178 km)'
    );
  }

  // 2.2: Bearing calculation
  {
    // Due North
    const bNorth = calculateBearing(0, 0, 10, 0);
    assert(Math.abs(bNorth - 0) < 0.01, 'Test 2.3: Initial bearing due North is 0°');

    // Due East
    const bEast = calculateBearing(0, 0, 0, 10);
    assert(Math.abs(bEast - 90) < 0.01, 'Test 2.4: Initial bearing due East is 90°');

    // Due South
    const bSouth = calculateBearing(10, 0, 0, 0);
    assert(Math.abs(bSouth - 180) < 0.01, 'Test 2.5: Initial bearing due South is 180°');

    // Due West
    const bWest = calculateBearing(0, 10, 0, 0);
    assert(Math.abs(bWest - 270) < 0.01, 'Test 2.6: Initial bearing due West is 270°');
  }

  // 2.3: Circular angular difference (0°/360° boundary)
  {
    assert(angularDifference(359, 1) === 2, 'Test 2.7: Angular difference 359° vs 1° is 2°');
    assert(angularDifference(10, 350) === 20, 'Test 2.8: Angular difference 10° vs 350° is 20°');
    assert(angularDifference(310, 310) === 0, 'Test 2.9: Angular difference 310° vs 310° is 0°');
    assert(angularDifference(310, 130) === 180, 'Test 2.10: Angular difference 310° vs 130° is 180°');
  }

  // 2.4: Upwind correlation check (wind origin = direction FROM which wind blows)
  {
    // Target at (28.0, 77.0). Hotspot to the Northwest at bearing ~315°.
    // Meteorological wind from 315° (Northwest). Hotspot is UPWIND.
    const resUpwind = checkUpwindCorrelation(28.0, 77.0, 28.5, 76.5, 315, 30);
    assert(resUpwind.isUpwind === true, 'Test 2.11: Hotspot at NW with NW wind origin is UPWIND');

    // Target at (28.0, 77.0). Hotspot to the Southeast at bearing ~135°.
    // Meteorological wind from 315° (Northwest). Hotspot is DOWNWIND (not upwind).
    const resDownwind = checkUpwindCorrelation(28.0, 77.0, 27.5, 77.5, 315, 30);
    assert(resDownwind.isUpwind === false, 'Test 2.12: Hotspot at SE with NW wind origin is NOT upwind');

    // Boundary wrap: Hotspot at 355° with wind origin at 5° (angular diff = 10° <= 30°)
    const resWrap = checkUpwindCorrelation(28.0, 77.0, 29.0, 76.9, 5, 30);
    assert(resWrap.isUpwind === true, 'Test 2.13: Hotspot at 355° with 5° wind wraps circular boundary (upwind)');
  }

  // 2.5: Bounding box generation with Antimeridian & Polar handling
  {
    // Standard bounding box in Delhi
    const bboxesStd = calculateBoundingBoxes(28.6139, 77.2090, 50);
    assert(bboxesStd.length === 1, 'Test 2.14: Standard coordinates produce 1 bounding box');
    assert(
      bboxesStd[0].minLat < 28.6139 && bboxesStd[0].maxLat > 28.6139,
      'Test 2.15: Standard box bounds the center latitude'
    );

    // Antimeridian crossing to the East (lon = 179.8°, radius = 50 km)
    const bboxesEast = calculateBoundingBoxes(0, 179.8, 50);
    assert(
      bboxesEast.length === 2,
      'Test 2.16: Crossing Antimeridian to the East splits into 2 bounding boxes'
    );
    assert(
      bboxesEast[0].maxLon === 180 && bboxesEast[1].minLon === -180,
      'Test 2.17: Antimeridian boxes touch 180° and -180° correctly'
    );

    // Polar handling (lat = 89° N)
    const bboxesPolar = calculateBoundingBoxes(89.0, 0, 50);
    assert(bboxesPolar.length === 1, 'Test 2.18: Polar location safely returns 1 bounding box');
    assert(
      bboxesPolar[0].minLon === -180 && bboxesPolar[0].maxLon === 180,
      'Test 2.19: Polar box spans full longitudinal circle (-180 to 180)'
    );

    // Latitude clamping near pole (lat = 89.8° N + 50 km deltaLat ~0.45° -> clamped to 90°)
    const bboxesClamped = calculateBoundingBoxes(89.8, 0, 50);
    assert(bboxesClamped[0].maxLat === 90, 'Test 2.20: Latitude clamped to 90° max at North Pole');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: NASA FIRMS SERVICE (nasaFirms.service.js)
  // ══════════════════════════════════════════════════════════════════════════

  // 3.1: Missing NASA_FIRMS_MAP_KEY handling
  {
    const oldKey = process.env.NASA_FIRMS_MAP_KEY;
    delete process.env.NASA_FIRMS_MAP_KEY;

    const res = await fetchThermalHotspots(28.6139, 77.2090, 50);
    assert(
      res.status === 'key_missing' &&
        res.count === 0 &&
        res.error.includes('NASA_FIRMS_MAP_KEY is not configured'),
      'Test 3.1: Missing NASA_FIRMS_MAP_KEY returns status "key_missing" without throwing'
    );

    // Restore
    if (oldKey) process.env.NASA_FIRMS_MAP_KEY = oldKey;
  }

  // 3.2: Valid Mocked Fetch with Exact Radius Filtering
  {
    process.env.NASA_FIRMS_MAP_KEY = 'test_map_key_12345';
    nasaFirmsCache.clear();

    // Mock CSV response with 3 hotspots:
    // 1. (28.70, 77.25) -> ~10.4 km from (28.6139, 77.2090) -> Inside 50 km radius
    // 2. (28.85, 77.45) -> ~34.8 km from (28.6139, 77.2090) -> Inside 50 km radius
    // 3. (29.20, 77.70) -> ~80.2 km from (28.6139, 77.2090) -> Outside 50 km (in square bbox corner)
    const mockCsv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '28.7000,77.2500,340.2,0.4,0.4,2026-11-03,0730,N,VIIRS,nominal,2.0NRT,295.1,14.5,D',
      '28.8500,77.4500,335.8,0.4,0.4,2026-11-03,0730,N,VIIRS,nominal,2.0NRT,292.0,9.8,D',
      '29.2000,77.7000,350.0,0.5,0.5,2026-11-03,0730,N,VIIRS,nominal,2.0NRT,298.5,22.0,D',
    ].join('\n');

    let fetchCalls = 0;
    const mockFetch = async (url) => {
      fetchCalls++;
      assert(!url.includes('test_map_key_12345') === false, 'Test 3.2a: URL includes mapKey securely');
      return {
        ok: true,
        status: 200,
        text: async () => mockCsv,
      };
    };

    const res = await fetchThermalHotspots(28.6139, 77.2090, 50, {
      fetchFn: mockFetch,
      windOriginDeg: 30, // Wind from NNE
    });

    assert(res.status === 'available', 'Test 3.2: Status is available');
    assert(
      res.count === 2,
      'Test 3.3: Exact circular radius filter: 2 hotspots kept, 1 outside 50 km discarded'
    );
    assert(
      res.hotspots[0].distanceKm < 50 && res.hotspots[1].distanceKm < 50,
      'Test 3.4: All returned hotspots have distanceKm <= 50'
    );
    assert(
      res.hotspots[0].confidence === 'nominal' && res.hotspots[0].fireRadiativePowerMw === 14.5,
      'Test 3.5: FRP and satellite confidence parsed accurately'
    );
    assert(
      res.disclaimers.causalityDisclaimer.includes('does NOT establish a direct causal link'),
      'Test 3.6: Strict causality disclaimer present'
    );
    assert(
      res.disclaimers.regionalNeutralityDisclaimer.includes('must not be used to assign regional'),
      'Test 3.7: Regional neutrality disclaimer present'
    );
  }

  // 3.3: Strict Retry Policy (502 retried, 403 not retried)
  {
    // A. 403 Forbidden must NOT be retried (1 attempt)
    let authAttempts = 0;
    const mock403 = async () => {
      authAttempts++;
      return { ok: false, status: 403, statusText: 'Forbidden' };
    };

    const res403 = await fetchThermalHotspots(28.6139, 77.2090, 50, {
      bypassCache: true,
      fetchFn: mock403,
    });
    assert(authAttempts === 1, 'Test 3.8: HTTP 403 terminates on attempt 1 without retries');
    assert(res403.status === 'auth_error', 'Test 3.9: HTTP 403 returns auth_error');

    // B. 502 Bad Gateway MUST be retried up to MAX_RETRIES (3 attempts)
    let badGatewayAttempts = 0;
    const mock502 = async () => {
      badGatewayAttempts++;
      return { ok: false, status: 502, statusText: 'Bad Gateway', text: async () => 'Bad Gateway' };
    };

    const res502 = await fetchThermalHotspots(28.6139, 77.2090, 50, {
      bypassCache: true,
      fetchFn: mock502,
    });
    assert(
      badGatewayAttempts === 3,
      'Test 3.10: HTTP 502 is retried up to 2 times (3 attempts total)'
    );
    assert(res502.status === 'unavailable', 'Test 3.11: HTTP 502 returns unavailable after retries');
  }

  // 3.4: Cache Recalculation: Distance and bearings recalculated per requested location
  {
    nasaFirmsCache.clear();
    const mockCsv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '28.7000,77.2500,340.2,0.4,0.4,2026-11-03,0730,N,VIIRS,nominal,2.0NRT,295.1,14.5,D',
    ].join('\n');

    let netCalls = 0;
    const mockFetch = async () => {
      netCalls++;
      return { ok: true, status: 200, text: async () => mockCsv };
    };

    // Caller 1 at (28.6139, 77.2090)
    const call1 = await fetchThermalHotspots(28.6139, 77.2090, 50, { fetchFn: mockFetch });
    assert(netCalls === 1, 'Test 3.12: Caller 1 causes upstream fetch');
    const dist1 = call1.hotspots[0].distanceKm;

    // Caller 2 at (28.6144, 77.2094) within the same cached area (rounds to 28.61:77.21)
    const call2 = await fetchThermalHotspots(28.6144, 77.2094, 50, { fetchFn: mockFetch });
    assert(netCalls === 1, 'Test 3.13: Caller 2 reuses cached raw detections');
    assert(call2.status === 'cached', 'Test 3.14: Caller 2 status is cached');
    const dist2 = call2.hotspots[0].distanceKm;

    // Distance MUST be recalculated specifically for Caller 2's coordinates
    assert(
      dist1 !== dist2,
      `Test 3.15: Distance recalculated per caller coordinates (dist1: ${dist1} km vs dist2: ${dist2} km)`
    );
  }

  console.log('\n======================================================');
  console.log(` STAGE 2 SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runStage2Tests().catch((err) => {
    console.error('Stage 2 test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runStage2Tests };
