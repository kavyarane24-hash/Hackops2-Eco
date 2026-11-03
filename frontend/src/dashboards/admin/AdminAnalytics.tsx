import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { Panel, EmptyState } from '@/components/common/Panel';
import { AirQualityChart } from '@/components/charts/AirQualityChart';
import { RecordedTimeline } from '@/components/timeline/Timeline';
import { dailySeriesFromReadings, projectSeries, trendDirection } from '@/services/airQuality';
import { aqiCategory } from '@/config/constants';

/** Admin › Analytics: trends from imported monitoring data only. */
export default function AdminAnalytics() {
  const imports = useIncidentStore((s) => s.imports);
  const readings = useMemo(() => imports.flatMap((b) => b.readings), [imports]);
  const stations = useMemo(() => [...new Set(readings.map((r) => r.station))], [readings]);
  const [station, setStation] = useState('');
  const current = stations.includes(station) ? station : stations[0];
  const series = useMemo(() => dailySeriesFromReadings(readings.filter((r) => r.station === current)), [readings, current]);
  const projection = useMemo(() => (series.length >= 3 ? projectSeries(series.filter((p) => p.aqi != null), 3) : []), [series]);

  if (!readings.length)
    return (
      <Panel title="Air-quality trends">
        <EmptyState
          title="No monitoring data recorded"
          body="Trends appear here once a monitoring dataset is imported. Nothing is simulated."
          icon={<UploadCloud size={18} aria-hidden />}
          action={<Link to="/admin/import" className="btn btn-primary mt-2">Import data</Link>}
        />
      </Panel>
    );

  return (
    <div className="space-y-5">
      <Panel
        title="Air-quality trends"
        description={`Daily means of imported readings · ${series.length} recorded day${series.length === 1 ? '' : 's'} at this station`}
        actions={
          <select aria-label="Monitoring station" className="input !w-auto !py-1.5 !text-[13px]" value={current} onChange={(e) => setStation(e.target.value)}>
            {stations.map((s) => <option key={s}>{s}</option>)}
          </select>
        }
      >
        <AirQualityChart series={series} projection={projection} stationName={current} />
      </Panel>
      {projection.length > 0 && (
        <Panel title="Short-term outlook" description="Linear trend over recorded days, not a forecast">
          <p className="text-[13.5px] text-ink-200">
            If the recorded trend continues ({trendDirection(series.filter((p) => p.aqi != null))}), AQI at {current} would be about{' '}
            <strong className="num" style={{ color: aqiCategory(projection[projection.length - 1].aqi).color }}>{projection[projection.length - 1].aqi}</strong> in 3 days. Based on {series.length} recorded day(s) only.
          </p>
        </Panel>
      )}
      <Panel title="Recorded measurements by day">
        <RecordedTimeline />
      </Panel>
    </div>
  );
}
