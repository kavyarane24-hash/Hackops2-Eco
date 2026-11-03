// Air-quality helpers over real imported readings: CPCB sub-indices, daily
// series and a naive trend projection. No values are generated here.
import type { AirQualityPoint, EnvironmentalReading } from '@/types';
import { clamp } from '@/utils';

/**
 * Approximate CPCB sub-index for PM2.5 (24-h, µg/m³) using the published
 * breakpoints. Used to keep simulated AQI consistent with simulated PM values.
 */
export function pm25SubIndex(c: number) {
  const bp: [number, number, number, number][] = [
    [0, 30, 0, 50],
    [31, 60, 51, 100],
    [61, 90, 101, 200],
    [91, 120, 201, 300],
    [121, 250, 301, 400],
    [251, 500, 401, 500],
  ];
  const row = bp.find(([, hi]) => c <= hi) ?? bp[bp.length - 1];
  const [lo, hi, ilo, ihi] = row;
  return Math.round(((ihi - ilo) / (hi - lo)) * (clamp(c, lo, hi) - lo) + ilo);
}

export function pm10SubIndex(c: number) {
  const bp: [number, number, number, number][] = [
    [0, 50, 0, 50],
    [51, 100, 51, 100],
    [101, 250, 101, 200],
    [251, 350, 201, 300],
    [351, 430, 301, 400],
    [431, 600, 401, 500],
  ];
  const row = bp.find(([, hi]) => c <= hi) ?? bp[bp.length - 1];
  const [lo, hi, ilo, ihi] = row;
  return Math.round(((ihi - ilo) / (hi - lo)) * (clamp(c, lo, hi) - lo) + ilo);
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
/** Local-calendar YYYY-MM-DD (toISOString would shift to UTC and repeat days in IST). */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Daily series from real imported readings for one station: mean of the
 * day's values per pollutant. Days without readings are simply absent.
 */
export function dailySeriesFromReadings(readings: EnvironmentalReading[]): AirQualityPoint[] {
  const byDay = new Map<string, EnvironmentalReading[]>();
  for (const r of readings) {
    const d = new Date(r.timestamp);
    const key = dayKey(d);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => {
    const mean = (k: 'PM2.5' | 'PM10' | 'AQI') => {
      const v = rs.map((r) => r.values[k]).filter((x): x is number => x != null);
      return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : undefined;
    };
    const pm25 = mean('PM2.5'), pm10 = mean('PM10'), aqiGiven = mean('AQI');
    const aqi = aqiGiven ?? (pm25 != null || pm10 != null ? Math.max(pm25 != null ? pm25SubIndex(pm25) : 0, pm10 != null ? pm10SubIndex(pm10) : 0) : undefined);
    const [y, m, d] = key.split('-').map(Number);
    return { date: key, label: dayLabel(new Date(y, m - 1, d)), aqi, pm25, pm10 } as unknown as AirQualityPoint;
  });
}

/** Least-squares slope over the last n points. */
function slope(values: number[]) {
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Simple linear projection of the next `ahead` days from the last 7 days.
 * This is a naive trend estimate, not a forecast model.
 */
export function projectSeries(series: AirQualityPoint[], ahead = 3): AirQualityPoint[] {
  const recent = series.slice(-7);
  if (recent.length < 3) return [];
  const last = recent[recent.length - 1];
  const sAqi = slope(recent.map((p) => p.aqi));
  const sPm25 = slope(recent.map((p) => p.pm25));
  const sPm10 = slope(recent.map((p) => p.pm10));
  const out: AirQualityPoint[] = [];
  for (let k = 1; k <= ahead; k++) {
    const [y, m, day] = last.date.split('-').map(Number);
    const d = new Date(y, m - 1, day + k);
    out.push({
      date: dayKey(d),
      label: dayLabel(d),
      aqi: Math.round(clamp(last.aqi + sAqi * k, 0, 500)),
      pm25: Math.round(clamp(last.pm25 + sPm25 * k, 0, 600)),
      pm10: Math.round(clamp(last.pm10 + sPm10 * k, 0, 800)),
      projected: true,
    });
  }
  return out;
}

export function trendDirection(series: AirQualityPoint[]): 'rising' | 'falling' | 'stable' {
  const s = slope(series.slice(-7).map((p) => p.aqi));
  if (s > 4) return 'rising';
  if (s < -4) return 'falling';
  return 'stable';
}
