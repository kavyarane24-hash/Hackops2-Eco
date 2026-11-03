// CPCB/NAAQS comparison logic shared by citizen-incident analysis, imported-data
// analysis and reports. A comparison is only made when the observed averaging
// period and unit match the standard; otherwise it is reported as
// "Insufficient data for assessment". Nothing here is a statutory finding.
import type { ComplianceAssessment, ComplianceComparison, Pollutant } from '@/types';
import { NAAQS } from '@/config/constants';

export const STANDARD_NAME = 'NAAQS 2009 (Industrial, Residential, Rural & Other Areas)';

export function normaliseUnit(u?: string) {
  const x = (u ?? '').toLowerCase().replace(/\s/g, '').replace('μ', 'µ').replace('ug', 'µg').replace('m3', 'm³');
  if (x.startsWith('µg/m')) return 'µg/m³';
  if (x.startsWith('mg/m')) return 'mg/m³';
  return u?.trim() || '';
}

export function normalisePeriod(p?: string) {
  const x = (p ?? '').toLowerCase();
  if (/24\s*-?\s*h|daily|24 hour/.test(x)) return '24 hours';
  if (/\b8\s*-?\s*h/.test(x)) return '8 hours';
  if (/\b1\s*-?\s*h|hourly|1 hour/.test(x)) return '1 hour';
  if (/annual|yearly/.test(x)) return 'Annual';
  return 'unknown';
}

interface CompareInput {
  pollutant: Pollutant;
  observed: number;
  unit: string;
  averagingPeriod: string;
  /** Measurements are simulated, single-source or not from validated CAAQMS data. */
  needsVerification: boolean;
  limitations: string[];
}

/** Picks the NAAQS row matching the observed period (and unit), if any. */
export function compare({ pollutant, observed, unit, averagingPeriod, needsVerification, limitations }: CompareInput): ComplianceComparison {
  const period = normalisePeriod(averagingPeriod);
  const u = normaliseUnit(unit);
  const candidates = NAAQS.limits.filter((l) => l.pollutant === pollutant);
  const std = candidates.find((l) => l.period === period) ?? candidates.find((l) => l.period === '24 hours') ?? candidates[0];
  const comparable = !!std && std.period === period && std.unit === u;
  let assessment: ComplianceAssessment;
  if (!comparable) assessment = 'Insufficient data for assessment';
  else if (observed <= std.limit) assessment = 'Within selected reference limit';
  else assessment = needsVerification ? 'Potential exceedance requiring verification' : 'Above selected reference limit';

  const notes = [...limitations];
  if (!comparable) {
    notes.unshift(
      period === 'unknown'
        ? 'Averaging period of the observation is not stated, so it cannot be compared with a NAAQS limit.'
        : std && std.unit !== u
          ? `Observed unit (${u || 'not stated'}) does not match the standard unit (${std.unit}).`
          : `No NAAQS limit for a ${period} averaging period; limits exist for ${candidates.map((c) => c.period).join(', ')}.`,
    );
  }
  notes.push('AQI alone does not establish a statutory violation. Findings need verification by the competent authority.');

  return {
    pollutant,
    observedValue: Math.round(observed * 100) / 100,
    observedAveragingPeriod: period,
    standardLimit: std?.limit ?? NaN,
    unit: std?.unit ?? u,
    averagingPeriod: std?.period ?? '—',
    standardName: STANDARD_NAME,
    reference: NAAQS.reference,
    referenceUrl: NAAQS.url,
    exceeded: comparable && observed > (std?.limit ?? Infinity),
    exceedanceFactor: comparable && std ? Math.round((observed / std.limit) * 100) / 100 : undefined,
    assessment,
    note: notes.join(' '),
  };
}
