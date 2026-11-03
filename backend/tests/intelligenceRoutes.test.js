/**
 * tests/intelligenceRoutes.test.js
 *
 * Route integration tests for:
 *  - POST /api/intelligence/analyze-complaint
 *  - GET  /api/intelligence/environmental-data
 */

'use strict';

const request = require('supertest');
const app = require('../server');

async function runRouteTests() {
  console.log('\n======================================================');
  console.log(' RUNNING INTELLIGENCE ROUTES INTEGRATION TESTS');
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

  // ── TEST 1: POST /api/intelligence/analyze-complaint ────────────────────────
  {
    const res = await request(app)
      .post('/api/intelligence/analyze-complaint')
      .send({
        text: 'Black smoke and toxic fumes in Anand Vihar causing breathing difficulties.',
      });

    assert(
      res.status === 200 &&
        res.body.success === true &&
        res.body.inferredClassifications.primaryCategory === 'air' &&
        res.body.extractedFacts.explicitLocations.includes('Anand Vihar'),
      'Test 1.1: POST /analyze-complaint returns 200 and structured air complaint',
      res.body
    );

    // Frontend AIAnalysisOutput contract verification
    const a = res.body.analysis;
    assert(
      a &&
        typeof a.category === 'string' &&
        ['Biomass / Stubble Burning', 'Industrial Emissions', 'Waste Burning', 'Vehicular Emissions', 'Construction Dust', 'Other Air Pollution'].includes(a.category) &&
        ['Critical', 'High', 'Medium', 'Low'].includes(a.severity) &&
        ['Immediate', 'High', 'Moderate', 'Low'].includes(a.urgency) &&
        typeof a.confidence === 'number' &&
        Array.isArray(a.possibleSources) &&
        Array.isArray(a.supportingEvidence) &&
        Array.isArray(a.contradictoryEvidence) &&
        a.trendEstimate && a.trendEstimate.direction === 'stable' && Array.isArray(a.trendEstimate.next72hAqi) &&
        Array.isArray(a.recommendations) &&
        Array.isArray(a.compliance) &&
        a.generatedBy === 'backend-ai',
      'Test 1.1b: POST /analyze-complaint returns valid frontend AIAnalysisOutput contract',
      a
    );

    // Frontend format with Hindi submission
    const resHi = await request(app)
      .post('/api/intelligence/analyze-complaint')
      .send({
        id: 'inc-hi-999',
        text: 'कचरा जल रहा है भारी धुआं और बदबू ओखला में',
        language: 'hi',
        location: { address: 'Okhla, New Delhi', lat: 28.53, lng: 77.28 },
      });

    assert(
      resHi.status === 200 &&
        resHi.body.analysis.category === 'Waste Burning' &&
        resHi.body.analysis.severity === 'High' &&
        resHi.body.analysis.summary.includes('Hindi') &&
        resHi.body.analysis.summary.includes('कचरा'),
      'Test 1.1c: POST /analyze-complaint handles frontend payload and Hindi localization',
      resHi.body.analysis
    );

    // Invalid missing text
    const resErr = await request(app)
      .post('/api/intelligence/analyze-complaint')
      .send({});

    assert(
      resErr.status === 400 && resErr.body.code === 'MISSING_TEXT',
      'Test 1.2: POST /analyze-complaint returns 400 on missing text',
      resErr.body
    );
  }

  // ── TEST 2: GET /api/intelligence/environmental-data parameter checks ───────
  {
    // Missing coordinates
    const resMissing = await request(app).get('/api/intelligence/environmental-data');
    assert(
      resMissing.status === 400 && resMissing.body.code === 'MISSING_COORDINATES',
      'Test 2.1: GET /environmental-data returns 400 on missing coordinates',
      resMissing.body
    );

    // Invalid coordinates
    const resInvalid = await request(app).get('/api/intelligence/environmental-data?lat=95&lon=77');
    assert(
      resInvalid.status === 400 && resInvalid.body.code === 'INVALID_LATITUDE',
      'Test 2.2: GET /environmental-data returns 400 on invalid latitude',
      resInvalid.body
    );
  }

  console.log('\n======================================================');
  console.log(` ROUTE TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runRouteTests().catch((err) => {
    console.error('Route test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runRouteTests };
