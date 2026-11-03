import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AirQualityPoint } from '@/types';
import { AQI_BANDS, NAAQS } from '@/config/constants';
import { DemoTag } from '@/components/common/Badges';
import { cn } from '@/lib/utils';

export type Metric = 'aqi' | 'pm25' | 'pm10';
export const RANGES = [7, 14, 30] as const;

const META: Record<Metric, { label: string; unit: string; color: string; period: string }> = {
  aqi: { label: 'AQI', unit: 'index', color: '#376E6F', period: 'Daily AQI (24-h basis)' }, // Muted Teal
  pm25: { label: 'PM2.5', unit: 'µg/m³', color: '#DA7B93', period: '24-h average' }, // Dusty Rose
  pm10: { label: 'PM10', unit: 'µg/m³', color: '#2F4454', period: '24-h average' }, // Slate Blue
};

interface Props {
  series: AirQualityPoint[];
  projection?: AirQualityPoint[];
  comparison?: { name: string; series: AirQualityPoint[] };
  stationName: string;
  defaultMetric?: Metric;
  height?: number;
  simulated?: boolean;
}

/**
 * Daily air-quality area chart. Reference bands are pollutant-specific:
 * - AQI: CPCB AQI category bands.
 * - PM2.5 / PM10: NAAQS 24-hour limit, compared only with 24-hour averages.
 */
export function AirQualityChart({ series, projection = [], comparison, stationName, defaultMetric = 'aqi', height = 280, simulated = false }: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [showCompare, setShowCompare] = useState(false);
  const m = META[metric];

  const data = useMemo(() => {
    const hist = series.slice(-range);
    const cmp = comparison?.series.slice(-range) ?? [];
    type Row = { label: string; value?: number; compare?: number; projected?: number };
    const rows: Row[] = hist.map((p, idx) => ({ label: p.label, value: p[metric], compare: cmp[idx]?.[metric] }));
    if (projection.length && rows.length) {
      // Join the dashed estimate line to the last observed point.
      rows[rows.length - 1].projected = rows[rows.length - 1].value;
      for (const p of projection) rows.push({ label: p.label, projected: p[metric] });
    }
    return rows;
  }, [series, projection, comparison, range, metric]);

  const limit = metric === 'pm25' ? NAAQS.limits[0].limit : metric === 'pm10' ? NAAQS.limits[2].limit : null;
  const maxY = Math.max(...data.map((d) => Math.max(d.value ?? 0, d.projected ?? 0, d.compare ?? 0)), limit ?? 0);

  const latest = series[series.length - 1];
  const recent = series.slice(-range).map((p) => p[metric]).filter((v): v is number => v != null);
  const avg = recent.length ? Math.round(recent.reduce((a, v) => a + v, 0) / recent.length) : '—';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Metric" className="flex rounded-lg border border-[var(--line)] bg-surface-sunken p-0.5">
          {(Object.keys(META) as Metric[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={metric === k}
              onClick={() => setMetric(k)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                metric === k ? 'bg-muted-teal text-white shadow-xs' : 'text-ink-200 hover:text-ink-100',
              )}
            >
              {META[k].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {comparison && (
            <label className="flex items-center gap-1.5 text-xs text-ink-200 font-medium">
              <input type="checkbox" checked={showCompare} onChange={(e) => setShowCompare(e.target.checked)} className="accent-[#376E6F]" />
              Compare {comparison.name}
            </label>
          )}
          <div role="group" aria-label="Time range" className="flex rounded-lg border border-[var(--line)] bg-surface-sunken p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  'num rounded-md px-2.5 py-1 text-xs transition-all font-semibold',
                  range === r ? 'bg-slate-blue text-white shadow-xs' : 'text-ink-400 hover:text-ink-100',
                )}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <p>
          <span className="num text-2xl font-bold" style={{ color: m.color }}>{latest?.[metric] ?? '—'}</span>
          <span className="ml-1 text-xs text-ink-400">{m.unit} · latest {m.period}</span>
        </p>
        <p className="text-xs text-ink-300 font-medium">
          {range}-day mean <span className="num font-bold text-ink-100">{avg}</span>
        </p>
        {simulated && <DemoTag label="Simulated readings" />}
      </div>

      <div style={{ height }} role="img" aria-label={`${m.label} ${m.period} for ${stationName}, last ${range} days. Latest ${latest?.[metric]} ${m.unit}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={m.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#2F445415" vertical={false} />
            {metric === 'aqi' &&
              AQI_BANDS.filter((b) => b.min <= maxY + 20).map((b) => (
                <ReferenceArea key={b.name} y1={b.min} y2={Math.min(b.max, Math.ceil(maxY / 50) * 50 + 50)} fill={b.color} fillOpacity={0.05} stroke="none" ifOverflow="hidden" />
              ))}
            {limit && (
              <>
                <ReferenceArea y1={limit} y2={Math.max(limit * 1.0001, Math.ceil(maxY / 50) * 50 + 20)} fill="#b42318" fillOpacity={0.06} stroke="#b42318" strokeOpacity={0.35} strokeDasharray="4 4" ifOverflow="hidden" />
                <ReferenceLine
                  y={limit}
                  stroke="#b42318"
                  strokeDasharray="5 4"
                  label={{ value: `NAAQS 24-h limit ${limit} µg/m³`, position: 'insideTopLeft', fill: '#b42318', fontSize: 11, fontWeight: 700 }}
                />
              </>
            )}
            <XAxis dataKey="label" tick={{ fill: '#2F4454', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#2F445422' }} minTickGap={18} />
            <YAxis
              tick={{ fill: '#2F4454', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              label={{ value: m.unit, angle: -90, position: 'insideLeft', fill: '#2F4454', fontSize: 11, dx: 10 }}
            />
            <Tooltip
              contentStyle={{ background: '#1C3334', border: '1px solid rgba(47, 68, 84, 0.2)', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 14px rgba(28, 51, 52, 0.12)' }}
              labelStyle={{ color: '#f6eef1', fontWeight: 700 }}
              formatter={(v, name) => [`${v} ${m.unit}`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#2F4454' }} />
            {showCompare && comparison && (
              <Area type="monotone" dataKey="compare" name={comparison.name} stroke="#435e72" strokeWidth={1.5} strokeDasharray="3 3" fill="none" dot={false} />
            )}
            <Area type="monotone" dataKey="value" name={`${m.label} · ${stationName}`} stroke={m.color} strokeWidth={2} fill={`url(#fill-${metric})`} fillOpacity={0.3} dot={false} activeDot={{ r: 4 }} />
            {projection.length > 0 && (
              <Area type="monotone" dataKey="projected" name="Trend estimate (not a forecast)" stroke={m.color} strokeDasharray="6 4" strokeWidth={2} fill="none" dot={{ r: 2 }} connectNulls />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {metric === 'aqi'
          ? 'Shaded bands: CPCB National AQI categories. AQI is an index; it does not by itself establish a statutory violation.'
          : `Limit line: ${NAAQS.reference}. Compared against 24-hour averages only.`}
      </p>
    </div>
  );
}
