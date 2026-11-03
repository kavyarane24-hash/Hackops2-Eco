import { useState, useEffect, useCallback } from 'react';
import { 
  Wind, 
  Droplets, 
  Thermometer, 
  CloudRain, 
  Flame, 
  RefreshCw, 
  Info, 
  Gauge, 
  Clock, 
  MapPin, 
  AlertCircle,
  Radio
} from 'lucide-react';
import { 
  fetchEnvironmentalData, 
  formatEnvironmentalValue, 
  type EnvironmentalDataResponse, 
  type NormalizedHotspot 
} from '@/services/api';
import { Spinner } from '@/components/common/Panel';
import { cn } from '@/lib/utils';

interface Props {
  lat?: number | null;
  lon?: number | null;
  locationName?: string;
  onHotspotsLoaded?: (hotspots: NormalizedHotspot[]) => void;
  className?: string;
  compact?: boolean;
}

export function LiveEnvironmentalCard({
  lat = 28.6139,
  lon = 77.2090,
  locationName = 'Delhi Region',
  onHotspotsLoaded,
  className,
  compact = false,
}: Props) {
  const targetLat = lat ?? 28.6139;
  const targetLon = lon ?? 77.2090;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EnvironmentalDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'air' | 'weather' | 'fires'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEnvironmentalData(targetLat, targetLon, 50);
      if (res && res.success && res.data) {
        setData(res);
        if (onHotspotsLoaded && res.data.thermalHotspots?.hotspots) {
          onHotspotsLoaded(res.data.thermalHotspots.hotspots);
        }
      } else {
        setError('Environmental data currently unavailable for these coordinates.');
      }
    } catch {
      setError('Failed to retrieve environmental data.');
    } finally {
      setLoading(false);
    }
  }, [targetLat, targetLon, onHotspotsLoaded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const aq = data?.data?.airQuality;
  const w = data?.data?.weather;
  const fires = data?.data?.thermalHotspots;

  return (
    <div className={cn('rounded-xl border border-[var(--line-strong)] bg-ink-950/70 p-4 backdrop-blur-sm', className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Radio size={16} className={loading ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-ink-100">Live Environmental Intelligence</h4>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                Real-Time Feeds
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span className="flex items-center gap-1">
                <MapPin size={11} className="text-accent" />
                {locationName} ({targetLat.toFixed(4)}, {targetLon.toFixed(4)})
              </span>
              {data?.timestamp && (
                <span className="flex items-center gap-1 text-[11px] text-ink-400">
                  <Clock size={11} /> {new Date(data.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => loadData()}
          disabled={loading}
          className="btn btn-ghost !min-h-8 gap-1.5 !text-xs text-ink-300 hover:text-ink-100"
          title="Refresh live feeds from Open-Meteo and NASA FIRMS"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-accent' : ''} />
          {loading ? 'Refreshing…' : 'Refresh Data'}
        </button>
      </div>

      {/* Tabs */}
      {!compact && (
        <div className="mt-3 flex gap-1 border-b border-[var(--line)] pb-2 text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={cn('rounded px-2.5 py-1 transition-colors', activeTab === 'all' ? 'bg-accent/20 font-medium text-accent' : 'text-ink-400 hover:text-ink-200')}
          >
            All Datasets
          </button>
          <button
            onClick={() => setActiveTab('air')}
            className={cn('rounded px-2.5 py-1 transition-colors', activeTab === 'air' ? 'bg-accent/20 font-medium text-accent' : 'text-ink-400 hover:text-ink-200')}
          >
            Air Quality (CAMS)
          </button>
          <button
            onClick={() => setActiveTab('weather')}
            className={cn('rounded px-2.5 py-1 transition-colors', activeTab === 'weather' ? 'bg-accent/20 font-medium text-accent' : 'text-ink-400 hover:text-ink-200')}
          >
            Weather (NWP)
          </button>
          <button
            onClick={() => setActiveTab('fires')}
            className={cn('rounded px-2.5 py-1 transition-colors', activeTab === 'fires' ? 'bg-accent/20 font-medium text-accent' : 'text-ink-400 hover:text-ink-200')}
          >
            Thermal Fires (NASA)
          </button>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-ink-400">
          <Spinner size={16} className="text-accent" />
          <span>Acquiring live atmospheric and satellite radiometry streams…</span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-sev-critical/30 bg-sev-critical/10 p-3 text-xs text-ink-200">
          <AlertCircle size={15} className="shrink-0 text-sev-critical" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div className="mt-3 space-y-4">
          {/* Section 1: Air Quality */}
          {(activeTab === 'all' || activeTab === 'air') && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow flex items-center gap-1.5 !text-[11px] text-ink-300">
                  <Gauge size={13} className="text-sky-400" />
                  Atmospheric Composition · Open-Meteo CAMS Global
                </span>
                <span className="text-[10px] text-ink-400">Modeled ~40 km resolution</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">PM2.5</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.pm25?.value, 'μg/m³')}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">PM10</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.pm10?.value, 'μg/m³')}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">NO₂</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.no2?.value, 'μg/m³')}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">SO₂</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.so2?.value, 'μg/m³')}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">CO</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.co?.value, 'μg/m³')}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">O₃</div>
                  <div className="num mt-0.5 text-sm font-bold text-ink-100">
                    {formatEnvironmentalValue(aq?.pollutants.o3?.value, 'μg/m³')}
                  </div>
                </div>
              </div>

              {/* AQI Indicators */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-400">
                {aq?.indices?.foreignIndices?.europeanAqi?.value !== null && aq?.indices?.foreignIndices?.europeanAqi?.value !== undefined && (
                  <span className="flex items-center gap-1 rounded bg-ink-900 px-2 py-0.5">
                    European AQI: <strong className="text-ink-100 font-mono">{aq.indices.foreignIndices.europeanAqi.value}</strong> (EEA standard)
                  </span>
                )}
                {aq?.indices?.foreignIndices?.usAqi?.value !== null && aq?.indices?.foreignIndices?.usAqi?.value !== undefined && (
                  <span className="flex items-center gap-1 rounded bg-ink-900 px-2 py-0.5">
                    US EPA AQI: <strong className="text-ink-100 font-mono">{aq.indices.foreignIndices.usAqi.value}</strong>
                  </span>
                )}
                <span className="italic text-ink-400/80">
                  (Foreign standard scales · not calibrated to CPCB NAQI)
                </span>
              </div>
            </div>
          )}

          {/* Section 2: Weather */}
          {(activeTab === 'all' || activeTab === 'weather') && (
            <div className="border-t border-[var(--line)] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow flex items-center gap-1.5 !text-[11px] text-ink-300">
                  <Wind size={13} className="text-teal-400" />
                  Meteorological Dynamics · Open-Meteo Weather
                </span>
                <span className="text-[10px] text-ink-400">Numerical Weather Prediction</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-ink-900/60 p-2">
                  <Thermometer size={16} className="text-amber-400" />
                  <div>
                    <div className="text-[10px] text-ink-400">Temperature</div>
                    <div className="num text-xs font-semibold text-ink-100">
                      {formatEnvironmentalValue(w?.metrics.temperature?.value, '°C')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-ink-900/60 p-2">
                  <Droplets size={16} className="text-sky-400" />
                  <div>
                    <div className="text-[10px] text-ink-400">Humidity</div>
                    <div className="num text-xs font-semibold text-ink-100">
                      {formatEnvironmentalValue(w?.metrics.relativeHumidity?.value, '%')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-ink-900/60 p-2">
                  <Wind size={16} className="text-teal-400" />
                  <div>
                    <div className="text-[10px] text-ink-400">Wind Speed & Dir</div>
                    <div className="num text-xs font-semibold text-ink-100">
                      {formatEnvironmentalValue(w?.wind.speed?.value, 'km/h')}{' '}
                      {w?.wind.direction?.originCardinal ? `(${w.wind.direction.originCardinal})` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-ink-900/60 p-2">
                  <CloudRain size={16} className="text-blue-400" />
                  <div>
                    <div className="text-[10px] text-ink-400">Rainfall / Precip</div>
                    <div className="num text-xs font-semibold text-ink-100">
                      {formatEnvironmentalValue(w?.metrics.precipitation?.value, 'mm')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: NASA FIRMS Thermal Anomalies */}
          {(activeTab === 'all' || activeTab === 'fires') && (
            <div className="border-t border-[var(--line)] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow flex items-center gap-1.5 !text-[11px] text-ink-300">
                  <Flame size={13} className="text-orange-400" />
                  Thermal Hotspots · NASA FIRMS Satellite Radiometry
                </span>
                <span className="text-[10px] text-ink-400">VIIRS / MODIS instruments</span>
              </div>

              {fires?.status === 'key_missing' || fires?.status === 'backend_proxy_required' ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] bg-ink-900/40 p-2.5 text-xs text-ink-400">
                  <p className="flex items-center gap-1.5 font-medium text-ink-300">
                    <Info size={13} className="text-accent" />
                    NASA FIRMS Monitoring Status
                  </p>
                  <p className="mt-1 text-[11px]">
                    NASA FIRMS thermal detection requires server-side <code>NASA_FIRMS_MAP_KEY</code>. Detections will appear dynamically once provisioned.
                  </p>
                </div>
              ) : fires?.count === 0 ? (
                <div className="rounded-lg border border-[var(--line)] bg-ink-900/40 p-2.5 text-xs text-ink-300">
                  <p className="flex items-center gap-1.5 text-emerald-400">
                    ✓ No thermal anomalies (satellite fire detections) recorded within 50 km radius in the last 24h.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-ink-300">
                    <span>
                      Detected <strong className="text-orange-400 font-mono">{fires?.count}</strong> thermal anomalies within 50 km:
                    </span>
                    {fires?.correlationSummary?.potentialUpwindHotspots ? (
                      <span className="text-[11px] text-sev-critical">
                        ⚠️ {fires.correlationSummary.potentialUpwindHotspots} upwind from complaint
                      </span>
                    ) : null}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {fires?.hotspots.slice(0, 5).map((h, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded bg-ink-900/80 px-2 py-1 text-[11px]">
                        <span className="flex items-center gap-1.5 text-ink-200">
                          <Flame size={12} className="text-orange-400" />
                          <span>{h.satellite} ({h.confidence} conf)</span>
                        </span>
                        <span className="num text-ink-400">
                          {h.distanceKm.toFixed(1)} km · {h.brightnessKelvin ? `${Math.round(h.brightnessKelvin)}K` : ''} · {h.fireRadiativePowerMw ? `${h.fireRadiativePowerMw}MW` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
