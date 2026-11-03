// Preliminary analysis of imported environmental data.
// Rule-based and fully explainable: daily averages, NAAQS screening, spike
// detection, pollutant-signature source hypotheses and complaint linkage.
// It is NOT an AI model; outputs are labelled as preliminary assessments.
import type {
  AIAnalysisOutput,
  ComplianceComparison,
  DailyAggregate,
  EvidenceItem,
  ImportBatch,
  Incident,
  IncidentCategory,
  MeasureKey,
  Pollutant,
  PotentialIncident,
  Severity,
  SourceHypothesis,
} from '@/types';
import { CATEGORY_DEPARTMENT, OPEN_STATUSES, aqiCategory } from '@/config/constants';
import { OFFICERS } from '@/services/mockData';
import { compare } from './compliance';
import { pm10SubIndex, pm25SubIndex } from './airQuality';
import { clamp, isValidCoord, localDay, uid } from '@/utils';

const MIN_HOURS_FOR_24H = 16; // CPCB: at least 16 hourly values for a valid 24-h average

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

type StationReadings = ImportBatch['readings'];

function dailyAggregates(list: StationReadings): { daily: DailyAggregate[]; perPollutant: Record<string, { day: string; value: number; period: string; valid: boolean; hours: number }[]> } {
  const byDay = new Map<string, StationReadings>();
  list.forEach((r) => byDay.set(dayOf(r.timestamp), [...(byDay.get(dayOf(r.timestamp)) ?? []), r]));
  const perPollutant: Record<string, { day: string; value: number; period: string; valid: boolean; hours: number }[]> = {};
  const daily: DailyAggregate[] = [];
  for (const [day, rs] of [...byDay.entries()].sort()) {
    const agg: DailyAggregate = { day, hours: rs.length };
    for (const p of ['PM2.5', 'PM10', 'NO2', 'SO2'] as Pollutant[]) {
      const vals = rs.map((r) => r.values[p]).filter((v): v is number => v != null);
      if (!vals.length) continue;
      const period = rs[0].averagingPeriod;
      let value: number, valid: boolean, outPeriod: string;
      if (period === '24 hours') {
        value = vals.reduce((a, b) => a + b, 0) / vals.length;
        valid = true;
        outPeriod = '24 hours';
      } else if (period === '1 hour') {
        value = vals.reduce((a, b) => a + b, 0) / vals.length;
        valid = vals.length >= MIN_HOURS_FOR_24H;
        outPeriod = valid ? '24 hours' : `${vals.length}-hour partial`;
      } else {
        value = Math.max(...vals);
        valid = false;
        outPeriod = 'unknown';
      }
      value = Math.round(value * 10) / 10;
      (perPollutant[p] ??= []).push({ day, value, period: outPeriod, valid, hours: vals.length });
      if (p === 'PM2.5') agg.pm25 = value;
      if (p === 'PM10') agg.pm10 = value;
    }
    const aqis = rs.map((r) => r.values.AQI).filter((v): v is number => v != null);
    if (aqis.length) agg.aqiMax = Math.max(...aqis);
    else if (agg.pm25 != null || agg.pm10 != null) agg.aqiMax = Math.max(agg.pm25 != null ? pm25SubIndex(agg.pm25) : 0, agg.pm10 != null ? pm10SubIndex(agg.pm10) : 0);
    daily.push(agg);
  }
  return { daily, perPollutant };
}

function detectSpikes(list: StationReadings) {
  const spikes: PotentialIncident['spikes'] = [];
  const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const thresholds: Partial<Record<MeasureKey, number>> = { 'PM2.5': 100, PM10: 200, NO2: 120, SO2: 120 };
  for (const [p, floor] of Object.entries(thresholds) as [MeasureKey, number][]) {
    const series = sorted.filter((r) => r.values[p] != null);
    // A spike must jump against the preceding 24 values AND sit in the station's top 5%,
    // so a regular daily cycle (e.g. every evening) isn't reported as dozens of spikes.
    const all = series.map((r) => r.values[p]!).sort((a, b) => a - b);
    const p95 = all[Math.floor(all.length * 0.95)] ?? Infinity;
    series.forEach((r, i) => {
      const window = series.slice(Math.max(0, i - 24), i).map((x) => x.values[p]!);
      if (window.length < 6) return;
      const base = median(window);
      const v = r.values[p]!;
      if (v > floor && v >= base * 1.8 && v >= p95) spikes.push({ timestamp: r.timestamp, pollutant: p, value: v, baseline: Math.round(base), ref: `${r.fileName} · ${r.ref}` });
    });
  }
  return spikes;
}

