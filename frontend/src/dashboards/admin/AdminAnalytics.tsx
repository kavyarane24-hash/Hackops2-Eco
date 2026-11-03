import { lazy, Suspense, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useIncidentStore, OFFICERS } from '@/context/IncidentStore';
import { Panel } from '@/components/common/Panel';
import { DemoTag } from '@/components/common/Badges';
import { AirQualityChart } from '@/components/charts/AirQualityChart';
import { ComplianceTable } from '@/components/incidents/AnalysisPanels';
import { OfficerCard } from '@/components/effects/OfficerCard';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { computeHotspots } from '@/components/maps/IncidentMap';
import { DEMO_STATIONS, projectSeries, stationSeries, trendDirection } from '@/services/airQuality';
import { buildCompliance } from '@/services/ai';
import { aqiCategory, OPEN_STATUSES, SEVERITY_COLOR, SEVERITY_RANK } from '@/config/constants';
import { CAROUSEL } from '@/config/motion';

const Carousel = lazy(() => import('@/components/effects/Carousel'));

/** Admin › Analytics: trends, outlook, compliance screening and workload. */
export default function AdminAnalytics() {
  const incidents = useIncidentStore((s) => s.incidents);
  const { open } = useIncidentParam();
  const [stationId, setStationId] = useState<string>(DEMO_STATIONS[0].id);
  const station = DEMO_STATIONS.find((s) => s.id === stationId) ?? DEMO_STATIONS[0];
  const series = useMemo(() => stationSeries(station.name, 30, station.intensity), [station]);
  const projection = useMemo(() => projectSeries(series, 3), [series]);
  const cmpStation = station.id === 'central' ? DEMO_STATIONS[3] : DEMO_STATIONS[1];
  const cmpSeries = useMemo(() => stationSeries(cmpStation.name, 30, cmpStation.intensity), [cmpStation]);
  const today = series[series.length - 1];
  const compliance = useMemo(() => buildCompliance(today.pm25, today.pm10), [today]);

  // Priority open incidents for the carousel (real store data).
  const priority = incidents
    .filter((i) => i.status !== 'Verified Closed' && i.analysis)
    .sort((a, b) => SEVERITY_RANK[b.analysis!.severity] - SEVERITY_RANK[a.analysis!.severity])
    .slice(0, 6);
  const hotspots = computeHotspots(incidents);

  const workload = OFFICERS.map((o) => {
    const cases = incidents.filter((i) => i.assignment?.officerId === o.id && OPEN_STATUSES.includes(i.status));
    const soonest = [...cases].sort((a, b) => (a.assignment!.deadline > b.assignment!.deadline ? 1 : -1))[0];
    return { officer: o, cases, soonest };
  }).sort((a, b) => b.cases.length - a.cases.length);

  return (
    <div className="space-y-5">
      <Panel
        title="Air-quality trends"
        description="Daily AQI, PM2.5 and PM10 with reference bands"
        actions={
          <select aria-label="Monitoring station" className="input !w-auto !py-1.5 !text-[13px]" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            {DEMO_STATIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        }
      >
        <AirQualityChart series={series} projection={projection} comparison={{ name: cmpStation.name.replace('Demo Station – ', ''), series: cmpSeries }} stationName={station.name.replace('Demo Station – ', '')} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Priority incidents" description={`${priority.length} open incidents by severity · ${hotspots.length} active hotspot areas`}>
          {priority.length === 0 ? (
            <p className="muted">No open incidents.</p>
          ) : (
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <Carousel
                {...CAROUSEL}
                baseWidth="100%"
                items={priority.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => open(i.id)}
                    className="flex h-full w-full flex-col justify-between rounded-[12px] bg-ink-800 p-4 text-left"
                    style={{ boxShadow: `inset 3px 0 0 ${SEVERITY_COLOR[i.analysis!.severity]}` }}
                  >
                    <div>
                      <p className="num text-[13px] text-ink-300">{i.id}</p>
                      <p className="panel-title mt-1">{i.analysis!.category}</p>
                      <p className="muted mt-1 flex items-start gap-1"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden />{i.complaint.location.address}</p>
                    </div>
                    <p className="text-[13px]" style={{ color: SEVERITY_COLOR[i.analysis!.severity] }}>
                      {i.analysis!.severity} · {i.status}{i.assignment ? ` · ${i.assignment.officerName}` : ' · unassigned'}
                    </p>
                  </button>
                ))}
              />
            </Suspense>
          )}
        </Panel>

        <Panel title="Short-term outlook" description="Linear 7-day trend estimate, not a forecast">
          <div className="flex items-baseline gap-3">
            <span className="num text-[28px] font-bold" style={{ color: aqiCategory(projection[2]?.aqi ?? today.aqi).color }}>{projection[2]?.aqi ?? '—'}</span>
            <span className="text-[13px] text-ink-300">AQI in 3 days if the trend continues ({trendDirection(series)})</span>
          </div>
          <table className="mt-3 w-full text-[13px]">
            <tbody>
              {projection.map((p) => (
                <tr key={p.date} className="border-t border-[var(--line)]">
                  <td className="py-1.5 text-ink-300">{p.label}</td>
                  <td className="num py-1.5 text-right" style={{ color: aqiCategory(p.aqi).color }}>{p.aqi}</td>
                  <td className="py-1.5 pl-3 text-ink-400">{aqiCategory(p.aqi).name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted mt-3">Extrapolated from {station.name}. Weather and seasonal burning can change this sharply; use for patrol planning only.</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="CPCB / NAAQS screening" description={`${station.name} · latest 24-h averages`} actions={<DemoTag label="Simulated readings" />}>
          <ComplianceTable rows={compliance} />
        </Panel>
        <Panel title="Officer workload" description="Open cases per officer (live)">
          <ul className="space-y-4">
            {workload.slice(0, 4).map(({ officer, cases, soonest }) => (
              <li key={officer.id}>
                <OfficerCard officer={officer} assignment={soonest?.assignment} openCases={cases.length} compact />
              </li>
            ))}
          </ul>
          <p className="muted mt-3">{workload.slice(4).map((w) => `${w.officer.name} ${w.cases.length}`).join(' · ')}</p>
        </Panel>
      </div>
    </div>
  );
}
