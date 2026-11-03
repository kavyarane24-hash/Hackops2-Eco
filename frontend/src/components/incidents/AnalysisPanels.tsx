import { AlertTriangle, BrainCircuit, CheckCircle2, CloudSun, ExternalLink, FileText, Image as ImageIcon, Radar, Satellite, Scale, TrendingDown, TrendingUp, Minus, ClipboardCheck } from 'lucide-react';
import type { AIAnalysisOutput, ComplianceComparison, EvidenceItem, Incident } from '@/types';
import { SeverityBadge, UrgencyBadge, DemoTag } from '@/components/common/Badges';
import { KeyValue, Spinner } from '@/components/common/Panel';
import { useIncidentStore } from '@/context/IncidentStore';
import { fmtDateTime } from '@/utils';
import { aqiCategory } from '@/config/constants';

const EVIDENCE_ICON = {
  citizen_report: FileText,
  citizen_media: ImageIcon,
  sensor: Radar,
  weather: CloudSun,
  satellite: Satellite,
  regulatory: Scale,
  field_inspection: ClipboardCheck,
} as const;

const EVIDENCE_GROUP: Record<EvidenceItem['type'], string> = {
  citizen_report: 'Citizen-provided',
  citizen_media: 'Citizen-provided',
  sensor: 'Sensor data',
  weather: 'Weather data',
  satellite: 'Satellite detection',
  regulatory: 'Regulatory source',
  field_inspection: 'Field inspection',
};

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? '#087f8c' : value >= 0.45 ? '#f5b83d' : '#68777b';
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-300">{label}</span>
        <span className="num text-ink-100">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function AnalysisState({ incident }: { incident: Incident }) {
  const retry = useIncidentStore((s) => s.retryAnalysis);
  if (incident.analysisState === 'pending')
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-950/40 p-4 text-sm text-ink-300">
        <Spinner className="text-accent" /> Intelligence Engine is analysing this complaint…
      </div>
    );
  if (incident.analysisState === 'failed' || !incident.analysis)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-sev-critical/40 bg-sev-critical/10 p-4 text-sm">
        <span>Analysis could not be completed.</span>
        <button className="btn btn-ghost" onClick={() => void retry(incident.id)}>Retry analysis</button>
      </div>
    );
  return null;
}

