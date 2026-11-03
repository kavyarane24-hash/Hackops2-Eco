/**
 * tests/liveVerification.test.js
 *
 * Live end-to-end verification script for HackOps 2.0 sprint:
 *  - Tests POST /api/intelligence/analyze-complaint with multiple real English complaints
 *  - Tests GET /api/intelligence/environmental-data with live Open-Meteo connectivity
 *  - Verifies graceful NASA FIRMS key_missing behavior
 *  - Tests invalid and missing coordinate parameters
 */

'use strict';

const request = require('supertest');
const app = require('../server');

async function runLiveVerification() {
  console.log('\n======================================================');
  console.log(' RUNNING LIVE VERIFICATION SPRINT (REAL CONNECTIVITY)');
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

  // ── TEST 1: Multiple Real English Complaints ───────────────────────────────
  const testCases = [
    {
      text: 'Heavy toxic emissions from industrial boiler near Bawana causing throat burning and asthma attacks.',
      expectedCategory: 'air',
      expectedSeverity: 'critical',
      expectedLocation: 'Bawana',
    },
    {
      text: 'Sewage overflow contaminating drinking water pipes in Rohini.',
      expectedCategory: 'water',
      expectedSeverity: 'critical',
      expectedLocation: 'Rohini',
    },
    {
      text: 'Uncontrolled loud construction drilling at 3 AM in Dwarka disturbing sleep.',
      expectedCategory: 'noise',
      expectedSeverity: 'medium',
      expectedLocation: 'Dwarka',
    },
    {
      text: 'Huge illegal plastic waste dumping and open burning on roadside in Okhla.',
      expectedCategory: 'waste',
      expectedSeverity: 'high',
      expectedLocation: 'Okhla',
    },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const res = await request(app)
      .post('/api/intelligence/analyze-complaint')
      .send({ text: tc.text });

    assert(
      res.status === 200 &&
        res.body.success === true &&
        res.body.inferredClassifications.primaryCategory === tc.expectedCategory &&
        res.body.inferredClassifications.severity.level === tc.expectedSeverity &&
        res.body.extractedFacts.explicitLocations.includes(tc.expectedLocation),
      `Test 1.${i + 1}: Real complaint #${i + 1} (${tc.expectedCategory}) verified [${tc.expectedLocation}, ${tc.expectedSeverity}]`,
      res.body
    );
  }

  // ── TEST 2: Live Open-Meteo Connectivity & NASA FIRMS Key-Missing ──────────
  {
    console.log('\nQuerying live Open-Meteo API for Delhi coordinates (28.6139, 77.2090)...');
    const res = await request(app)
      .get('/api/intelligence/environmental-data?lat=28.6139&lon=77.2090&radius=50');

    assert(res.status === 200, 'Test 2.1: Live endpoint returns HTTP 200', res.body);
    assert(res.body.success === true, 'Test 2.2: Response success is true');

    // Verify Open-Meteo Air Quality
    const aq = res.body.data.airQuality;
    assert(
      aq.status === 'available' || aq.status === 'cached',
      `Test 2.3: Open-Meteo Air Quality connectivity successful (status: ${aq?.status})`
    );
    assert(
      aq.modelAttribution.domain === 'cams_global',
      'Test 2.4: CAMS Global model domain confirmed in live payload'
    );
    assert(
      typeof aq.pollutants.pm25.value === 'number',
      `Test 2.5: Live PM2.5 reading received: ${aq?.pollutants?.pm25?.value} ${aq?.pollutants?.pm25?.unit}`
    );

    // Verify Open-Meteo Weather
    const weather = res.body.data.weather;
    assert(
      weather.status === 'available' || weather.status === 'cached',
      `Test 2.6: Open-Meteo Weather connectivity successful (status: ${weather?.status})`
    );
    assert(
      typeof weather.metrics.temperature.value === 'number',
      `Test 2.7: Live temperature reading received: ${weather?.metrics?.temperature?.value} °C`
    );
    assert(
      weather.wind.direction.originCardinal !== null,
      `Test 2.8: Live wind direction origin parsed: ${weather?.wind?.direction?.degrees}° (${weather?.wind?.direction?.originCardinal})`
    );

    // Verify NASA FIRMS graceful key_missing
    const firms = res.body.data.thermalHotspots;
    assert(
      firms.status === 'key_missing' && firms.count === 0,
      'Test 2.9: NASA FIRMS gracefully reports key_missing without throwing or crashing'
    );
    assert(
      res.body.providerStatuses.nasaFirms === 'key_missing',
      'Test 2.10: Provider status cleanly flags nasaFirms: key_missing'
    );

    // Verify deterministic validation report on live data
    assert(
      res.body.validation.isValid === true,
      `Test 2.11: Deterministic validation succeeded (status: ${res.body.validation.status})`
    );
  }

  // ── TEST 3: Invalid and Missing Coordinate Parameters ─────────────────────
  {
    // A. Missing coordinates
    const resNoCoords = await request(app).get('/api/intelligence/environmental-data');
    assert(
      resNoCoords.status === 400 && resNoCoords.body.code === 'MISSING_COORDINATES',
      'Test 3.1: Rejects missing coordinates with HTTP 400'
    );

    // B. Invalid latitude (> 90)
    const resBadLat = await request(app).get('/api/intelligence/environmental-data?lat=120&lon=77');
    assert(
      resBadLat.status === 400 && resBadLat.body.code === 'INVALID_LATITUDE',
      'Test 3.2: Rejects latitude > 90 with HTTP 400'
    );

    // C. Invalid longitude (> 180)
    const resBadLon = await request(app).get('/api/intelligence/environmental-data?lat=28&lon=250');
    assert(
      resBadLon.status === 400 && resBadLon.body.code === 'INVALID_LONGITUDE',
      'Test 3.3: Rejects longitude > 180 with HTTP 400'
    );

    // D. Non-numeric coordinates
    const resNonNum = await request(app).get('/api/intelligence/environmental-data?lat=abc&lon=def');
    assert(
      resNonNum.status === 400 && resNonNum.body.code === 'INVALID_LATITUDE',
      'Test 3.4: Rejects non-numeric coordinates with HTTP 400'
    );
  }

  console.log('\n======================================================');
  console.log(` LIVE VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runLiveVerification().catch((err) => {
    console.error('Live verification error:', err);
    process.exit(1);
  });
}

module.exports = { runLiveVerification };
