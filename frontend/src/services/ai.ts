// Rule-based stand-in for the backend Intelligence Engine.
// It produces the same AIAnalysisOutput shape the backend is expected to return
// from POST /api/intelligence/analyze-complaint (currently 501 on the backend).
// Outputs are hypotheses for an officer to verify, never findings of fact.
import type {
  AIAnalysisOutput,
  ComplaintInput,
  ComplianceComparison,
  EvidenceItem,
  IncidentCategory,
  Severity,
  SourceHypothesis,
  Urgency,
} from '@/types';
import { CATEGORY_DEPARTMENT, aqiCategory } from '@/config/constants';
import { compare } from './compliance';
import { nearestStation, projectSeries, stationSeries, trendDirection } from './airQuality';
import { clamp, hashString, seeded, uid } from '@/utils';

interface CategoryRule {
  category: IncidentCategory;
  keywords: string[];
  sources: string[];
  recommendations: string[];
}

const RULES: CategoryRule[] = [
  {
    category: 'Biomass / Stubble Burning',
    keywords: ['stubble', 'parali', 'crop', 'farm', 'field', 'agricultur', 'paddy', 'पराली', 'खेत', 'फसल', 'पुआल'],
    sources: ['Open crop-residue burning on nearby farmland', 'Biomass burning at brick kilns', 'Garden/leaf-litter burning'],
    recommendations: [
      'Dispatch a field team to confirm active fire and extent of burnt area.',
      'Cross-check satellite fire detections (e.g. NASA FIRMS) for the last 24 h.',
      'Inform the crop-residue cell about in-situ / ex-situ residue management options for the farmer.',
    ],
  },
  {
    category: 'Industrial Emissions',
    keywords: ['factory', 'industr', 'chimney', 'stack', 'plant', 'boiler', 'furnace', 'फैक्ट्री', 'कारखाना', 'चिमनी', 'उद्योग'],
    sources: ['Stack emissions from a nearby industrial unit', 'Fugitive emissions from material handling', 'Unauthorised furnace or boiler fuel'],
    recommendations: [
      'Inspect units within ~1 km for consent-to-operate conditions and emission control devices.',
      'Check online continuous emission monitoring (OCEMS) data where installed.',
      'Collect stack-monitoring evidence before any enforcement action.',
    ],
  },
  {
    category: 'Waste Burning',
    keywords: ['garbage', 'waste', 'trash', 'plastic', 'dump', 'landfill', 'rubbish', 'कचरा', 'कूड़ा', 'प्लास्टिक', 'लैंडफिल'],
    sources: ['Open burning of municipal solid waste', 'Landfill surface fire', 'Burning of plastic/e-waste by informal recyclers'],
    recommendations: [
      'Extinguish fire and clear the burn site; deploy municipal sanitation crew.',
      'Identify the waste generator or collection gap that led to dumping.',
      'Install signage / periodic patrol for repeat locations.',
    ],
  },
  {
    category: 'Vehicular Emissions',
    keywords: ['traffic', 'vehicle', 'truck', 'bus', 'jam', 'exhaust', 'diesel', 'गाड़ी', 'ट्रक', 'जाम', 'धुआं छोड़'],
    sources: ['Congestion-related tailpipe emissions', 'Visibly polluting (smoke-emitting) vehicles', 'Idling heavy vehicles'],
    recommendations: [
      'Deploy traffic enforcement for visibly polluting vehicles and PUC checks.',
      'Review signal timing / diversion for the congested corridor.',
    ],
  },
  {
    category: 'Construction Dust',
    keywords: ['construction', 'dust', 'demolition', 'cement', 'sand', 'building', 'निर्माण', 'धूल', 'मलबा', 'सीमेंट'],
    sources: ['Uncovered construction material', 'Demolition without dust suppression', 'Road dust re-suspension'],
    recommendations: [
      'Verify dust-control measures at the site (barriers, sprinklers, covered material).',
      'Check C&D waste handling and registration of the project on the dust portal.',
    ],
  },
];

const SEVERE_WORDS = ['huge', 'massive', 'thick', 'black smoke', 'cannot breathe', "can't breathe", 'hospital', 'children', 'asthma', 'every night', 'daily', 'घना', 'सांस', 'बच्चे', 'रोज़'];

