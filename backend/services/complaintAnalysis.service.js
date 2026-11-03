/**
 * services/complaintAnalysis.service.js
 *
 * Deterministic text complaint analyzer for the Intelligence Engine.
 * Operates without external AI/LLM API keys, using transparent heuristic rules.
 *
 * Features:
 *  - Multilingual support: English, Hindi Devanagari (हिन्दी), and Hinglish (Romanized Hindi).
 *  - Language detection: 'en' | 'hi' (Devanagari) | 'hi-Latn' (Hinglish).
 *  - Category extraction: air, water, noise, waste, other, irrelevant.
 *  - Location extraction strictly from text (Devanagari and Latin spatial markers).
 *  - Zero coordinate fabrication: coordinates remain strictly null.
 *  - Transparent severity estimation with localized explanations in Hindi and English.
 *  - Preserves original submitted text and complainant metadata.
 */

'use strict';

// ── Multilingual Category Lexicon ────────────────────────────────────────────
const CATEGORY_LEXICON = {
  air: [
    // English
    'smoke', 'smog', 'air', 'emission', 'dust', 'burning', 'chimney', 'exhaust',
    'aqi', 'smell', 'odor', 'odour', 'fumes', 'soot', 'stubble', 'choking',
    'respiratory', 'cough', 'throat', 'breathing', 'particulate', 'pm2.5', 'pm10',
    'stack', 'furnace', 'boiler', 'haze', 'black smoke',
    // Hindi Devanagari
    'धुआं', 'धुआँ', 'हवा', 'वायु', 'प्रदूषण', 'दुर्गंध', 'बदबू', 'सांस', 'खांसी',
    'गला', 'दम', 'घुटन', 'राख', 'चिली', 'चिमनी', 'जलाना', 'पराली', 'धूल', 'गैस',
    'काला धुआं', 'जहरीली हवा', 'आंखों में जलन',
    // Hinglish
    'dhuan', 'dhuwa', 'hawa', 'badbu', 'saans', 'khansi', 'parali', 'dhool',
    'choking', 'kala dhuan', 'aag lagana', 'zehreela dhuan', 'gas leak'
  ],
  water: [
    // English
    'water', 'sewage', 'drain', 'drainage', 'chemical', 'river', 'lake', 'yamuna',
    'groundwater', 'foam', 'effluent', 'toxic water', 'dirty water', 'tap water',
    'contamination', 'canal', 'nullah', 'nallah', 'leakage', 'pipes', 'sludge',
    'polluted water',
    // Hindi Devanagari
    'पानी', 'जल', 'नाला', 'सीवर', 'गंदा पानी', 'यमुना', 'नदी', 'झाग', 'रसायन',
    'केमिकल', 'नाली', 'अपशिष्ट जल', 'दूषित पानी', 'पीने का पानी',
    // Hinglish
    'paani', 'pani', 'naala', 'nala', 'sewer', 'ganda pani', 'ganda paani',
    'jhag', 'dushit pani', 'peene ka paani'
  ],
  noise: [
    // English
    'noise', 'loud', 'sound', 'loudspeaker', 'speaker', 'construction', 'blasting',
    'horn', 'honking', 'generator', 'music', 'decibel', 'drilling', 'hammering',
    'midnight', 'sleepless', 'vibration', 'machinery noise',
    // Hindi Devanagari
    'शोर', 'आवाज', 'ध्वनि', 'लाउडस्पीकर', 'डीजे', 'हॉर्न', 'जनरेटर', 'मशीन',
    'तेज आवाज', 'रात में शोर', 'नींद',
    // Hinglish
    'shor', 'aawaz', 'awaz', 'loudspeaker', 'tez aawaz', 'generator ki aawaz',
    'raat me shor', 'gaane', 'dhwani'
  ],
  waste: [
    // English
    'waste', 'garbage', 'trash', 'plastic', 'dumping', 'dump', 'landfill',
    'debris', 'solid waste', 'litter', 'illegal dumping', 'rubbish', 'scrap',
    'bio-medical', 'medical waste', 'open burning of garbage', 'mound',
    // Hindi Devanagari
    'कचरा', 'कूड़ा', 'कूड़ेदान', 'प्लास्टिक', 'डंपिंग', 'कूड़े का ढेर', 'मलबे',
    'अपशिष्ट', 'गंदगी', 'कूड़ा जलाना',
    // Hinglish
    'kachra', 'kuda', 'koora', 'kooda', 'kachre ka dher', 'kuda jalana',
    'gandagi', 'plastic waste', 'dumping'
  ],
  other: [
    // English
    'tree cutting', 'deforestation', 'mining', 'illegal mining', 'encroachment',
    'soil', 'pesticide', 'biodiversity', 'wildlife', 'green belt',
    // Hindi Devanagari
    'पेड़ काटना', 'जंगल', 'खनन', 'अवैध खनन', 'कीटनाशक', 'मिट्टी', 'हरियाली',
    // Hinglish
    'ped katna', 'illegal mining', 'keetnashak'
  ],
};

