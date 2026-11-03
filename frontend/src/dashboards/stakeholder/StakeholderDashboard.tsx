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
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-300">
          {SEVERITIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLOR[s] }} aria-hidden /> {s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-400 bg-ink-500/40" aria-hidden /> Closed
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

      <div className="panel reveal p-3">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel-solid reveal relative h-[62vh] min-h-[420px] overflow-hidden">
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
                className="btn btn-ghost pointer-events-auto !min-h-8 bg-ink-900/90 !text-xs"
                aria-pressed={hotspots}
                onClick={() => setHotspots((v) => !v)}
              >
                <Layers size={14} aria-hidden /> Incidents ({hs.length})
              </button>
              <button
                className="btn btn-ghost pointer-events-auto !min-h-8 bg-ink-900/90 !text-xs"
                aria-pressed={showCpcbStations}
                onClick={() => setShowCpcbStations((v) => !v)}
              >
                <Radio size={14} className={showCpcbStations ? 'text-emerald-400' : ''} aria-hidden /> CPCB Stations ({cpcbData?.stations.length ?? 501})
              </button>
            </div>
            <span className="chip pointer-events-auto bg-ink-900/90 !text-[11px] text-ink-300">
              <Compass size={11} className="text-accent" /> Click map or station to inspect live data
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-8 left-3 z-[500] flex flex-col gap-1">
            <span className="chip pointer-events-auto bg-ink-900/90 num">{visible.length - missingCoords.length} on map</span>
            {missingCoords.length > 0 && (
              <span className="chip pointer-events-auto bg-ink-900/90 !text-sev-medium">
                <MapPinOff size={11} aria-hidden /> {missingCoords.length} without valid coordinates
              </span>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <Panel
            title={selected ? <span className="num">{selected.id}</span> : 'Incident details'}
            actions={selected && (
              <button className="btn btn-ghost !min-h-8 !px-2" aria-label="Clear selection" onClick={() => setSelectedId(undefined)}>
                <X size={14} />
              </button>
            )}
          >
            {!selected ? (
              <p className="text-sm text-ink-400">Click a marker on the map, or pick an incident below, to see its details here.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {selected.analysis && <SeverityBadge severity={selected.analysis.severity} />}
                  <StatusBadge status={selected.status} />
                  {selected.analysis && <UrgencyBadge urgency={selected.analysis.urgency} />}
                </div>
                <p className="text-sm text-ink-100">{selected.analysis?.category ?? 'Awaiting analysis'}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-ink-400">Department</dt><dd>{selected.assignment?.department ?? 'Unassigned'}</dd></div>
                  <div><dt className="text-ink-400">Officer</dt><dd>{selected.assignment?.officerName ?? '—'}</dd></div>
                  <div><dt className="text-ink-400">Deadline</dt><dd className="num">{selected.assignment ? fmtDate(selected.assignment.deadline) : '—'}</dd></div>
                  <div><dt className="text-ink-400">Reported</dt><dd className="num">{fmtDateTime(selected.complaint.timestamp)}</dd></div>
                </dl>
                <p className="text-xs text-ink-300">{selected.complaint.location.address}</p>
                <StageProgress incident={selected} />
                <details className="group">
                  <summary className="cursor-pointer text-[13px] text-ink-200 [font-family:var(--font-nav)]">Activity timeline</summary>
                  <div className="mt-3 max-h-72 overflow-y-auto pr-1"><IncidentDayTimeline incident={selected} /></div>
                </details>
                <button className="btn btn-primary w-full" onClick={() => open(selected.id)}>Open complete details</button>
              </div>
            )}
          </Panel>

          <Panel title="Recent activity" description="Latest recorded actions across incidents" bodyClassName="px-5 pb-4 max-h-64 overflow-y-auto">
            {recent.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
              <ul className="space-y-2">
                {recent.map((e) => (
                  <li key={e.id} className="text-[13px]">
                    <button className="text-left hover:text-accent" onClick={() => e.incidentId && setSelectedId(e.incidentId)}>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: EVENT_META[e.type].color }} aria-hidden />
                      <span className="font-bold">{EVENT_META[e.type].label}</span> <span className="num text-ink-300">{e.incidentId}</span>
                    </button>
                    <span className="muted block">{new Date(e.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-ink-800/60 ${i.id === selectedId ? 'bg-accent-soft' : ''}`}
                    onClick={() => setSelectedId(i.id)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.analysis ? SEVERITY_COLOR[i.analysis.severity] : '#6b7a8f' }} aria-hidden />
                    <span className="num font-medium">{i.id}</span>
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
            <thead className="text-xs text-ink-400">
              <tr><th scope="col" className="pb-2 text-left font-medium">Department</th><th scope="col" className="pb-2 text-right font-medium">Open</th><th scope="col" className="pb-2 text-right font-medium">Overdue</th><th scope="col" className="pb-2 text-right font-medium">Closed</th></tr>
            </thead>
            <tbody>
              {byDept.map((r) => (
                <tr key={r.d} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-2">
                    <button className="text-left hover:text-accent" onClick={() => setFilters({ ...EMPTY_FILTERS, department: r.d })}>{r.d}</button>
                  </td>
                  <td className="num py-2 text-right">{r.open}</td>
                  <td className={`num py-2 text-right ${r.overdue ? 'text-sev-critical' : 'text-ink-400'}`}>{r.overdue}</td>
                  <td className="num py-2 text-right text-ink-300">{r.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Area-wise reporting" eyebrow="By zone (from address)">
          <ul className="space-y-2">
            {byArea.map(([zone, v]) => {
              const max = Math.max(1, ...byArea.map(([, x]) => x.open));
              return (
                <li key={zone}>
                  <div className="flex justify-between text-sm">
                    <span>{zone}</span>
                    <span className="num text-xs text-ink-300">{v.open} open{v.critical ? ` · ${v.critical} critical` : ''}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full" style={{ width: `${(v.open / max) * 100}%`, background: v.critical ? SEVERITY_COLOR.Critical : '#087f8c' }} />
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