function classify(text: string) {
  const t = text.toLowerCase();
  let best: { rule: CategoryRule; hits: number } | null = null;
  for (const rule of RULES) {
    const hits = rule.keywords.filter((k) => t.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { rule, hits };
  }
  const severeHits = SEVERE_WORDS.filter((w) => t.includes(w)).length;
  return { rule: best?.rule ?? null, keywordHits: best?.hits ?? 0, severeHits };
}

function severityFrom(aqi: number, severeHits: number): Severity {
  const score = aqi + severeHits * 45;
  if (score >= 380) return 'Critical';
  if (score >= 280) return 'High';
  if (score >= 170) return 'Medium';
  return 'Low';
}

const URGENCY: Record<Severity, Urgency> = { Critical: 'Immediate', High: 'High', Medium: 'Moderate', Low: 'Low' };

export function buildCompliance(pm25: number, pm10: number): ComplianceComparison[] {
  const limitations = ['Simulated single-station 24-h average (demo data), not validated CAAQMS data.'];
  return (['PM2.5', 'PM10'] as const).map((pollutant) =>
    compare({ pollutant, observed: pollutant === 'PM2.5' ? pm25 : pm10, unit: 'µg/m³', averagingPeriod: '24 hours', needsVerification: true, limitations }),
  );
}

/** Mock analysis. Deterministic for a given complaint so re-renders stay stable. */
export function mockAnalyze(c: ComplaintInput): AIAnalysisOutput {
  const rnd = seeded(hashString(c.id));
  const { rule, keywordHits, severeHits } = classify(`${c.originalText} ${c.translatedText ?? ''}`);
  const station = nearestStation(c.location.lat, c.location.lng);
  const series = stationSeries(station.name, 30, station.intensity);
  const today = series[series.length - 1];
  const now = new Date().toISOString();

  const category: IncidentCategory = rule?.category ?? 'Other Air Pollution';
  const severity = severityFrom(today.aqi, severeHits);
  const hasMedia = c.evidenceFiles.length > 0;
  const confidence = clamp(0.38 + keywordHits * 0.12 + (hasMedia ? 0.12 : 0) + rnd() * 0.08, 0.3, 0.92);

  const ev: EvidenceItem[] = [
    {
      id: uid('ev'),
      type: 'citizen_report',
      title: 'Citizen complaint text',
      description: c.originalText.slice(0, 220),
      source: c.language === 'hi' ? 'Citizen portal (Hindi)' : 'Citizen portal',
      timestamp: c.timestamp,
      location: c.location,
      reliability: 'Unverified',
      simulated: false,
    },
    ...c.evidenceFiles.map<EvidenceItem>((m) => ({
      id: uid('ev'),
      type: 'citizen_media',
      title: `Citizen ${m.kind}: ${m.name}`,
      description: 'Uploaded by reporter. Not yet reviewed; image content is not automatically analysed in demo mode.',
      source: 'Citizen upload',
      url: m.url,
      timestamp: m.uploadedAt,
      location: c.location,
      reliability: 'Unverified',
      simulated: false,
    })),
    {
      id: uid('ev'),
      type: 'sensor',
      title: `${station.name}: 24-h PM2.5 ${today.pm25} µg/m³, PM10 ${today.pm10} µg/m³`,
      description: `Nearest monitoring station. AQI ${today.aqi} (${aqiCategory(today.aqi).name}).`,
      source: station.name,
      timestamp: now,
      reliability: 'Medium',
      simulated: true,
    },
    {
      id: uid('ev'),
      type: 'weather',
      title: 'Low wind speed, north-westerly flow',
      description: 'Calm conditions limit dispersion; NW flow can carry regional biomass smoke into the city.',
      source: 'Demo weather feed',
      timestamp: now,
      reliability: 'Medium',
      simulated: true,
    },
  ];
  if (category === 'Biomass / Stubble Burning') {
    ev.push({
      id: uid('ev'),
      type: 'satellite',
      title: `${2 + Math.floor(rnd() * 5)} thermal anomalies within 10 km (last 24 h)`,
      description: 'Simulated satellite fire detections. Verify against NASA FIRMS before relying on this.',
      source: 'Demo satellite feed (FIRMS-style)',
      timestamp: now,
      reliability: 'Medium',
      simulated: true,
    });
  }

  const supportIds = ev.filter((e) => e.type !== 'weather').map((e) => e.id);
  const sourceNames = rule?.sources ?? ['Unidentified local combustion source', 'Regional background pollution'];
  const possibleSources: SourceHypothesis[] = sourceNames.map((s, i) => ({
    id: uid('src'),
    source: s,
    confidence: Math.round(clamp(confidence - i * 0.17 - rnd() * 0.05, 0.08, 0.9) * 100) / 100,
    supportingEvidenceIds: i === 0 ? supportIds : supportIds.slice(0, 1),
    contraryEvidence:
      i === 0
        ? hasMedia
          ? []
          : ['No photo or video evidence attached to the complaint.']
        : ['Fewer matching keywords in the complaint.'],
    verificationRequired: ['On-site inspection by field officer', i === 0 ? 'Photographic evidence of the source' : 'Rule out primary hypothesis first'],
  }));

  const contradictory: string[] = [];
  if (today.aqi < 150) contradictory.push('Nearest station AQI is not elevated; the event may be very local or short-lived.');
  if (!hasMedia) contradictory.push('No media evidence submitted.');
  if (!rule) contradictory.push('Complaint text does not clearly indicate a source type.');

  const projection = projectSeries(series, 3);
  return {
    category,
    severity,
    urgency: URGENCY[severity],
    confidence: Math.round(confidence * 100) / 100,
    summary: `Complaint likely relates to ${category.toLowerCase()}. Nearest station shows AQI ${today.aqi} (${aqiCategory(today.aqi).name}). Suggested routing: ${CATEGORY_DEPARTMENT[category].replace(/\.$/, '')}.`,
    possibleSources,
    supportingEvidence: ev,
    contradictoryEvidence: contradictory,
    trendEstimate: {
      direction: trendDirection(series),
      next72hAqi: projection.map((p) => p.aqi),
      method: 'Linear trend over the last 7 daily averages',
      disclaimer: 'Estimate only: naive trend line, not a forecast model. Weather changes can reverse it.',
    },
    recommendations: rule?.recommendations ?? [
      'Contact the reporter for more detail on the smoke source.',
      'Schedule an inspection to identify the source.',
    ],
    compliance: buildCompliance(today.pm25, today.pm10),
    environmentalContext: {
      stationName: station.name,
      readingTime: now,
      aqi: today.aqi,
      aqiCategory: aqiCategory(today.aqi).name,
      pm25_24h: today.pm25,
      pm10_24h: today.pm10,
      windDirection: 'NW',
      windSpeedKmh: Math.round(3 + rnd() * 6),
      temperatureC: Math.round(18 + rnd() * 8),
      humidityPct: Math.round(55 + rnd() * 25),
      simulated: true,
    },
    generatedBy: 'mock-rules',
    generatedAt: now,
    engineNote: 'Generated by the in-browser rule engine (backend AI endpoint not yet available).',
  };
}
