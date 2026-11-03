import { useMemo, useRef, useState, useEffect } from 'react';
import { Layers, MapPinOff, X, Compass, Radio } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { Panel } from '@/components/common/Panel';
import { SeverityBadge, StatusBadge, UrgencyBadge } from '@/components/common/Badges';
import { IncidentDayTimeline, StageProgress } from '@/components/timeline/Timeline';
import { buildEvents, EVENT_META } from '@/services/timeline';
import { IncidentMap, computeHotspots } from '@/components/maps/IncidentMap';
import { FilterBar, applyFilters, EMPTY_FILTERS, type IncidentFilters } from '@/components/incidents/IncidentTable';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { LiveEnvironmentalCard } from '@/components/common/LiveEnvironmentalCard';
import type { NormalizedHotspot } from '@/services/api';
import { fetchCpcbData, type CpcbDatasetPayload } from '@/services/cpcb';
import { DEPARTMENTS, OPEN_STATUSES, SEVERITIES, SEVERITY_COLOR } from '@/config/constants';
import { useReveal } from '@/hooks/motion';
import { daysUntil, fmtDate, fmtDateTime, isValidCoord } from '@/utils';

function zoneOf(address: string) {
  const m = address.match(/(North-West|North|South|East|West|Central) Delhi/i);
  return m ? m[0] : 'Other / unspecified';
}

