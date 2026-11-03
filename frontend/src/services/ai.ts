// Rule-based stand-in for the backend Intelligence Engine.
// It produces the same AIAnalysisOutput shape the backend is expected to return
// from POST /api/intelligence/analyze-complaint (currently 501 on the backend).
// Outputs are hypotheses for an officer to verify, never findings of fact.
import type {
  AIAnalysisOutput,
  ComplaintInput,
  EnvironmentalReading,
  ComplianceComparison,
  EvidenceItem,
  IncidentCategory,
  Severity,
  SourceHypothesis,
  Urgency,
} from '@/types';
import { CATEGORY_DEPARTMENT, aqiCategory } from '@/config/constants';
import { compare } from './compliance';
import { dailySeriesFromReadings } from './airQuality';
import { clamp, uid } from '@/utils';

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

function severityFrom(aqi: number | undefined, severeHits: number): Severity {
  // Without monitoring data, severity rests on the complaint text alone.
  const score = (aqi ?? 150) + severeHits * 45;
  if (score >= 380) return 'Critical';
  if (score >= 280) return 'High';
  if (score >= 170) return 'Medium';
  return 'Low';
}

const URGENCY: Record<Severity, Urgency> = { Critical: 'Immediate', High: 'High', Medium: 'Moderate', Low: 'Low' };

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Rule-based complaint analysis. Environmental context, compliance and sensor
 * evidence come ONLY from imported readings within 10 km; with none, those
 * sections stay empty rather than being invented.
 */
