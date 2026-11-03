// Field mapping, value normalisation and validation for tabular imports.
import type { DataValidationResult, DocumentFinding, EnvironmentalReading, ExtractedTable, FieldKey, MeasureKey, ValidationIssue } from '@/types';
import { normalisePeriod, normaliseUnit } from '@/services/compliance';
import { uid } from '@/utils';

export const FIELD_LABEL: Record<FieldKey, string> = {
  ignore: '— Ignore column —',
  station: 'Station / location name',
  timestamp: 'Timestamp (date + time)',
  date: 'Date only',
  time: 'Time only',
  lat: 'Latitude',
  lng: 'Longitude',
  aqi: 'AQI',
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO2',
  so2: 'SO2',
  co: 'CO',
  o3: 'O3',
  unit: 'Unit (whole row)',
  averaging: 'Averaging period',
  organisation: 'Source organisation',
  recordId: 'Original record ID',
};

const MEASURE: Partial<Record<FieldKey, MeasureKey>> = { aqi: 'AQI', pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2', so2: 'SO2', co: 'CO', o3: 'O3' };

const SYNONYMS: [FieldKey, RegExp][] = [
  ['pm25', /^pm[\s_.-]*2[\s_.-]*\.?[\s_.-]*5|pm25|fine particulate/],
  ['pm10', /^pm[\s_.-]*10|coarse particulate/],
  ['no2', /^no[\s_-]*2|nitrogen dioxide/],
  ['so2', /^so[\s_-]*2|sulph?ur dioxide/],
  ['o3', /^o[\s_-]*3$|^o3[\s_(]|ozone/],
  ['co', /^co$|^co[\s_(]|carbon monoxide/],
  ['aqi', /\baqi\b|air quality index/],
  ['lat', /^lat(itude)?$/],
  ['lng', /^(lng|lon|long|longitude)$/],
  ['timestamp', /date[\s_-]*time|timestamp|datetime|^time[\s_-]*stamp|from date|sampling time/],
  ['date', /^date$|^day$|sampling date/],
  ['time', /^time$|^hour$/],
  ['station', /station|site|location|monitor|city|area|place/],
  ['unit', /^units?$/],
  ['averaging', /averag|period|duration/],
  ['organisation', /source|org|agency|provider/],
  ['recordId', /^id$|record[\s_-]*id|sample[\s_-]*id|^ref/],
];

export function autoMap(columns: string[]): Record<string, FieldKey> {
  const used = new Set<FieldKey>();
  const map: Record<string, FieldKey> = {};
  for (const c of columns) {
    const n = c.toLowerCase().trim();
    const hit = SYNONYMS.find(([k, re]) => re.test(n) && (!used.has(k) || k === 'ignore'));
    map[c] = hit ? hit[0] : 'ignore';
    if (hit) used.add(hit[0]);
  }
  return map;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Parses common timestamp formats. Slash/dot/dash dates are read as DD/MM/YYYY
 * (Indian convention) unless the second part is > 12. Returns the transformation
 * applied so it can be recorded on the reading.
 */
export function parseTimestamp(raw: string): { iso: string; note?: string } | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const ms = Math.round((Number(s) - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : { iso: new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString(), note: 'Excel serial date converted' };
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return build(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (m) {
    let a = +m[1], b = +m[2];
    let note = 'Read as DD/MM/YYYY';
    if (b > 12 && a <= 12) {
      [a, b] = [b, a];
      note = 'Read as MM/DD/YYYY (day > 12 in second position)';
    }
    let year = +m[3];
    if (year < 100) year += 2000;
    let hour = +(m[4] ?? 0);
    if (m[7]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (m[7]?.toLowerCase() === 'am' && hour === 12) hour = 0;
    const r = build(year, b - 1, a, hour, +(m[5] ?? 0), +(m[6] ?? 0));
    return r ? { ...r, note } : null;
  }
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*,?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/i);
  if (m && MONTHS[m[2].toLowerCase()] != null) return build(+m[3], MONTHS[m[2].toLowerCase()], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), 0);
  return null;

  function build(y: number, mo: number, d: number, h: number, mi: number, se: number) {
    if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
    const dt = new Date(y, mo, d, h, mi, se);
    if (dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { iso: dt.toISOString() };
  }
}

function num(raw: string | undefined): { value?: number; issue?: string } {
  const s = (raw ?? '').trim();
  if (!s || /^(na|n\/a|nan|null|-|—|none)$/i.test(s)) return { issue: s ? 'non-numeric placeholder' : 'missing' };
  const v = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(v)) return { issue: `invalid number "${s}"` };
  return { value: v };
}

/** Unit from a header like "PM2.5 (µg/m3)" or "co_mgm3". */
function unitFromHeader(h: string): string | undefined {
  const x = h.toLowerCase();
  if (/(µg|ug|μg)[/_]?m/.test(x)) return 'µg/m³';
  if (/mg[/_]?m/.test(x)) return 'mg/m³';
  return undefined;
}

const DEFAULT_UNIT: Record<MeasureKey, string> = { AQI: 'index', 'PM2.5': 'µg/m³', PM10: 'µg/m³', NO2: 'µg/m³', SO2: 'µg/m³', O3: 'µg/m³', CO: 'mg/m³' };
const MAX_PLAUSIBLE: Record<MeasureKey, number> = { AQI: 500, 'PM2.5': 1500, PM10: 2500, NO2: 1000, SO2: 1000, O3: 1000, CO: 50 };

export interface NormaliseResult {
  readings: EnvironmentalReading[];
  validation: DataValidationResult;
}

/**
 * Converts mapped table rows into EnvironmentalReadings and validates them.
 * Invalid rows are excluded from readings but reported in validation.
 */
export function normaliseTable(
  table: ExtractedTable,
  mapping: Record<string, FieldKey>,
  ctx: { batchId: string; fileName: string; uploadedAt: string; organisation?: string },
): NormaliseResult {
  const cols = (k: FieldKey) => Object.entries(mapping).filter(([, v]) => v === k).map(([c]) => c);
  const col = (k: FieldKey) => cols(k)[0];
  const measures = (Object.keys(MEASURE) as FieldKey[]).filter((k) => col(k));
  const issues: ValidationIssue[] = [];
  const missingByField: Record<string, number> = {};
  const readings: EnvironmentalReading[] = [];
  const seen = new Set<string>();
  let invalid = 0, warn = 0, dup = 0;

  if (!measures.length) issues.push({ ref: table.sheet, level: 'error', message: 'No pollutant or AQI column is mapped. Map at least one measurement column.' });
  if (!col('timestamp') && !col('date')) issues.push({ ref: table.sheet, level: 'error', message: 'No timestamp or date column is mapped.' });

  for (const rec of table.records) {
    const rowIssues: ValidationIssue[] = [];
    const transformations: string[] = [];
    const tsRaw = col('timestamp') ? rec.raw[col('timestamp')] : [rec.raw[col('date')] ?? '', col('time') ? rec.raw[col('time')] : ''].join(' ').trim();
    const ts = parseTimestamp(tsRaw ?? '');
    if (!ts) {
      rowIssues.push({ ref: rec.ref, field: 'timestamp', level: 'error', message: tsRaw ? `Invalid timestamp "${tsRaw}"` : 'Missing timestamp' });
      missingByField.timestamp = (missingByField.timestamp ?? 0) + (tsRaw ? 0 : 1);
    } else if (ts.note) transformations.push(ts.note);

    const station = (col('station') && rec.raw[col('station')]) || table.sheet;
    if (!col('station') || !rec.raw[col('station')]) {
      missingByField.station = (missingByField.station ?? 0) + 1;
      transformations.push(`Station not given; using "${station}"`);
    }
    const lat = col('lat') ? num(rec.raw[col('lat')]).value ?? null : null;
    const lng = col('lng') ? num(rec.raw[col('lng')]).value ?? null : null;
    if (lat != null && (Math.abs(lat) > 90 || lng == null || Math.abs(lng) > 180)) rowIssues.push({ ref: rec.ref, field: 'coordinates', level: 'warning', message: 'Coordinates out of range; ignored' });

    const values: EnvironmentalReading['values'] = {};
    const units: EnvironmentalReading['units'] = {};
    const rowUnit = col('unit') ? normaliseUnit(rec.raw[col('unit')]) : undefined;
    for (const fk of measures) {
      const key = MEASURE[fk]!;
      const header = col(fk);
      const { value, issue } = num(rec.raw[header]);
      if (value == null) {
        missingByField[key] = (missingByField[key] ?? 0) + 1;
        if (issue && issue !== 'missing') rowIssues.push({ ref: rec.ref, field: key, level: 'warning', message: `${key}: ${issue}` });
        continue;
      }
      if (value < 0) {
        rowIssues.push({ ref: rec.ref, field: key, level: 'warning', message: `${key}: negative value ${value} discarded` });
        continue;
      }
      if (value > MAX_PLAUSIBLE[key]) rowIssues.push({ ref: rec.ref, field: key, level: 'warning', message: `${key}: ${value} is implausibly high; check units` });
      values[key] = value;
      units[key] = key === 'AQI' ? 'index' : unitFromHeader(header) ?? (rowUnit || DEFAULT_UNIT[key]);
      if (!unitFromHeader(header) && !rowUnit && key !== 'AQI') transformations.push(`${key} unit assumed ${DEFAULT_UNIT[key]}`);
    }
    if (!Object.keys(values).length && measures.length) rowIssues.push({ ref: rec.ref, level: 'error', message: 'No valid measurement in this row' });

    const errors = rowIssues.filter((i) => i.level === 'error');
    issues.push(...rowIssues);
    if (errors.length) {
      invalid++;
      continue;
    }
    const key = `${station}|${ts!.iso}`;
    if (seen.has(key)) {
      dup++;
      issues.push({ ref: rec.ref, level: 'warning', message: `Duplicate of an earlier row for ${station} at ${tsRaw}; skipped` });
      continue;
    }
    seen.add(key);
    if (rowIssues.length) warn++;
    readings.push({
      id: uid('rd'),
      batchId: ctx.batchId,
      fileName: ctx.fileName,
      uploadedAt: ctx.uploadedAt,
      ref: table.sheet === 'CSV' || table.sheet === 'JSON' ? rec.ref : rec.ref,
      originalRecordId: col('recordId') ? rec.raw[col('recordId')] || undefined : undefined,
      sourceOrganisation: (col('organisation') && rec.raw[col('organisation')]) || ctx.organisation,
      station,
      lat: lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? lat : null,
      lng: lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? lng : null,
      timestamp: ts!.iso,
      values,
      units,
      averagingPeriod: col('averaging') ? normalisePeriod(rec.raw[col('averaging')]) : 'unknown',
      extractionStatus: rowIssues.length ? 'warning' : 'valid',
      transformations,
      origin: 'imported',
    });
  }

  // Infer averaging period from timestamp spacing per station when not given.
  const byStation = new Map<string, EnvironmentalReading[]>();
  readings.forEach((r) => byStation.set(r.station, [...(byStation.get(r.station) ?? []), r]));
  for (const list of byStation.values()) {
    if (list.every((r) => r.averagingPeriod !== 'unknown')) continue;
    const headerHint = Object.keys(mapping).join(' ').toLowerCase();
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const gaps = sorted.slice(1).map((r, i) => (new Date(r.timestamp).getTime() - new Date(sorted[i].timestamp).getTime()) / 3600000).filter((g) => g > 0);
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
    const inferred = /24\s*-?h|daily/.test(headerHint) ? '24 hours' : median >= 0.9 && median <= 1.1 ? '1 hour' : median >= 23 && median <= 25 ? '24 hours' : 'unknown';
    for (const r of list) {
      if (r.averagingPeriod === 'unknown') {
        r.averagingPeriod = inferred;
        if (inferred !== 'unknown') r.transformations.push(`Averaging period inferred as ${inferred} from timestamp spacing`);
      }
    }
  }

  const total = table.records.length;
  const mappedShare = measures.length ? Math.min(1, (measures.length + (col('timestamp') || col('date') ? 1 : 0) + (col('station') ? 1 : 0)) / 4) : 0;
  const validShare = total ? readings.length / total : 0;
  return {
    readings,
    validation: {
      totalRecords: total,
      validRecords: readings.length - warn,
      warningRecords: warn,
      invalidRecords: invalid,
      duplicateRecords: dup,
      missingByField,
      issues,
      confidence: Math.round((0.5 * mappedShare + 0.5 * validShare) * 100) / 100,
    },
  };
}

/** Readings stated in document text (page/section referenced). */
export function readingsFromFindings(findings: DocumentFinding[], ctx: { batchId: string; fileName: string; uploadedAt: string; station: string; timestamp: string }): EnvironmentalReading[] {
  return findings
    .filter((f) => f.type === 'reading' && f.pollutant && f.value != null)
    .map((f) => ({
      id: uid('rd'),
      batchId: ctx.batchId,
      fileName: ctx.fileName,
      uploadedAt: ctx.uploadedAt,
      ref: f.ref,
      station: ctx.station,
      lat: null,
      lng: null,
      timestamp: ctx.timestamp,
      values: { [f.pollutant!]: f.value },
      units: { [f.pollutant!]: f.pollutant === 'AQI' ? 'index' : normaliseUnit(f.unit) || DEFAULT_UNIT[f.pollutant!] },
      averagingPeriod: f.averagingPeriod ?? 'unknown',
      extractionStatus: 'warning' as const,
      transformations: ['Extracted from document text by pattern matching', ...(f.unit ? [] : [`Unit not stated; assumed ${DEFAULT_UNIT[f.pollutant!]}`])],
      origin: 'imported' as const,
    }));
}

export function mergeValidation(results: DataValidationResult[]): DataValidationResult {
  const m: DataValidationResult = { totalRecords: 0, validRecords: 0, warningRecords: 0, invalidRecords: 0, duplicateRecords: 0, missingByField: {}, issues: [], confidence: 0 };
  for (const r of results) {
    m.totalRecords += r.totalRecords;
    m.validRecords += r.validRecords;
    m.warningRecords += r.warningRecords;
    m.invalidRecords += r.invalidRecords;
    m.duplicateRecords += r.duplicateRecords;
    m.issues.push(...r.issues);
    for (const [k, v] of Object.entries(r.missingByField)) m.missingByField[k] = (m.missingByField[k] ?? 0) + v;
  }
  m.confidence = results.length ? Math.round((results.reduce((a, r) => a + r.confidence, 0) / results.length) * 100) / 100 : 0;
  return m;
}