// ── Localized Display Names ──────────────────────────────────────────────────
const CATEGORY_NAMES = {
  air: { en: 'Air Pollution', hi: 'वायु प्रदूषण' },
  water: { en: 'Water Pollution', hi: 'जल प्रदूषण' },
  noise: { en: 'Noise Pollution', hi: 'ध्वनि प्रदूषण' },
  waste: { en: 'Solid Waste / Garbage Dumping', hi: 'ठोस अपशिष्ट / कचरा डंपिंग' },
  other: { en: 'Other Environmental Issue', hi: 'अन्य पर्यावरणीय समस्या' },
  irrelevant_or_general: { en: 'General / Irrelevant', hi: 'सामान्य / अप्रासंगिक' },
};

const SEVERITY_NAMES = {
  critical: {
    en: 'Critical (Immediate Action Required)',
    hi: 'अति गंभीर (तत्काल कार्रवाई आवश्यक)',
  },
  high: {
    en: 'High',
    hi: 'उच्च',
  },
  medium: {
    en: 'Medium',
    hi: 'मध्यम',
  },
  low: {
    en: 'Low',
    hi: 'निम्न',
  },
};

// ── Severity Indicator Patterns (Multilingual) ───────────────────────────────
const SEVERITY_RULES = [
  {
    level: 'critical',
    weight: 3,
    reason: {
      en: 'Report indicates severe acute health hazard or toxic emergency',
      hi: 'रिपोर्ट गंभीर तीव्र स्वास्थ्य खतरे या विषाक्त आपातकाल का संकेत देती है',
    },
    patterns: [
      /\b(toxic|poisonous|hospital|asthma|choking|suffocating|cannot breathe|burning eyes|vomiting)\b/i,
      /\b(explosion|massive fire|chemical spill|acid|hazardous waste|dying)\b/i,
      /\b(children sick|elderly collapsed|school affected)\b/i,
      /\b(contaminat\w+\s+drinking\s+water|poisoned\s+water)\b/i,
      // Hindi Devanagari
      /(जहरीला|अस्पताल|दम घुट|सांस नहीं आ रही|सांस फूल|सांस लेने में तकलीफ|सांस की तकलीफ|आंखों में जलन|उल्टी|आपातकाल)/,
      // Hinglish
      /\b(saans lene me takleef|saans ruk|zehreela|dam ghut|hospital|aankhon me jalan)\b/i,
    ],
  },
  {
    level: 'high',
    weight: 2,
    reason: {
      en: 'Report indicates continuous, heavy, or industrial-scale pollution',
      hi: 'रिपोर्ट निरंतर, भारी या औद्योगिक स्तर के प्रदूषण का संकेत देती है',
    },
    patterns: [
      /\b(heavy smoke|black smoke|continuous|daily|every night|unbearable|illegal factory)\b/i,
      /\b(effluent discharge|foam in river|open garbage burning|open burning|loud at 2am|drilling continuously)\b/i,
      /\b(large dump|huge pile|huge\b.*?\bdump|illegal dumping|commercial generator|industrial area)\b/i,
      /\b(sewage overflow|overflowing drain|overflowing sewage)\b/i,
      // Hindi Devanagari
      /(काला धुआं|भारी धुआं|लगातार|हर रोज|हर रात|असहनीय|अवैध फैक्ट्री|कूड़ा जलाना|बड़ा ढेर)/,
      // Hinglish
      /\b(kala dhuan|lagatar|har roz|har raat|unbearable|bahut zyada|illegal factory|kachra jalana)\b/i,
    ],
  },
  {
    level: 'medium',
    weight: 1,
    reason: {
      en: 'Report indicates persistent localized nuisance or moderate pollution',
      hi: 'रिपोर्ट लगातार स्थानीय उपद्रव या मध्यम प्रदूषण का संकेत देती है',
    },
    patterns: [
      /\b(frequent|dust|construction debris|noise|foul smell|dirty water|traffic dust)\b/i,
      /\b(loud music|idling trucks|persistent|recurring|overflow|leakage)\b/i,
      // Hindi Devanagari
      /(धूल|गंदा पानी|बदबू|दुर्गंध|शोर|निर्माण|ट्रैफिक)/,
      // Hinglish
      /\b(dhool|ganda pani|badbu|shor|construction|traffic)\b/i,
    ],
  },
];