export function AIAnalysisPanel({ analysis }: { analysis: AIAnalysisOutput }) {
  const evById = new Map(analysis.supportingEvidence.map((e) => [e.id, e]));
  const TrendIcon = analysis.trendEstimate.direction === 'rising' ? TrendingUp : analysis.trendEstimate.direction === 'falling' ? TrendingDown : Minus;
  const ctx = analysis.environmentalContext;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/25 bg-accent-soft p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <BrainCircuit size={16} className="text-accent" aria-hidden />
          <span className="text-sm font-semibold text-ink-100">{analysis.category}</span>
          <SeverityBadge severity={analysis.severity} />
          <UrgencyBadge urgency={analysis.urgency} />
        </div>
        <p className="text-sm text-ink-200">{analysis.summary}</p>
        <div className="mt-3 max-w-xs">
          <ConfidenceBar value={analysis.confidence} label="Classification confidence" />
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          {analysis.generatedBy === 'backend-ai' ? 'Backend AI' : 'Rule engine'} · {fmtDateTime(analysis.generatedAt)}
          {analysis.engineNote && ` · ${analysis.engineNote}`}
        </p>
      </div>

      <section>
        <h3 className="eyebrow mb-2">Environmental context</h3>
        {ctx ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KeyValue k="AQI" v={<span style={{ color: aqiCategory(ctx.aqi).color }}>{ctx.aqi} · {ctx.aqiCategory}</span>} mono />
              <KeyValue k="PM2.5 (day mean)" v={ctx.pm25_24h ? `${ctx.pm25_24h} µg/m³` : '—'} mono />
              <KeyValue k="PM10 (day mean)" v={ctx.pm10_24h ? `${ctx.pm10_24h} µg/m³` : '—'} mono />
            </dl>
            <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
              {ctx.stationName} · recorded {new Date(ctx.readingTime).toLocaleString('en-IN')} {ctx.simulated && <DemoTag label="Simulated" />}
            </p>
          </>
        ) : (
          <p className="muted">No imported monitoring data near this location. Import station data to add context.</p>
        )}
      </section>

      <section>
        <h3 className="eyebrow mb-1">Possible sources (hypotheses)</h3>
        <p className="mb-2 text-[11px] text-ink-500">Confidence is how likely each source is involved, not its share of the pollution. All need on-site verification.</p>
        <ul className="space-y-2">
          {analysis.possibleSources.map((s) => (
            <li key={s.id} className="rounded-lg border border-[var(--line)] bg-ink-950/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-ink-100">Possible: {s.source}</p>
              </div>
              <div className="mt-2 max-w-sm">
                <ConfidenceBar value={s.confidence} label="Confidence" />
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-ink-400">Supporting evidence</p>
                  <ul className="mt-0.5 text-ink-200">
                    {s.supportingEvidenceIds.map((id) => evById.get(id)).filter(Boolean).slice(0, 3).map((e) => (
                      <li key={e!.id} className="truncate" title={e!.title}>· {e!.title}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-ink-400">Contrary evidence</p>
                  <ul className="mt-0.5 text-ink-200">{s.contraryEvidence.length ? s.contraryEvidence.map((c) => <li key={c}>· {c}</li>) : <li className="text-ink-500">None recorded</li>}</ul>
                </div>
                <div>
                  <p className="text-ink-400">To verify</p>
                  <ul className="mt-0.5 text-ink-200">{s.verificationRequired.map((c) => <li key={c}>· {c}</li>)}</ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {analysis.contradictoryEvidence.length > 0 && (
        <section className="rounded-lg border border-sev-medium/30 bg-sev-medium/5 p-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-sev-medium">
            <AlertTriangle size={13} aria-hidden /> Contradictory or missing evidence
          </h3>
          <ul className="space-y-0.5 text-xs text-ink-200">{analysis.contradictoryEvidence.map((c) => <li key={c}>· {c}</li>)}</ul>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-2">Recommendations</h3>
          <ul className="space-y-1.5 text-sm text-ink-200">
            {analysis.recommendations.map((r) => (
              <li key={r} className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-2">Trend estimate</h3>
          <div className="rounded-lg border border-dashed border-[var(--line-strong)] p-3">
            <p className="flex items-center gap-2 text-sm text-ink-100">
              <TrendIcon size={16} aria-hidden /> AQI {analysis.trendEstimate.direction}
            </p>
            {analysis.trendEstimate.next72hAqi.length > 0 && (
              <p className="num mt-1 text-xs text-ink-300">Next 3 days ≈ {analysis.trendEstimate.next72hAqi.join(' → ')}</p>
            )}
            <p className="mt-1 text-[11px] text-ink-500">{analysis.trendEstimate.method}. {analysis.trendEstimate.disclaimer}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  return (
    <ul className="space-y-2">
      {evidence.map((e) => {
        const Icon = EVIDENCE_ICON[e.type];
        return (
          <li key={e.id} className="flex gap-3 rounded-lg border border-[var(--line)] bg-ink-950/40 p-3">
            <div className="mt-0.5 rounded-md border border-[var(--line-strong)] p-1.5 text-ink-300">
              <Icon size={14} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow !text-[0.6rem]">{EVIDENCE_GROUP[e.type]}</span>
                {e.reliability && <span className="chip !text-[10px]">Reliability · {e.reliability}</span>}
                {e.simulated && <DemoTag label="Simulated" />}
              </div>
              <p className="mt-1 text-sm text-ink-100">{e.title}</p>
              <p className="text-xs text-ink-400">{e.description}</p>
              <p className="mt-1 text-[11px] text-ink-500">
                {e.source} · {fmtDateTime(e.timestamp)}
              </p>
              {e.type === 'citizen_media' && e.url?.startsWith('data:image') && <img src={e.url} alt={e.title} className="mt-2 max-h-32 rounded-md" loading="lazy" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ComplianceTable({ rows }: { rows: ComplianceComparison[] }) {
  if (!rows.length) return <p className="text-sm text-ink-400">No compliance comparison applies to this incident.</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-ink-850 text-xs text-ink-400">
            <tr>
              {['Pollutant', 'Observed', 'Limit', 'Averaging period', 'Standard', 'Result'].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = r.assessment === 'Within selected reference limit' ? '#157a4b' : r.assessment === 'Insufficient data for assessment' ? '#68777b' : r.assessment === 'Above selected reference limit' ? '#b42318' : '#8a5a00';
              return (
                <tr key={`${r.pollutant}-${r.averagingPeriod}`} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 font-bold">{r.pollutant}</td>
                  <td className="num px-3 py-2">{r.observedValue} {r.unit}<span className="muted block">{r.observedAveragingPeriod}</span></td>
                  <td className="num px-3 py-2">{Number.isFinite(r.standardLimit) ? `${r.standardLimit} ${r.unit}` : '—'}</td>
                  <td className="px-3 py-2 text-ink-300">{r.averagingPeriod}</td>
                  <td className="px-3 py-2 text-xs text-ink-300">{r.standardName}</td>
                  <td className="px-3 py-2">
                    <span className="chip !whitespace-normal" style={{ color: tone, borderColor: `${tone}66` }}>
                      {r.assessment}{r.exceedanceFactor != null && r.exceeded ? ` · ${r.exceedanceFactor}×` : ''}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-400">{[...new Set(rows.map((r) => r.note))].map((n) => <li key={n}>{n}</li>)}</ul>
      <a href={rows[0].referenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
        {rows[0].reference} <ExternalLink size={11} aria-hidden />
      </a>
    </div>
  );
}
