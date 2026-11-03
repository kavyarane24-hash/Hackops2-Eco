// Simulated air-quality data. Every value here is DEMO DATA, generated
// deterministically so charts are stable. Replace with a real feed (e.g. CPCB
// CAAQMS via the backend) when available.
import type { AirQualityPoint } from '@/types';
import { clamp, hashString, seeded } from '@/utils';

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

/** 30 days of simulated daily 24-h averages for a named station. */
export function stationSeries(station: string, days = 30, intensity = 1): AirQualityPoint[] {
  const rnd = seeded(hashString(station));
  const out: AirQualityPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let pm25 = 95 * intensity;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Slow upward drift (post-monsoon season pattern) plus day-to-day noise.
    const drift = ((days - i) / days) * 40 * intensity;
    pm25 = clamp(pm25 * 0.55 + (80 * intensity + drift) * 0.45 + (rnd() - 0.45) * 38, 25, 420);
    const pm10 = clamp(pm25 * (1.55 + rnd() * 0.35), 40, 600);
    const aqi = Math.max(pm25SubIndex(pm25), pm10SubIndex(pm10));
    out.push({
      date: dayKey(d),
      label: dayLabel(d),
      aqi,
      pm25: Math.round(pm25),
      pm10: Math.round(pm10),
    });
  }
  return out;
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

/** Named demo monitoring stations (simulated). */
export const DEMO_STATIONS = [
  { id: 'north', name: 'Demo Station – North Zone', lat: 28.78, lng: 77.08, intensity: 1.25 },
  { id: 'central', name: 'Demo Station – Central Zone', lat: 28.65, lng: 77.2, intensity: 1.0 },
  { id: 'east', name: 'Demo Station – East Zone', lat: 28.62, lng: 77.31, intensity: 1.1 },
  { id: 'south', name: 'Demo Station – South Zone', lat: 28.52, lng: 77.2, intensity: 0.85 },
] as const;

export function nearestStation(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return DEMO_STATIONS[1];
  return DEMO_STATIONS.reduce((best, s) =>
    (s.lat - lat) ** 2 + (s.lng - lng) ** 2 < (best.lat - lat) ** 2 + (best.lng - lng) ** 2 ? s : best,
  );
}