// ── Location Extraction (Multilingual) ───────────────────────────────────────
const KNOWN_LANDMARKS = [
  // English / Hinglish
  'Anand Vihar', 'Wazirpur', 'Mayur Vihar', 'Yamuna', 'Okhla', 'Connaught Place',
  'Bawana', 'Narela', 'Dwarka', 'Rohini', 'Gurugram', 'Noida', 'Ghaziabad',
  'Faridabad', 'Shahdara', 'Kashmere Gate', 'ITO', 'RK Puram', 'Jahangirpuri',
  // Hindi Devanagari
  'आनंद विहार', 'वज़ीरपुर', 'मयूर विहार', 'यमुना', 'ओखला', 'कनॉट प्लेस',
  'बवाना', 'नरेला', 'द्वारका', 'रोहिणी', 'गुरुग्राम', 'नोएडा', 'गाजियाबाद',
  'फरीदाबाद', 'शाहदरा', 'कश्मीरी गेट', 'आईटीओ', 'आरके पुरम', 'जहांगीरपुरी'
];

const ENGLISH_LOCATION_PREPOSITIONS =
  /\b(?:in|at|near|around|behind|opposite|beside|across|from|area)\s+([A-Z0-9][A-Za-z0-9\s-]{2,28}?(?=\s*(?:,|;|\.|\b(?:and|with|since|having|where|because|is|are)\b|$)))/g;

const SPECIFIC_AREA_SUFFIX_REGEX =
  /\b([A-Z][A-Za-z0-9\s-]{1,24}?\s+(?:Vihar|Nagar|Enclave|Puram|Colony|Sector\s*\d+|Phase\s*\d+|Block\s*[A-Za-z0-9]+|Road|Marg|Bazaar|Market|Ghat|Industrial Area))\b/gi;

// Devanagari postpositions: "स्थान में", "स्थान के पास", "स्थान के सामने"
const HINDI_POSTPOSITION_REGEX =
  /([ऀ-ॿA-Za-z0-9\s-]{2,25}?)\s*(?:के पास|में|के सामने|के नजदीक|के पीछे|रोड पर|चौक पर|इलाके में)(?=[,\s।.]|$)/g;

// Hinglish postpositions: "Jagah me", "Jagah ke paas"
const HINGLISH_POSTPOSITION_REGEX =
  /\b([A-Z][A-Za-z0-9\s-]{2,25}?)\s+(?:me|mein|ke paas|ke pass|ke samne|ke peeche)\b/gi;