interface Signature {
  category: IncidentCategory;
  hypotheses: { source: string; confidence: number; support: string[]; contrary: string[] }[];
  pattern: string[];
}

/** Source hypotheses from pollutant ratios and timing. Indicative only. */
function signature(list: StationReadings, spikes: PotentialIncident['spikes']): Signature {
  const avg = (p: MeasureKey) => {
    const v = list.map((r) => r.values[p]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const pm25 = avg('PM2.5'), pm10 = avg('PM10'), no2 = avg('NO2'), so2 = avg('SO2'), co = avg('CO');
  const ratio = pm25 != null && pm10 ? pm25 / pm10 : undefined;
  const nightShare = spikes.length ? spikes.filter((s) => { const h = new Date(s.timestamp).getHours(); return h >= 18 || h <= 3; }).length / spikes.length : 0;
  const pattern: string[] = [];
  if (ratio != null) pattern.push(`Mean PM2.5/PM10 ratio ${ratio.toFixed(2)} (${ratio > 0.6 ? 'fine-particle dominated, typical of combustion' : ratio < 0.4 ? 'coarse-particle dominated, typical of dust' : 'mixed'})`);
  if (spikes.length) pattern.push(`${spikes.length} short-term spike(s); ${Math.round(nightShare * 100)}% between 18:00 and 03:00`);
  if (no2 != null) pattern.push(`Mean NO2 ${no2.toFixed(0)} µg/m³`);
  if (so2 != null) pattern.push(`Mean SO2 ${so2.toFixed(0)} µg/m³`);

  const hyps: Signature['hypotheses'] = [];
  if (ratio != null && ratio > 0.6) {
    hyps.push({ source: 'Open burning of biomass or waste near the station', confidence: 0.45 + (nightShare > 0.5 ? 0.15 : 0) + (co != null && co > 2 ? 0.08 : 0), support: ['High PM2.5/PM10 ratio', ...(nightShare > 0.5 ? ['Evening/night spike timing'] : []), ...(co != null && co > 2 ? ['Elevated CO'] : [])], contrary: nightShare <= 0.5 ? ['Spikes are not concentrated at night'] : [] });
  }
  if (so2 != null && so2 > 25) hyps.push({ source: 'Industrial combustion (fuel with sulphur content)', confidence: 0.3 + Math.min(0.3, (so2 - 25) / 100), support: [`Mean SO2 ${so2.toFixed(0)} µg/m³ above typical urban background`], contrary: ['SO2 alone does not identify a specific unit'] });
  if (ratio != null && ratio < 0.4) hyps.push({ source: 'Construction / road dust re-suspension', confidence: 0.5, support: ['Low PM2.5/PM10 ratio (coarse particles)'], contrary: [] });
  if (no2 != null && no2 > 60) hyps.push({ source: 'Traffic emissions', confidence: 0.25 + Math.min(0.3, (no2 - 60) / 100), support: [`Mean NO2 ${no2.toFixed(0)} µg/m³`], contrary: [] });
  if (!hyps.length) hyps.push({ source: 'Undetermined local or regional source', confidence: 0.2, support: [], contrary: ['Pollutant signature is not distinctive'] });
  hyps.sort((a, b) => b.confidence - a.confidence);
  hyps.forEach((h) => (h.confidence = Math.round(clamp(h.confidence, 0.1, 0.85) * 100) / 100));

  const top = hyps[0].source;
  const category: IncidentCategory = /biomass|waste/i.test(top) ? (nightShare > 0.5 ? 'Waste Burning' : 'Biomass / Stubble Burning') : /industrial/i.test(top) ? 'Industrial Emissions' : /dust/i.test(top) ? 'Construction Dust' : /traffic/i.test(top) ? 'Vehicular Emissions' : 'Other Air Pollution';
  return { category, hypotheses: hyps, pattern };
}

function severityFrom(maxFactor: number, spikes: number, aqiMax: number): Severity {
  if (maxFactor >= 2.5 || aqiMax >= 401) return 'Critical';
  if (maxFactor >= 1.5 || aqiMax >= 301) return 'High';
  if (maxFactor > 1 || spikes > 0 || aqiMax >= 201) return 'Medium';
  return 'Low';
}

function suggestOfficer(department: string, incidents: Incident[]) {
  const load = (id: string) => incidents.filter((i) => i.assignment?.officerId === id && OPEN_STATUSES.includes(i.status)).length;
  const pool = OFFICERS.filter((o) => o.department === department);
  return (pool.length ? pool : OFFICERS).reduce((best, o) => (load(o.id) < load(best.id) ? o : best));
}

/** Runs the analysis for one import batch against existing incidents. */
export function analyseBatch(batch: ImportBatch, incidents: Incident[]): PotentialIncident[] {
  const out: PotentialIncident[] = [];
  const byStation = new Map<string, StationReadings>();
  batch.readings.forEach((r) => byStation.set(r.station, [...(byStation.get(r.station) ?? []), r]));
  const now = new Date().toISOString();

  for (const [station, list] of byStation) {
    const { daily, perPollutant } = dailyAggregates(list);
    const spikes = detectSpikes(list);
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const located = list.find((r) => isValidCoord(r.lat, r.lng));
    const fromDocument = list.every((r) => r.transformations.some((t) => t.startsWith('Extracted from document')));
    const docLimitation = fromDocument ? ['Values were extracted from document text by pattern matching; confirm against the source document.'] : [];
    const limitations = [`Imported from ${[...new Set(list.map((r) => r.fileName))].join(', ')}; not validated against CAAQMS records.`, ...docLimitation];

    // Compliance: every pollutant/day with a valid 24-h value, plus 1-h CO/O3 maxima.
    const compliance: ComplianceComparison[] = [];
    for (const [p, days] of Object.entries(perPollutant)) {
      const worst = [...days].sort((a, b) => b.value - a.value)[0];
      const unit = list.find((r) => r.units[p as Pollutant])?.units[p as Pollutant] ?? 'µg/m³';
      const c = compare({
        pollutant: p as Pollutant,
        observed: worst.value,
        unit,
        averagingPeriod: worst.valid ? '24 hours' : worst.period,
        needsVerification: true,
        limitations: [
          ...limitations,
          worst.valid ? `Highest 24-h average, on ${worst.day} (${worst.hours} values).` : `Only ${worst.hours} value(s) on ${worst.day}; a 24-h average needs at least ${MIN_HOURS_FOR_24H} hourly values.`,
          `${days.filter((d) => d.valid && d.value > (c0(p) ?? Infinity)).length} of ${days.filter((d) => d.valid).length} valid days above the 24-h limit.`,
        ],
      });
      compliance.push(c);
    }
    for (const p of ['CO', 'O3'] as Pollutant[]) {
      const hourly = list.filter((r) => r.values[p] != null && r.averagingPeriod === '1 hour');
      if (!hourly.length) continue;
      const peak = hourly.reduce((a, b) => (b.values[p]! > a.values[p]! ? b : a));
      compliance.push(compare({ pollutant: p, observed: peak.values[p]!, unit: peak.units[p] ?? '', averagingPeriod: '1 hour', needsVerification: true, limitations: [...limitations, `Peak 1-h value at ${new Date(peak.timestamp).toLocaleString('en-IN')} (${peak.ref}).`] }));
    }

    const factors = compliance.filter((c) => c.exceedanceFactor != null).map((c) => c.exceedanceFactor!);
    const maxFactor = factors.length ? Math.max(...factors) : 0;
    const aqiMax = Math.max(0, ...daily.map((d) => d.aqiMax ?? 0));
    const exceedDays = Object.values(perPollutant).flat().filter((d) => d.valid && compliance.some((c) => c.averagingPeriod === '24 hours' && d.value > c.standardLimit)).length;

    // Not every abnormal reading is an incident: require an exceedance, a spike, or AQI ≥ 201.
    if (maxFactor <= 1 && !spikes.length && aqiMax < 201) continue;

    const sig = signature(list, spikes);
    const severity = severityFrom(maxFactor, spikes.length, aqiMax);
    const urgency = ({ Critical: 'Immediate', High: 'High', Medium: 'Moderate', Low: 'Low' } as const)[severity];
    const department = CATEGORY_DEPARTMENT[sig.category];
    const officer = suggestOfficer(department, incidents);
    const deadline = localDay(severity === 'Critical' ? 1 : severity === 'High' ? 2 : 5);

    // Complaint linkage and repeat-area check (within 5 km).
    const nearby = located
      ? incidents.filter((i) => isValidCoord(i.complaint.location.lat, i.complaint.location.lng) && km(located.lat!, located.lng!, i.complaint.location.lat!, i.complaint.location.lng!) <= 5)
      : [];
    const start = new Date(sorted[0].timestamp).getTime() - 48 * 3600000;
    const end = new Date(sorted[sorted.length - 1].timestamp).getTime() + 48 * 3600000;
    const related = nearby.filter((i) => { const t = new Date(i.complaint.timestamp).getTime(); return t >= start && t <= end; });

    const evidence: EvidenceItem[] = [];
    for (const [p, days] of Object.entries(perPollutant)) {
      days.filter((d) => d.valid).slice(-3).forEach((d) =>
        evidence.push({ id: uid('ev'), type: 'sensor', title: `${station}: ${p} ${d.period} average ${d.value} on ${d.day}`, description: `Computed from ${d.hours} imported value(s).`, source: [...new Set(list.map((r) => r.fileName))].join(', '), timestamp: `${d.day}T00:00:00`, reliability: 'Unverified', simulated: false }),
      );
    }
    spikes.slice(0, 5).forEach((s) => evidence.push({ id: uid('ev'), type: 'sensor', title: `Spike: ${s.pollutant} ${s.value} vs baseline ~${s.baseline}`, description: `At ${new Date(s.timestamp).toLocaleString('en-IN')}.`, source: s.ref, timestamp: s.timestamp, reliability: 'Unverified', simulated: false }));
    for (const doc of batch.documents) {
      doc.findings.filter((f) => f.type === 'observation' || f.type === 'compliance_reference').slice(0, 4).forEach((f) =>
        evidence.push({ id: uid('ev'), type: f.type === 'observation' ? 'field_inspection' : 'regulatory', title: `${doc.fileName} (${f.ref})`, description: f.text, source: doc.fileName, timestamp: batch.createdAt, reliability: 'Unverified', simulated: false }),
      );
    }
    batch.evidence.forEach((m) => evidence.push({ id: uid('ev'), type: 'citizen_media', title: `Attached image: ${m.name}`, description: 'Attached by administrator during import. Image content is not analysed; it does not by itself prove a violation.', source: 'Admin upload', url: m.url, timestamp: m.uploadedAt, reliability: 'Unverified', simulated: false }));
    related.forEach((i) => evidence.push({ id: uid('ev'), type: 'citizen_report', title: `Related complaint ${i.id}`, description: i.complaint.originalText.slice(0, 160), source: 'Citizen portal', timestamp: i.complaint.timestamp, reliability: 'Unverified', simulated: i.isDemo }));

    const supportIds = evidence.map((e) => e.id);
    const possibleSources: SourceHypothesis[] = sig.hypotheses.map((h) => ({
      id: uid('src'),
      source: h.source,
      confidence: h.confidence,
      supportingEvidenceIds: supportIds.slice(0, 4),
      contraryEvidence: [...h.contrary, ...(related.length ? [] : ['No citizen complaint within 5 km in this period'])],
      verificationRequired: ['Site inspection around the monitoring location', 'Identify active sources upwind at spike times', ...h.support.map((s) => `Confirm: ${s}`)],
    }));

    const missing: string[] = [];
    if (!located) missing.push('No coordinates in the data; add them before approval so the incident appears on the map.');
    if (!list.some((r) => r.values.AQI != null)) missing.push('AQI not provided; shown values are computed from PM sub-indices.');
    if (!compliance.some((c) => c.assessment !== 'Insufficient data for assessment')) missing.push('No pollutant has a comparable averaging period for NAAQS screening.');
    missing.push('No wind/meteorological data imported; source direction cannot be assessed.');
    if (!batch.documents.length) missing.push('No inspection report in this import.');

    const confidence = clamp(0.35 + (maxFactor > 1 ? 0.15 : 0) + Math.min(0.15, spikes.length * 0.03) + (related.length ? 0.1 : 0) + (located ? 0.05 : 0) - (fromDocument ? 0.1 : 0), 0.2, 0.85);
    const peakPm25 = Math.max(0, ...daily.map((d) => d.pm25 ?? 0));
    const peakPm10 = Math.max(0, ...daily.map((d) => d.pm10 ?? 0));
    const dailyAqi = daily.map((d) => d.aqiMax ?? 0);
    const slope = dailyAqi.length >= 2 ? (dailyAqi[dailyAqi.length - 1] - dailyAqi[0]) / (dailyAqi.length - 1) : 0;

    const analysis: AIAnalysisOutput = {
      category: sig.category,
      severity,
      urgency,
      confidence: Math.round(confidence * 100) / 100,
      summary: `Preliminary assessment: ${station} shows ${maxFactor > 1 ? `24-h values up to ${maxFactor}× the NAAQS limit` : 'elevated readings'}${spikes.length ? ` and ${spikes.length} short-term spike(s)` : ''} between ${dayOf(sorted[0].timestamp)} and ${dayOf(sorted[sorted.length - 1].timestamp)}. Possible source type: ${sig.category.toLowerCase()} (unverified).`,
      possibleSources,
      supportingEvidence: evidence,
      contradictoryEvidence: [
        ...(related.length ? [] : ['No related citizen complaints found nearby in the observation window.']),
        ...(fromDocument ? ['Readings come from document text, not a monitoring data file.'] : []),
        ...(exceedDays <= 1 && maxFactor > 1 ? ['Exceedance seen on a single day only.'] : []),
      ],
      trendEstimate: {
        direction: slope > 10 ? 'rising' : slope < -10 ? 'falling' : 'stable',
        next72hAqi: dailyAqi.length >= 2 ? [1, 2, 3].map((k) => Math.round(clamp(dailyAqi[dailyAqi.length - 1] + slope * k, 0, 500))) : [],
        method: 'Linear change across the imported daily values',
        disclaimer: 'Estimate only, from a short imported window. Not a forecast.',
      },
      recommendations: [
        `Inspect the area around ${station} focusing on ${sig.hypotheses[0].source.toLowerCase()}.`,
        ...(spikes.length ? [`Check for activity at the spike times (${spikes.slice(0, 2).map((s) => new Date(s.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })).join(', ')}).`] : []),
        'Obtain validated CAAQMS data for the same period before any enforcement step.',
        ...(related.length ? [`Contact reporters of ${related.map((r) => r.id).join(', ')} for corroboration.`] : []),
      ],
      compliance,
      environmentalContext: {
        stationName: station,
        readingTime: sorted[sorted.length - 1].timestamp,
        aqi: aqiMax,
        aqiCategory: aqiCategory(aqiMax).name,
        pm25_24h: peakPm25,
        pm10_24h: peakPm10,
        windDirection: 'n/a',
        windSpeedKmh: 0,
        temperatureC: 0,
        humidityPct: 0,
        simulated: false,
      },
      generatedBy: 'mock-rules',
      generatedAt: now,
      engineNote: 'Preliminary assessment from in-browser rules on imported data. No AI model was used.',
    };

    out.push({
      id: uid('pot'),
      batchId: batch.id,
      createdAt: now,
      status: 'pending',
      title: `${sig.category} suspected near ${station}`,
      station,
      location: { address: station, lat: located?.lat ?? null, lng: located?.lng ?? null },
      periodStart: sorted[0].timestamp,
      periodEnd: sorted[sorted.length - 1].timestamp,
      pollutants: [...new Set(list.flatMap((r) => Object.keys(r.values)))] as MeasureKey[],
      analysis,
      readingIds: list.map((r) => r.id),
      daily,
      spikes,
      missingInformation: missing,
      nextSteps: analysis.recommendations,
      suggestedDepartment: department,
      suggestedOfficerId: officer.id,
      suggestedDeadline: deadline,
      relatedComplaintIds: related.map((r) => r.id),
    });
  }
  return out.sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a.analysis.severity) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.analysis.severity));
}

function c0(p: string) {
  return ({ 'PM2.5': 60, PM10: 100, NO2: 80, SO2: 80 } as Record<string, number>)[p];
}