export default function StakeholderDashboard() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  const incidents = useIncidentStore((s) => s.incidents);
  const { open } = useIncidentParam();
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [hotspots, setHotspots] = useState(true);
  const [customCoord, setCustomCoord] = useState<[number, number] | null>(null);
  const [fireHotspots, setFireHotspots] = useState<NormalizedHotspot[]>([]);
  const [cpcbData, setCpcbData] = useState<CpcbDatasetPayload | null>(null);
  const [showCpcbStations, setShowCpcbStations] = useState(true);

  useEffect(() => {
    void fetchCpcbData().then(setCpcbData);
  }, []);

  const visible = useMemo(() => applyFilters(incidents, filters), [incidents, filters]);
  const missingCoords = visible.filter((i) => !isValidCoord(i.complaint.location.lat, i.complaint.location.lng));
  const selected = incidents.find((i) => i.id === selectedId);
  const hs = useMemo(() => computeHotspots(visible), [visible]);
  const recent = useMemo(() => buildEvents(incidents, []).slice(0, 8), [incidents]);

  const inspectionCoord: [number, number] = useMemo(() => {
    if (selected && isValidCoord(selected.complaint.location.lat, selected.complaint.location.lng)) {
      return [selected.complaint.location.lat as number, selected.complaint.location.lng as number];
    }
    if (customCoord) return customCoord;
    return [28.6139, 77.2090];
  }, [selected, customCoord]);

  const inspectionName = useMemo(() => {
    if (selected) return selected.complaint.location.address || `Incident ${selected.id}`;
    if (customCoord) return `Map Target (${customCoord[0].toFixed(3)}, ${customCoord[1].toFixed(3)})`;
    return 'Delhi Central (NCR)';
  }, [selected, customCoord]);

  const byDept = DEPARTMENTS.map((d) => {
    const list = incidents.filter((i) => i.assignment?.department === d);
    return {
      d,
      open: list.filter((i) => OPEN_STATUSES.includes(i.status)).length,
      closed: list.filter((i) => i.status === 'Verified Closed').length,
      overdue: list.filter((i) => i.status !== 'Verified Closed' && (daysUntil(i.assignment?.deadline) ?? 1) < 0).length,
    };
  });
  const byArea = Object.entries(
    incidents.reduce<Record<string, { open: number; critical: number }>>((acc, i) => {
      const z = zoneOf(i.complaint.location.address);
      acc[z] ??= { open: 0, critical: 0 };
      if (i.status !== 'Verified Closed') acc[z].open++;
      if (i.analysis?.severity === 'Critical' && i.status !== 'Verified Closed') acc[z].critical++;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].open - a[1].open);

  return (
    <div ref={scope} className="space-y-5">
      <div className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Stakeholder · GIS monitoring</p>
          <h1 className="page-title">Pollution hotspot map</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-200 font-semibold">
          {SEVERITIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: SEVERITY_COLOR[s] }} aria-hidden /> {s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-blue bg-slate-blue/30" aria-hidden /> Closed
          </span>
        </div>
      </div>

      <div className="reveal">
        <LiveEnvironmentalCard
          lat={inspectionCoord[0]}
          lon={inspectionCoord[1]}
          locationName={inspectionName}
          onHotspotsLoaded={setFireHotspots}
        />
      </div>

      <div className="panel reveal p-3.5 bg-[var(--surface)]">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel-solid reveal relative h-[62vh] min-h-[420px] overflow-hidden border border-[var(--line)]">
          <IncidentMap
            incidents={visible}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setCustomCoord(null);
            }}
            onOpenDetails={open}
            showHotspots={hotspots}
            fireHotspots={fireHotspots}
            selectedLocation={inspectionCoord}
            onMapClick={(lat, lng) => {
              setCustomCoord([lat, lng]);
              setSelectedId(undefined);
            }}
            cpcbStations={cpcbData?.stations}
            showCpcbStations={showCpcbStations}
            onCpcbStationSelect={(st) => {
              setCustomCoord([st.latitude, st.longitude]);
              setSelectedId(undefined);
            }}
          />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-2">
            <div className="flex gap-1.5">
              <button
                className="btn pointer-events-auto !min-h-8 bg-deep-teal/90 text-white border border-white/20 hover:bg-deep-teal hover:text-white !text-xs shadow-md backdrop-blur-xs transition-all"
                aria-pressed={hotspots}
                onClick={() => setHotspots((v) => !v)}
              >
                <Layers size={14} className={hotspots ? 'text-dusty-rose' : ''} aria-hidden /> Incidents ({hs.length})
              </button>
              <button
                className="btn pointer-events-auto !min-h-8 bg-deep-teal/90 text-white border border-white/20 hover:bg-deep-teal hover:text-white !text-xs shadow-md backdrop-blur-xs transition-all"
                aria-pressed={showCpcbStations}
                onClick={() => setShowCpcbStations((v) => !v)}
              >
                <Radio size={14} className={showCpcbStations ? 'text-emerald-400' : ''} aria-hidden /> CPCB Stations ({cpcbData?.stations.length ?? 501})
              </button>
            </div>
            <span className="chip pointer-events-auto bg-deep-teal/90 text-white border border-white/20 shadow-md !text-[11px]">
              <Compass size={11} className="text-accent" /> Click map or station to inspect live data
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-8 left-3 z-[500] flex flex-col gap-1.5">
            <span className="chip pointer-events-auto bg-deep-teal/90 text-white border border-white/20 shadow-md num font-semibold">{visible.length - missingCoords.length} on map</span>
            {missingCoords.length > 0 && (
              <span className="chip pointer-events-auto bg-deep-burgundy/90 text-dusty-rose-light border border-dusty-rose/40 shadow-md font-semibold">
                <MapPinOff size={11} aria-hidden /> {missingCoords.length} without valid coordinates
              </span>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <Panel
            title={selected ? <span className="num font-bold text-ink-100">{selected.id}</span> : 'Incident details'}
            actions={selected && (
              <button className="btn btn-ghost !min-h-8 !px-2 border-[var(--line-strong)] text-ink-200 hover:text-ink-100" aria-label="Clear selection" onClick={() => setSelectedId(undefined)}>
                <X size={14} />
              </button>
            )}
          >
            {!selected ? (
              <p className="text-sm text-ink-400">Click a marker on the map, or pick an incident below, to see its details here.</p>
            ) : (
              <div className="space-y-3.5">
                <div className="flex flex-wrap gap-1.5">
                  {selected.analysis && <SeverityBadge severity={selected.analysis.severity} />}
                  <StatusBadge status={selected.status} />
                  {selected.analysis && <UrgencyBadge urgency={selected.analysis.urgency} />}
                </div>
                <p className="text-sm font-bold text-ink-100">{selected.analysis?.category ?? 'Awaiting analysis'}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs rounded-lg border border-[var(--line)] bg-surface-tinted/40 p-2.5">
                  <div><dt className="text-ink-400">Department</dt><dd className="font-semibold text-ink-100 truncate">{selected.assignment?.department ?? 'Unassigned'}</dd></div>
                  <div><dt className="text-ink-400">Officer</dt><dd className="font-semibold text-ink-100">{selected.assignment?.officerName ?? '—'}</dd></div>
                  <div><dt className="text-ink-400">Deadline</dt><dd className="num font-semibold text-ink-100">{selected.assignment ? fmtDate(selected.assignment.deadline) : '—'}</dd></div>
                  <div><dt className="text-ink-400">Reported</dt><dd className="num text-ink-200">{fmtDateTime(selected.complaint.timestamp)}</dd></div>
                </dl>
                <p className="text-xs text-ink-300">{selected.complaint.location.address}</p>
                <StageProgress incident={selected} />
                <details className="group">
                  <summary className="cursor-pointer text-[13px] font-bold text-ink-200 hover:text-ink-100 [font-family:var(--font-nav)]">Activity timeline</summary>
                  <div className="mt-3 max-h-72 overflow-y-auto pr-1"><IncidentDayTimeline incident={selected} /></div>
                </details>
                <button className="btn btn-primary w-full bg-muted-teal hover:bg-deep-teal text-white font-bold shadow-sm" onClick={() => open(selected.id)}>Open complete details</button>
              </div>
            )}
          </Panel>

          <Panel title="Recent activity" description="Latest recorded actions across incidents" bodyClassName="px-5 pb-4 max-h-64 overflow-y-auto">
            {recent.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
              <ul className="space-y-2.5">
                {recent.map((e) => (
                  <li key={e.id} className="text-[13px]">
                    <button className="text-left text-ink-100 hover:text-teal-lite transition-colors" onClick={() => e.incidentId && setSelectedId(e.incidentId)}>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full ring-1 ring-black/10" style={{ background: EVENT_META[e.type].color }} aria-hidden />
                      <span className="font-bold">{EVENT_META[e.type].label}</span> <span className="num font-semibold text-ink-200">{e.incidentId}</span>
                    </button>
                    <span className="muted block text-ink-400">{new Date(e.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Incidents in view" eyebrow={`${visible.length} matching`} bodyClassName="p-0 max-h-72 overflow-y-auto">
            <ul className="divide-y divide-[var(--line)]">
              {visible.map((i) => (
                <li key={i.id}>
                  <button
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${i.id === selectedId ? 'bg-muted-teal/20 font-bold text-ink-100 shadow-[inset_3px_0_0_#DA7B93]' : 'hover:bg-muted-teal/20 text-ink-100'}`}
                    onClick={() => setSelectedId(i.id)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.analysis ? SEVERITY_COLOR[i.analysis.severity] : '#435e72' }} aria-hidden />
                    <span className="num font-semibold">{i.id}</span>
                    <span className="ml-auto truncate text-xs text-ink-400">{i.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Department-wise reporting" eyebrow="Assignments">
          <table className="w-full text-sm">
            <thead className="text-xs font-bold text-ink-100 border-b border-[var(--line)]">
              <tr><th scope="col" className="pb-2 text-left font-bold">Department</th><th scope="col" className="pb-2 text-right font-bold">Open</th><th scope="col" className="pb-2 text-right font-bold">Overdue</th><th scope="col" className="pb-2 text-right font-bold">Closed</th></tr>
            </thead>
            <tbody>
              {byDept.map((r) => (
                <tr key={r.d} className="border-t border-[var(--line)] hover:bg-muted-teal/20 transition-colors">
                  <td className="py-2.5 pr-2 font-medium text-ink-100">
                    <button className="text-left hover:text-teal-lite transition-colors" onClick={() => setFilters({ ...EMPTY_FILTERS, department: r.d })}>{r.d}</button>
                  </td>
                  <td className="num py-2.5 text-right font-semibold text-ink-100">{r.open}</td>
                  <td className={`num py-2.5 text-right font-bold ${r.overdue ? 'text-sev-critical' : 'text-ink-400'}`}>{r.overdue}</td>
                  <td className="num py-2.5 text-right text-ink-200 font-medium">{r.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Area-wise reporting" eyebrow="By zone (from address)">
          <ul className="space-y-3">
            {byArea.map(([zone, v]) => {
              const max = Math.max(1, ...byArea.map(([, x]) => x.open));
              return (
                <li key={zone}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-ink-100">{zone}</span>
                    <span className="num text-xs font-medium text-ink-200">{v.open} open{v.critical ? ` · ${v.critical} critical` : ''}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-blue/15">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(v.open / max) * 100}%`, background: v.critical ? '#b42318' : '#376E6F' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