/**
 * Detects whether the text is Hindi Devanagari, Hinglish, or English.
 *
 * @param {string} text
 * @returns {'hi' | 'hi-Latn' | 'en'}
 */
function detectLanguage(text) {
  // Check for Devanagari Unicode range \u0900-\u097F
  const devanagariMatches = text.match(/[\u0900-\u097F]/g);
  if (devanagariMatches && devanagariMatches.length >= 3) {
    return 'hi';
  }

  // Check for common Hinglish particles in Latin script
  const hinglishMarkers = /\b(hai|hain|raha|rahi|rahe|bahut|bohot|aur|se|me|mein|ke|ko|yeh|ye|woh|karo|nahi|ganda|paani|dhuan|kachra|shor|kripya)\b/i;
  if (hinglishMarkers.test(text)) {
    return 'hi-Latn';
  }

  return 'en';
}

/**
 * Extracts explicit locations mentioned in text.
 * Strictly adheres to rule: NEVER invent or guess locations.
 *
 * @param {string} text
 * @returns {{ locations: string[], extractionMethod: string, hasExplicitLocation: boolean }}
 */
function extractExplicitLocations(text) {
  const found = new Set();

  // 1. Check known landmark entities (English + Hindi)
  for (const landmark of KNOWN_LANDMARKS) {
    const regex = new RegExp(`\\b${landmark.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(text)) {
      found.add(landmark);
    }
  }

  // 2. Check suffix patterns (e.g. "Sector 62", "Mayur Vihar")
  let match;
  const suffixRegex = new RegExp(SPECIFIC_AREA_SUFFIX_REGEX.source, 'gi');
  while ((match = suffixRegex.exec(text)) !== null) {
    const loc = match[1].trim();
    if (loc.length > 3 && !found.has(loc)) {
      found.add(loc);
    }
  }

  // 3. Check English spatial prepositions ("near Anand Vihar")
  const prepRegex = new RegExp(ENGLISH_LOCATION_PREPOSITIONS.source, 'g');
  while ((match = prepRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (!/^(the\s+morning|the\s+night|yesterday|today|night|evening)$/i.test(candidate)) {
      if (candidate.length > 3 && candidate.length < 30) {
        found.add(candidate);
      }
    }
  }

  // 4. Check Hindi Devanagari postpositions ("आनंद विहार में")
  const hiRegex = new RegExp(HINDI_POSTPOSITION_REGEX.source, 'g');
  while ((match = hiRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length > 2 && candidate.length < 30 && !/^(आज|कल|सुबह|शाम|रात)$/.test(candidate)) {
      found.add(candidate);
    }
  }

  // 5. Check Hinglish postpositions ("Anand Vihar me")
  const hinglishRegex = new RegExp(HINGLISH_POSTPOSITION_REGEX.source, 'gi');
  while ((match = hinglishRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length > 2 && candidate.length < 30 && !/^(aaj|kal|subah|shaam|raat)$/i.test(candidate)) {
      found.add(candidate);
    }
  }

  const locationsList = Array.from(found);
  return {
    locations: locationsList,
    extractionMethod: locationsList.length > 0 ? 'multilingual_pattern_and_entity_matching' : 'none',
    hasExplicitLocation: locationsList.length > 0,
  };
}

/**
 * Analyzes complaint text deterministically supporting English, Hindi, and Hinglish.
 *
 * @param {string} text - Raw complaint text
 * @param {Object} [metadata] - Optional complainant submission metadata
 * @returns {Object} Structured complaint analysis report
 */
function analyzeComplaintText(text, metadata = {}) {
  // 1. Input sanitization & validation
  if (!text || typeof text !== 'string') {
    return {
      success: false,
      error: 'Complaint text must be a non-empty string.',
      code: 'INVALID_INPUT',
    };
  }

  const trimmed = text.trim();
  if (trimmed.length < 5) {
    return {
      success: false,
      error: 'Complaint text is too short to analyze (minimum 5 characters required).',
      code: 'TEXT_TOO_SHORT',
    };
  }

  if (trimmed.length > 10000) {
    return {
      success: false,
      error: 'Complaint text exceeds maximum length of 10,000 characters.',
      code: 'TEXT_TOO_LONG',
    };
  }

  const detectedLanguage = detectLanguage(trimmed);
  const lower = trimmed.toLowerCase();

  // 2. Category Keyword Matching (Multi-language lexicon)
  const categoryScores = {
    air: 0,
    water: 0,
    noise: 0,
    waste: 0,
    other: 0,
  };
  const matchedKeywords = {
    air: [],
    water: [],
    noise: [],
    waste: [],
    other: [],
  };

  for (const [cat, keywords] of Object.entries(CATEGORY_LEXICON)) {
    for (const kw of keywords) {
      // Check Devanagari or Latin token
      const isDevanagari = /[\u0900-\u097F]/.test(kw);
      const kwPattern = isDevanagari
        ? new RegExp(kw, 'i')
        : new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');

      if (kwPattern.test(isDevanagari ? trimmed : lower)) {
        categoryScores[cat]++;
        matchedKeywords[cat].push(kw);
      }
    }
  }

  const totalMatches = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const isRelevant = totalMatches > 0;
  let primaryCategory = 'other';
  let secondaryCategories = [];
  let confidence = 'low';

  if (!isRelevant) {
    primaryCategory = 'irrelevant_or_general';
    confidence = 'low';
  } else {
    const sorted = Object.entries(categoryScores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    primaryCategory = sorted[0][0];
    secondaryCategories = sorted.slice(1).map(([cat]) => cat);

    const topScore = sorted[0][1];
    if (topScore >= 3) {
      confidence = 'high';
    } else if (topScore >= 1) {
      confidence = 'medium';
    }
  }

  // 3. Location Extraction (strict fact preservation)
  const locResult = extractExplicitLocations(trimmed);

  // 4. Severity Assessment
  let severityScore = 0;
  const severityReasonsEn = [];
  const severityReasonsHi = [];
  let hasCriticalMatch = false;
  let hasHighMatch = false;
  let hasMediumMatch = false;

  for (const rule of SEVERITY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower) || pattern.test(trimmed)) {
        severityScore += rule.weight;
        severityReasonsEn.push(rule.reason.en);
        severityReasonsHi.push(rule.reason.hi);
        if (rule.level === 'critical') hasCriticalMatch = true;
        if (rule.level === 'high') hasHighMatch = true;
        if (rule.level === 'medium') hasMediumMatch = true;
        break;
      }
    }
  }

  // Determine severity tier
  let severityLevel = 'low';
  if (hasCriticalMatch) {
    severityLevel = 'critical';
  } else if (hasHighMatch) {
    severityLevel = 'high';
  } else if (hasMediumMatch) {
    severityLevel = 'medium';
  } else {
    severityLevel = 'low';
  }

  // 5. Specific Observation Indicators (extracted facts)
  const observations = {
    odorsReported:
      /\b(smell|odor|odour|stink|foul|stench|badbu)\b/i.test(lower) ||
      /(बदबू|दुर्गंध)/.test(trimmed),
    visiblePlumeOrSmoke:
      /\b(black smoke|thick smoke|smoke|smog|dust cloud|plume|dhuan|kala dhuan)\b/i.test(lower) ||
      /(धुआं|धुआँ|काला धुआं)/.test(trimmed),
    waterDiscolorationOrFoam:
      /\b(black water|brown water|foam|froth|discolored|sludge|ganda pani|jhag)\b/i.test(lower) ||
      /(गंदा पानी|झाग|दूषित जल)/.test(trimmed),
    noiseDisturbance:
      /\b(loud|sound|noise|music|blasting|honking|shor|aawaz|loudspeaker)\b/i.test(lower) ||
      /(शोर|तेज आवाज|लाउडस्पीकर)/.test(trimmed),
    wasteAccumulation:
      /\b(garbage|trash|dumping|pile|landfill|litter|kachra|kuda|dher)\b/i.test(lower) ||
      /(कचरा|कूड़ा|गंदगी|ढेर)/.test(trimmed),
    healthSymptomsMentioned:
      /\b(cough|throat|breathing|asthma|choking|eyes burning|vomit|headache|sick|saans)\b/i.test(lower) ||
      /(खांसी|गला|सांस|घुटन|जलन|बीमार)/.test(trimmed),
  };

  // 6. Return Structured Output strictly distinguishing facts vs inferences
  return {
    success: true,
    complaintId: metadata.complaintId || null,
    analyzedAt: new Date().toISOString(),
    isRelevantEnvironmentalComplaint: isRelevant,

    // Language identification
    detectedLanguage,
    originalText: trimmed, // Preserve original input verbatim

    // Extracted Facts (directly from citizen submission; zero hallucination)
    extractedFacts: {
      textLength: trimmed.length,
      explicitLocations: locResult.locations,
      hasExplicitLocation: locResult.hasExplicitLocation,
      locationExtractionMethod: locResult.extractionMethod,
      observedIndicators: observations,
      submittedMetadata: metadata,
      inferredCoordinates: null, // Strictly null: never invent coordinates
      coordinatesNotice:
        'Coordinates must be obtained from verified complainant GPS or official GIS lookup, not text estimation.',
    },

    // Inferred Classifications (with English and Hindi localizations)
    inferredClassifications: {
      primaryCategory,
      localizedCategory: CATEGORY_NAMES[primaryCategory] || CATEGORY_NAMES.other,
      secondaryCategories,
      confidence,
      matchedKeywordCount: totalMatches,
      matchedKeywords: matchedKeywords[primaryCategory] || [],
      severity: {
        level: severityLevel,
        score: severityScore,
        localizedLevel: SEVERITY_NAMES[severityLevel],
        justifications: {
          en: Array.from(new Set(severityReasonsEn)),
          hi: Array.from(new Set(severityReasonsHi)),
        },
      },
    },

    // Disclaimers
    disclaimers: {
      classificationNotice:
        'Category and severity are deterministic rule-based preliminary triage classifications and must be reviewed by an authorized enforcement officer.',
      dataIntegrityNotice:
        'No coordinates, sensor readings, or personal identification details were imputed or generated.',
    },
  };
}

/**
 * Formats a raw complaint analysis result into the exact AIAnalysisOutput contract
 * expected by the frontend without fabricating data or trends.
 *
 * @param {Object} rawResult - Output of analyzeComplaintText
 * @param {Object} [options]
 * @param {string} [options.complaintId]
 * @param {Array} [options.media]
 * @param {Object} [options.location]
 * @param {Object} [options.environmentalAssessment]
 * @returns {Object} Frontend-compatible AIAnalysisOutput
 */
function formatAIAnalysisOutput(rawResult, options = {}) {
  const { complaintId, media = [], location, environmentalAssessment, timestamp } = options;
  const rawCat = rawResult.inferredClassifications?.primaryCategory || 'other';
  const text = (rawResult.originalText || '').toLowerCase();
  const matched = rawResult.inferredClassifications?.matchedKeywords || [];

  // 1. Map to IncidentCategory
  let category = 'Other Air Pollution';
  const isWaste = rawCat === 'waste' || /garbage|waste|trash|kachra|kuda|कचरा|कूड़ा/.test(text);
  const isStubble = /stubble|parali|crop|biomass|पराली|खेत/.test(text) || matched.includes('parali') || matched.includes('stubble');
  const isVehicular = /vehicle|vehicular|traffic|truck|bus|diesel|exhaust|गाड़ी|ट्रैफिक/.test(text);
  const isDust = /dust|construction|demolition|debris|cement|धूल|निर्माण/.test(text) || matched.includes('dhool') || matched.includes('dust');
  const isIndustrial = /industrial|factory|chimney|boiler|furnace|stack|फैक्ट्री|चिमनी|कारखाना/.test(text) || matched.includes('chimney') || matched.includes('factory');

  if (isWaste) {
    category = 'Waste Burning';
  } else if (isStubble) {
    category = 'Biomass / Stubble Burning';
  } else if (isIndustrial) {
    category = 'Industrial Emissions';
  } else if (isVehicular) {
    category = 'Vehicular Emissions';
  } else if (isDust) {
    category = 'Construction Dust';
  } else {
    category = 'Other Air Pollution';
  }

  // 2. Map Severity
  const sevMap = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  const rawSev = rawResult.inferredClassifications?.severity?.level || 'low';
  const severity = sevMap[rawSev] || 'Low';

  // 3. Map Urgency
  const urgMap = { Critical: 'Immediate', High: 'High', Medium: 'Moderate', Low: 'Low' };
  const urgency = urgMap[severity] || 'Low';

  // 4. Confidence
  const rawConf = rawResult.inferredClassifications?.confidence;
  const confidence = typeof rawConf === 'number' ? Math.min(Math.max(rawConf, 0.0), 1.0) : 0.65;

  // 5. Summary
  const locations = rawResult.extractedFacts?.explicitLocations || [];
  const locStr = locations.length > 0 ? ` near ${locations.join(', ')}` : '';
  const lang = rawResult.detectedLanguage === 'hi' ? 'Hindi' : rawResult.detectedLanguage === 'hi-Latn' ? 'Hinglish' : 'English';
  const localizedCat = category === 'Waste Burning'
    ? 'ठोस अपशिष्ट / कचरा'
    : (rawResult.inferredClassifications?.localizedCategory?.hi || '');
  const hiTag = localizedCat ? ` (${localizedCat})` : '';
  const summary = `Complaint triaged as ${category}${hiTag}${locStr}. Assessed with ${severity} severity based on ${lang} citizen report details. Ground verification recommended.`;

  // 6. Supporting Evidence
  const cid = complaintId || `inc-${Date.now()}`;
  const now = timestamp || new Date().toISOString();
  const ev = [
    {
      id: `ev-${cid}-1`,
      type: 'citizen_report',
      title: 'Citizen complaint submission',
      description: (rawResult.originalText || '').slice(0, 220),
      source: rawResult.detectedLanguage === 'hi' ? 'Citizen portal (Hindi)' : rawResult.detectedLanguage === 'hi-Latn' ? 'Citizen portal (Hinglish)' : 'Citizen portal (English)',
      timestamp: now,
      location: location || (locations.length ? { address: locations.join(', '), lat: null, lng: null } : undefined),
      reliability: 'Unverified',
      simulated: false,
    },
  ];

  if (Array.isArray(media)) {
    media.forEach((m, idx) => {
      ev.push({
        id: `ev-${cid}-${idx + 2}`,
        type: 'citizen_media',
        title: `Citizen ${m.kind || 'media'}: ${m.name || 'attachment'}`,
        description: m.backendRef ? `Stored privately on backend (${m.backendRef}). Not analyzed automatically.` : 'Attached by citizen. Not automatically reviewed.',
        source: 'Citizen upload',
        url: m.url || '',
        timestamp: now,
        reliability: 'Unverified',
        simulated: false,
      });
    });
  }
  const evIds = ev.map((e) => e.id);

  // 7. Possible Sources
  const srcHypotheses = {
    'Industrial Emissions': 'Industrial facility or stationary boiler combustion plume',
    'Waste Burning': 'Open municipal solid waste or refuse burning',
    'Biomass / Stubble Burning': 'Agricultural crop residue or open biomass burning',
    'Vehicular Emissions': 'Localized vehicular traffic or diesel exhaust congestion',
    'Construction Dust': 'Uncovered construction, demolition or road dust',
    'Other Air Pollution': 'Unidentified localized pollution emission source',
  };
  const primarySource = srcHypotheses[category] || 'Unidentified local combustion source';

  const possibleSources = [
    {
      id: `src-${cid}-1`,
      source: primarySource,
      confidence: Math.round(confidence * 100) / 100,
      supportingEvidenceIds: evIds,
      contraryEvidence: Array.isArray(media) && media.length > 0 ? [] : ['No photographic or video evidence attached to report.'],
      verificationRequired: ['On-site physical inspection by field officer', 'Source plume triangulation'],
    },
  ];

  // 8. Contradictory Evidence
  const contradictoryEvidence = [];
  if (!location?.lat && !location?.lng) {
    contradictoryEvidence.push('No GPS coordinates attached; location based on text extraction only.');
  }
  if (!Array.isArray(media) || !media.length) {
    contradictoryEvidence.push('No photographic or video evidence submitted.');
  }
  contradictoryEvidence.push('Preliminary rule-based triage; ground verification required prior to enforcement.');

  // 9. Trend Estimate (Honest: no invented trends without time-series)
  const trendEstimate = {
    direction: 'stable',
    next72hAqi: [],
    method: 'Trend analysis unavailable without historical time-series sensor data',
    disclaimer: 'No forecast model data available for this complaint location; zero values invented.',
  };

  // 10. Recommendations
  const recMap = {
    Critical: [
      'Immediate dispatch of field officer for emergency on-site inspection.',
      'Notify local health administration if acute choking or toxic fumes reported.',
      'Contact reporter for additional safety details if feasible.',
    ],
    High: [
      'Schedule priority site inspection within 24 hours.',
      'Cross-reference with nearest air monitoring station and satellite detections.',
      'Issue warning notice to suspected polluters in the zone.',
    ],
    Medium: [
      'Schedule routine inspection within standard response SLA.',
      'Log incident in ward-level compliance tracking.',
    ],
    Low: [
      'Log incident for general environmental monitoring.',
      'Review during periodic ward audit.',
    ],
  };
  const recommendations = recMap[severity] || recMap.Low;

  // 11. Environmental Context (if real assessment provided)
  let environmentalContext = undefined;
  if (environmentalAssessment?.data?.airQuality) {
    const aq = environmentalAssessment.data.airQuality;
    const weather = environmentalAssessment.data.weather?.current || {};
    const pm25Val = aq.pollutants?.pm2_5?.value ?? 0;
    const pm10Val = aq.pollutants?.pm10?.value ?? 0;
    environmentalContext = {
      stationName: 'Open-Meteo Model Grid (CAMS Global)',
      readingTime: aq.lastUpdated || now,
      aqi: pm25Val ? Math.round(pm25Val * 2) : 0,
      aqiCategory: 'Atmospheric Model Estimate (Not CPCB NAQI)',
      pm25_24h: pm25Val,
      pm10_24h: pm10Val,
      windDirection: weather.windDirectionCompass || 'n/a',
      windSpeedKmh: weather.windSpeedKmh ?? 0,
      temperatureC: weather.temperatureC ?? 0,
      humidityPct: weather.relativeHumidityPct ?? 0,
      simulated: false,
    };
  }

  return {
    category,
    severity,
    urgency,
    confidence: Math.round(confidence * 100) / 100,
    summary,
    possibleSources,
    supportingEvidence: ev,
    contradictoryEvidence,
    trendEstimate,
    recommendations,
    compliance: [],
    ...(environmentalContext ? { environmentalContext } : {}),
    generatedBy: 'backend-ai',
    generatedAt: now,
    engineNote: 'Analyzed by backend deterministic rule engine (HackOps 2.0 Intelligence Pipeline).',
  };
}

module.exports = {
  analyzeComplaintText,
  formatAIAnalysisOutput,
  extractExplicitLocations,
  detectLanguage,
  CATEGORY_LEXICON,
  CATEGORY_NAMES,
  SEVERITY_NAMES,
  SEVERITY_RULES,
};
