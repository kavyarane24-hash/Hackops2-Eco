import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Incident } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { EmptyState } from '@/components/common/Panel';
import { buildEvents, dayLabel, EVENT_META, groupByDay, readingDays, type EventType, type TimelineEvent } from '@/services/timeline';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** Horizontal navigator over recorded days only. */
function DayNavigator({ days, value, onChange }: { days: { day: string; count: number }[]; value: string; onChange: (d: string) => void }) {
  const idx = days.findIndex((d) => d.day === value);
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-quiet !min-h-8 !px-2" disabled={idx >= days.length - 1} onClick={() => onChange(days[idx + 1].day)} aria-label="Earlier recorded day">
        <ChevronLeft size={16} />
      </button>
      <div role="listbox" aria-label="Recorded days" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
        {[...days].reverse().map((d) => (
          <button
            key={d.day}
            role="option"
            aria-selected={d.day === value}
            onClick={() => onChange(d.day)}
            className={cn('shrink-0 rounded-md px-3 py-1.5 text-left transition-colors', d.day === value ? 'bg-accent-soft text-ink-100 shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-ink-300 hover:bg-ink-800')}
          >
            <span className="block text-[13px] [font-family:var(--font-nav)]">{dayLabel(d.day, { day: '2-digit', month: 'short' })}</span>
            <span className="muted block !text-[11px]">{d.count} record{d.count === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-quiet !min-h-8 !px-2" disabled={idx <= 0} onClick={() => onChange(days[idx - 1].day)} aria-label="Later recorded day">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function EventRow({ e, showIncident = true }: { e: TimelineEvent; showIncident?: boolean }) {
  const { open } = useIncidentParam();
  const meta = EVENT_META[e.type];
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} aria-hidden />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <time className="num text-[12.5px] text-ink-300" dateTime={e.timestamp} title={new Date(e.timestamp).toString()}>{time(e.timestamp)}</time>
        <span className="text-[13px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
        {showIncident && e.incidentId && (
          <button className="num text-[12.5px] text-accent hover:underline" onClick={() => open(e.incidentId!)}>{e.incidentId}</button>
        )}
      </div>
      <p className="text-[13.5px] text-ink-200">{e.description}</p>
      {(e.location || e.status) && (
        <p className="muted">{[e.location, e.status && `now: ${e.status}`].filter(Boolean).join(' · ')}</p>
      )}
    </li>
  );
}

/** Admin-level timeline of everything recorded, plus monitoring readings by day. */
export function RecordedTimeline() {
  const incidents = useIncidentStore((s) => s.incidents);
  const imports = useIncidentStore((s) => s.imports);
  const [view, setView] = useState<'activity' | 'readings'>('activity');
  const [type, setType] = useState<EventType | ''>('');
  const [incidentId, setIncidentId] = useState('');
  const all = useMemo(() => buildEvents(incidents, imports), [incidents, imports]);
  const filtered = all.filter((e) => (!type || e.type === type) && (!incidentId || e.incidentId === incidentId));
  const groups = groupByDay(filtered);
  const [day, setDay] = useState('');
  const current = groups.find((g) => g.day === day) ?? groups[0];
  const rDays = useMemo(() => readingDays(imports), [imports]);
  const [rDay, setRDay] = useState('');
  const rCurrent = rDays.find((d) => d.day === rDay) ?? rDays[0];
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => setDay(''), [type, incidentId]);

  return (
    <div className="space-y-4">
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={view === 'activity'} onClick={() => setView('activity')}>Activity ({all.length})</button>
        <button role="tab" className="tab" aria-selected={view === 'readings'} onClick={() => setView('readings')}>Monitoring readings ({rDays.length} day{rDays.length === 1 ? '' : 's'})</button>
      </div>

      {view === 'activity' && (
        <>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filter by event type" className="input !w-auto" value={type} onChange={(e) => setType(e.target.value as EventType | '')}>
              <option value="">All event types</option>
              {(Object.keys(EVENT_META) as EventType[]).map((k) => <option key={k} value={k}>{EVENT_META[k].label}</option>)}
            </select>
            <select aria-label="Filter by incident" className="input !w-auto" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">All incidents</option>
              {incidents.map((i) => <option key={i.id} value={i.id}>{i.id}</option>)}
            </select>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-400">
              {(Object.keys(EVENT_META) as EventType[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: EVENT_META[k].color }} aria-hidden />{EVENT_META[k].label}</span>
              ))}
            </div>
          </div>
          {!groups.length ? (
            <EmptyState title="Nothing recorded yet" body={all.length ? 'No records match these filters.' : 'Complaints, imports, assignments, inspections and verifications will appear here on the days they happen.'} />
          ) : (
            <>
              <DayNavigator days={groups.map((g) => ({ day: g.day, count: g.events.length }))} value={current.day} onChange={setDay} />
              <section>
                <h3 className="panel-title mb-3">{dayLabel(current.day)} · {current.events.length} record{current.events.length === 1 ? '' : 's'}</h3>
                <ol className="space-y-3 border-l border-[var(--line-strong)] pl-0 [&>li]:ml-[-5px]">
                  {current.events.map((e) => <EventRow key={e.id} e={e} />)}
                </ol>
              </section>
            </>
          )}
        </>
      )}

      {view === 'readings' && (
        !rCurrent ? (
          <EmptyState title="No monitoring readings recorded" body="Import a monitoring dataset to see the days on which readings were taken." />
        ) : (
          <>
            <DayNavigator days={rDays.map((d) => ({ day: d.day, count: d.observations }))} value={rCurrent.day} onChange={(d) => { setRDay(d); setShowRaw(false); }} />
            <section className="space-y-3">
              <h3 className="panel-title">{dayLabel(rCurrent.day)} · {rCurrent.observations} observation{rCurrent.observations === 1 ? '' : 's'}</h3>
              <p className="muted">Stations: {rCurrent.stations.join(', ')}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead className="text-left text-ink-400"><tr><th className="pb-1.5 font-normal">Pollutant</th><th className="pb-1.5 text-right font-normal">Values</th><th className="pb-1.5 text-right font-normal">Min</th><th className="pb-1.5 text-right font-normal">Mean</th><th className="pb-1.5 text-right font-normal">Max</th><th className="pb-1.5 pl-3 font-normal">Unit</th></tr></thead>
                  <tbody>
                    {rCurrent.pollutants.map((p) => (
                      <tr key={p.key} className="border-t border-[var(--line)]">
                        <td className="py-1.5 font-bold">{p.key}</td>
                        <td className="num py-1.5 text-right">{p.count}</td>
                        <td className="num py-1.5 text-right">{p.min}</td>
                        <td className="num py-1.5 text-right">{p.mean}</td>
                        <td className="num py-1.5 text-right">{p.max}</td>
                        <td className="py-1.5 pl-3 text-ink-400">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="flex items-center gap-2 text-[13px] text-ink-300" aria-expanded={showRaw} onClick={() => setShowRaw((x) => !x)}>
                <ChevronDown size={14} className={cn('transition-transform', showRaw && 'rotate-180')} aria-hidden /> Recorded values ({rCurrent.readings.length})
              </button>
              {showRaw && (
                <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md bg-[var(--surface-sunken)] p-3 text-[12.5px]">
                  {[...rCurrent.readings].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(0, 200).map((r) => (
                    <li key={r.id}>
                      <span className="num text-ink-400">{time(r.timestamp)}</span> · {r.station} · {Object.entries(r.values).map(([k, v]) => `${k} ${v}`).join(', ')} <span className="muted">({r.fileName}, {r.ref})</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}

/** Day-grouped history for one incident (stakeholder, field officer, citizen). */
export function IncidentDayTimeline({ incident }: { incident: Incident }) {
  const events = useMemo(() => buildEvents([incident], []), [incident]);
  const groups = groupByDay(events);
  if (!groups.length) return <p className="muted">No recorded activity yet.</p>;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.day}>
          <h4 className="eyebrow mb-2">{dayLabel(g.day)}</h4>
          <ol className="space-y-2.5">{g.events.map((e) => <EventRow key={e.id} e={e} showIncident={false} />)}</ol>
        </section>
      ))}
    </div>
  );
}

const STAGES = ['Submitted', 'Assessed', 'Action in progress', 'Resolved'] as const;

/** Four-stage progress with the actual dates each stage was reached. */
export function StageProgress({ incident, compact }: { incident: Incident; compact?: boolean }) {
  const firstAt = (pred: (s: string) => boolean) => incident.history.find((h) => pred(h.status))?.timestamp;
  const dates = [
    incident.complaint.timestamp,
    firstAt((s) => s === 'Assessed'),
    firstAt((s) => ['Allocated', 'Under Investigation', 'Action Submitted', 'Verification Pending'].includes(s)),
    incident.status === 'Verified Closed' ? incident.closedAt ?? firstAt((s) => s === 'Verified Closed') : undefined,
  ];
  const reached = incident.status === 'Verified Closed' ? 3 : dates[2] ? 2 : dates[1] ? 1 : 0;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Progress: ${STAGES[reached]}`}>
      {STAGES.map((s, i) => (
        <li key={s}>
          <span className={cn('block h-1.5 rounded-full', i <= reached ? (reached === 3 ? 'bg-sev-low' : 'bg-accent') : 'bg-ink-700')} />
          <span className={cn('mt-1 block text-[11.5px] [font-family:var(--font-nav)]', i <= reached ? 'text-ink-100' : 'text-ink-500')}>{s}</span>
          {!compact && <span className="muted block !text-[11px]">{dates[i] && i <= reached ? new Date(dates[i]!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>}
        </li>
      ))}
    </ol>
  );
}
