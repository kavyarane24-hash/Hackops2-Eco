/**
 * tests/complaintAnalysis.test.js
 *
 * Unit and route tests for Deterministic Multilingual Complaint Analysis:
 *  - English complaints
 *  - Hindi Devanagari complaints
 *  - Hinglish (Romanized Hindi) complaints
 *  - Localized category & severity responses (English & Hindi)
 *  - Location extraction (Devanagari, Hinglish, English)
 *  - Coordinate non-invention (inferredCoordinates strictly null)
 *  - Severity scoring & malformed input handling
 */

'use strict';

const {
  analyzeComplaintText,
  detectLanguage,
  extractExplicitLocations,
} = require('../services/complaintAnalysis.service');

async function runComplaintTests() {
  console.log('\n======================================================');
  console.log(' RUNNING WORKSTREAM 2 TESTS: MULTILINGUAL COMPLAINTS');
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

  // ── TEST 1: Language Detection ─────────────────────────────────────────────
  {
    assert(detectLanguage('Black smoke in Anand Vihar') === 'en', 'Test 1.1: English detected');
    assert(detectLanguage('आनंद विहार में बहुत काला धुआं है') === 'hi', 'Test 1.2: Hindi Devanagari detected');
    assert(
      detectLanguage('Anand Vihar me bohot kala dhuan hai') === 'hi-Latn',
      'Test 1.3: Hinglish detected'
    );
  }

  // ── TEST 2: Hindi Devanagari Complaint Processing ──────────────────────────
  {
    const hindiText =
      'आनंद विहार में बहुत काला धुआं और बदबू आ रही है, सांस लेने में तकलीफ हो रही है।';
    const res = analyzeComplaintText(hindiText);

    assert(res.success === true, 'Test 2.1: Hindi complaint processed successfully');
    assert(res.detectedLanguage === 'hi', 'Test 2.2: Detected language is Hindi');
    assert(res.originalText === hindiText, 'Test 2.3: Original Hindi text preserved verbatim');
    assert(res.inferredClassifications.primaryCategory === 'air', 'Test 2.4: Classified as air pollution');
    assert(
      res.inferredClassifications.localizedCategory.hi === 'वायु प्रदूषण',
      'Test 2.5: Hindi category localization present ("वायु प्रदूषण")'
    );
    assert(
      res.extractedFacts.hasExplicitLocation === true &&
        res.extractedFacts.explicitLocations.includes('आनंद विहार'),
      'Test 2.6: Extracted Hindi landmark "आनंद विहार"'
    );
    assert(
      res.inferredClassifications.severity.level === 'critical',
      'Test 2.7: Acute breathing distress evaluated as critical severity'
    );
    assert(
      res.inferredClassifications.severity.localizedLevel.hi.includes('अति गंभीर'),
      'Test 2.8: Hindi severity localization present ("अति गंभीर")'
    );
  }

  // ── TEST 3: Hinglish Complaint Processing ──────────────────────────────────
  {
    const hinglishText =
      'Yamuna river me chemical factory se ganda pani aur jhag aa raha hai.';
    const res = analyzeComplaintText(hinglishText);

    assert(res.success === true, 'Test 3.1: Hinglish complaint processed successfully');
    assert(res.detectedLanguage === 'hi-Latn', 'Test 3.2: Detected language is Hinglish');
    assert(res.inferredClassifications.primaryCategory === 'water', 'Test 3.3: Classified as water pollution');
    assert(
      res.inferredClassifications.localizedCategory.en === 'Water Pollution' &&
        res.inferredClassifications.localizedCategory.hi === 'जल प्रदूषण',
      'Test 3.4: Both English and Hindi localizations present'
    );
    assert(
      res.extractedFacts.explicitLocations.includes('Yamuna'),
      'Test 3.5: Extracted landmark "Yamuna"'
    );
  }

  // ── TEST 4: English Noise Complaint Processing ─────────────────────────────
  {
    const res = analyzeComplaintText(
      'Loudspeakers blasting at deafening decibels past midnight in Sector 62 causing sleepless nights.'
    );
    assert(res.inferredClassifications.primaryCategory === 'noise', 'Test 4.1: Categorized as noise pollution');
    assert(
      res.inferredClassifications.localizedCategory.hi === 'ध्वनि प्रदूषण',
      'Test 4.2: Hindi category localized as "ध्वनि प्रदूषण"'
    );
    assert(
      res.extractedFacts.explicitLocations.some((l) => l.includes('Sector 62')),
      'Test 4.3: Location "Sector 62" extracted'
    );
  }

  // ── TEST 5: English Waste Complaint Processing ─────────────────────────────
  {
    const res = analyzeComplaintText(
      'Huge piles of plastic and garbage dumped illegally on the roadside near Mayur Vihar.'
    );
    assert(res.inferredClassifications.primaryCategory === 'waste', 'Test 5.1: Categorized as waste pollution');
    assert(
      res.inferredClassifications.localizedCategory.hi === 'ठोस अपशिष्ट / कचरा डंपिंग',
      'Test 5.2: Hindi category localized as "ठोस अपशिष्ट / कचरा डंपिंग"'
    );
    assert(
      res.extractedFacts.explicitLocations.includes('Mayur Vihar'),
      'Test 5.3: Location "Mayur Vihar" extracted'
    );
  }

  // ── TEST 6: Irrelevant / Non-Environmental Input ───────────────────────────
  {
    const res = analyzeComplaintText('Hello, what time does the municipal library open today?');
    assert(
      res.isRelevantEnvironmentalComplaint === false &&
        res.inferredClassifications.primaryCategory === 'irrelevant_or_general',
      'Test 6: Non-environmental text identified as irrelevant'
    );
  }

  // ── TEST 7: Strict Coordinate Non-Invention ────────────────────────────────
  {
    const res = analyzeComplaintText('There is terrible smog and soot in the air.');
    assert(
      res.extractedFacts.hasExplicitLocation === false &&
        res.extractedFacts.explicitLocations.length === 0,
      'Test 7.1: No location invented when absent from text'
    );
    assert(
      res.extractedFacts.inferredCoordinates === null,
      'Test 7.2: Inferred coordinates are strictly null (zero coordinate fabrication)'
    );
  }

  // ── TEST 8: Malformed & Short Input Handling ───────────────────────────────
  {
    const resEmpty = analyzeComplaintText('');
    assert(resEmpty.success === false && resEmpty.code === 'INVALID_INPUT', 'Test 8.1: Rejects empty string');

    const resNull = analyzeComplaintText(null);
    assert(resNull.success === false && resNull.code === 'INVALID_INPUT', 'Test 8.2: Rejects null input');

    const resShort = analyzeComplaintText('Bad');
    assert(
      resShort.success === false && resShort.code === 'TEXT_TOO_SHORT',
      'Test 8.3: Rejects text < 5 characters'
    );
  }

  console.log('\n======================================================');
  console.log(` COMPLAINT TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runComplaintTests().catch((err) => {
    console.error('Complaint test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runComplaintTests };