export function mockAnalyze(c: ComplaintInput, readings: EnvironmentalReading[] = []): AIAnalysisOutput {
  const { rule, keywordHits, severeHits } = classify(`${c.originalText} ${c.translatedText ?? ''}`);
  const now = new Date().toISOString();
  const { lat, lng } = c.location;

  let ctx: AIAnalysisOutput['environmentalContext'];
  const compliance: ComplianceComparison[] = [];
  let aqiSeries: number[] = [];
  const sensorEvidence: EvidenceItem[] = [];
  if (lat != null && lng != null) {
    const near = readings.filter((r) => r.lat != null && r.lng != null && km(lat, lng, r.lat, r.lng) <= 10);
    if (near.length) {
      const nearest = near.reduce((best, r) => (km(lat, lng, r.lat!, r.lng!) < km(lat, lng, best.lat!, best.lng!) ? r : best));
      const st = near.filter((r) => r.station === nearest.station);
      const daily = dailySeriesFromReadings(st).filter((d) => d.aqi != null);
      aqiSeries = daily.map((d) => d.aqi);
      const last = daily[daily.length - 1];
      if (last) {
        const dayRs = st.filter((r) => dayOf(r.timestamp) === last.date);
        const valid24 = dayRs.every((r) => r.averagingPeriod === '24 hours') || (dayRs.every((r) => r.averagingPeriod === '1 hour') && dayRs.length >= 16);
        const files = [...new Set(st.map((r) => r.fileName))].join(', ');
        const dist = Math.round(km(lat, lng, nearest.lat!, nearest.lng!) * 10) / 10;
        ctx = {
          stationName: nearest.station,
          readingTime: dayRs[dayRs.length - 1]?.timestamp ?? now,
          aqi: last.aqi,
          aqiCategory: aqiCategory(last.aqi).name,
          pm25_24h: last.pm25 ?? 0,
          pm10_24h: last.pm10 ?? 0,
          windDirection: 'n/a',
          windSpeedKmh: 0,
          temperatureC: 0,
          humidityPct: 0,
          simulated: false,
        };
        const lim = [`Imported data (${files}), not validated CAAQMS records.`, `Station ${dist} km from the complaint location; most recent recorded day ${last.date}.`];
        for (const p of ['PM2.5', 'PM10'] as const) {
          const v = p === 'PM2.5' ? last.pm25 : last.pm10;
          if (v != null) compliance.push(compare({ pollutant: p, observed: v, unit: 'µg/m³', averagingPeriod: valid24 ? '24 hours' : 'unknown', needsVerification: true, limitations: lim }));
        }
        sensorEvidence.push({ id: uid('ev'), type: 'sensor', title: `${nearest.station}: AQI ${last.aqi} on ${last.date}`, description: `${dayRs.length} imported value(s) that day; ${dist} km away.`, source: files, timestamp: dayRs[0]?.timestamp ?? now, reliability: 'Unverified', simulated: false });
      }
    }
  }

  const category: IncidentCategory = rule?.category ?? 'Other Air Pollution';
  const severity = severityFrom(ctx?.aqi, severeHits);
  const hasMedia = c.evidenceFiles.length > 0;
  const confidence = clamp(0.35 + keywordHits * 0.12 + (hasMedia ? 0.1 : 0) + (ctx ? 0.08 : 0), 0.25, 0.9);

  const ev: EvidenceItem[] = [
    { id: uid('ev'), type: 'citizen_report', title: 'Citizen complaint text', description: c.originalText.slice(0, 220), source: c.language === 'hi' ? 'Citizen portal (Hindi)' : 'Citizen portal', timestamp: c.timestamp, location: c.location, reliability: 'Unverified', simulated: false },
    ...c.evidenceFiles.map<EvidenceItem>((m) => ({ id: uid('ev'), type: 'citizen_media', title: `Citizen ${m.kind}: ${m.name}`, description: 'Uploaded by reporter. Not reviewed; image content is not analysed automatically.', source: 'Citizen upload', url: m.url, timestamp: m.uploadedAt, location: c.location, reliability: 'Unverified', simulated: false })),
    ...sensorEvidence,
  ];
  const ids = ev.map((e) => e.id);
  const possibleSources: SourceHypothesis[] = (rule?.sources ?? ['Unidentified local combustion source']).map((s, i) => ({
    id: uid('src'),
    source: s,
    confidence: Math.round(clamp(confidence - i * 0.17, 0.08, 0.9) * 100) / 100,
    supportingEvidenceIds: i === 0 ? ids : ids.slice(0, 1),
    contraryEvidence: i === 0 ? (hasMedia ? [] : ['No photo or video evidence attached.']) : ['Fewer matching keywords in the complaint.'],
    verificationRequired: ['On-site inspection by field officer', i === 0 ? 'Photographic evidence of the source' : 'Rule out primary hypothesis first'],
  }));

  const contradictory: string[] = [];
  if (!ctx) contradictory.push('No imported monitoring data within 10 km; severity is based on the complaint text only.');
  else if (ctx.aqi < 150) contradictory.push('Nearest imported station does not show elevated AQI.');
  if (!hasMedia) contradictory.push('No media evidence submitted.');
  if (!rule) contradictory.push('Complaint text does not clearly indicate a source type.');

  const s7 = aqiSeries.slice(-7);
  const slopeV = s7.length >= 3 ? (s7[s7.length - 1] - s7[0]) / (s7.length - 1) : 0;
  return {
    category,
    severity,
    urgency: URGENCY[severity],
    confidence: Math.round(confidence * 100) / 100,
    summary: `Complaint likely relates to ${category.toLowerCase()}.${ctx ? ` Nearest imported station (${ctx.stationName}) shows AQI ${ctx.aqi} (${ctx.aqiCategory}).` : ' No monitoring data is available nearby.'} Suggested routing: ${CATEGORY_DEPARTMENT[category].replace(/\.$/, '')}.`,
    possibleSources,
    supportingEvidence: ev,
    contradictoryEvidence: contradictory,
    trendEstimate: {
      direction: slopeV > 4 ? 'rising' : slopeV < -4 ? 'falling' : 'stable',
      next72hAqi: s7.length >= 3 ? [1, 2, 3].map((k) => Math.round(clamp(s7[s7.length - 1] + slopeV * k, 0, 500))) : [],
      method: s7.length >= 3 ? 'Linear trend over recorded daily values at the nearest imported station' : 'Not enough recorded days for a trend',
      disclaimer: 'Estimate only: naive trend line, not a forecast model.',
    },
    recommendations: rule?.recommendations ?? ['Contact the reporter for more detail on the smoke source.', 'Schedule an inspection to identify the source.'],
    compliance,
    environmentalContext: ctx,
    generatedBy: 'mock-rules',
    generatedAt: now,
    engineNote: 'Generated by the in-browser rule engine (backend AI endpoint not yet available).',
  };
}
