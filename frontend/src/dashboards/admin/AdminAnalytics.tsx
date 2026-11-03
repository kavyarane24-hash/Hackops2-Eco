import { useEffect, useMemo, useState } from 'react';
import { 
  Building2, 
  MapPin, 
  Activity, 
  Search, 
  TrendingUp, 
  Radio, 
  Clock, 
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ReferenceLine 
} from 'recharts';
import { Panel, Spinner } from '@/components/common/Panel';
import { 
  fetchCpcbData, 
  type CpcbDatasetPayload 
} from '@/services/cpcb';
import { cn } from '@/lib/utils';

export default function AdminAnalytics() {
  const [data, setData] = useState<CpcbDatasetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [selectedPollutant, setSelectedPollutant] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [historyDays, setHistoryDays] = useState<number>(60);
  const [historyMetric, setHistoryMetric] = useState<'pm25' | 'no2' | 'o3'>('pm25');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchCpcbData();
      if (payload && payload.stations && payload.stations.length > 0) {
        setData(payload);
      } else {
        setError('No CPCB monitoring records found in dataset.');
      }
    } catch {
      setError('Failed to load CPCB environmental dataset.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Filtered Cities for city dropdown based on selected state
  const availableCities = useMemo(() => {
    if (!data) return [];
    if (selectedState === 'All') return data.filterOptions.cities;
    return Array.from(new Set(data.stations.filter((s) => s.state === selectedState).map((s) => s.city))).sort();
  }, [data, selectedState]);

  // Filtered Stations
  const filteredStations = useMemo(() => {
    if (!data) return [];
    return data.stations.filter((s) => {
      if (selectedState !== 'All' && s.state !== selectedState) return false;
      if (selectedCity !== 'All' && s.city !== selectedCity) return false;
      if (selectedPollutant !== 'All') {
        const p = s.pollutants[selectedPollutant];
        if (!p || p.avg === null || p.avg === undefined) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStation = s.station.toLowerCase().includes(q);
        const matchesCity = s.city.toLowerCase().includes(q);
        if (!matchesStation && !matchesCity) return false;
      }
      return true;
    });
  }, [data, selectedState, selectedCity, selectedPollutant, searchQuery]);

  // Filtered Cities list for comparison
  const filteredCities = useMemo(() => {
    if (!data) return [];
    if (selectedState === 'All') return data.cities;
    return data.cities.filter((c) => c.state === selectedState);
  }, [data, selectedState]);

  // Historical data sliced
  const historicalSeries = useMemo(() => {
    if (!data || !data.history) return [];
    return data.history.slice(-historyDays);
  }, [data, historyDays]);

  // Summary Metrics of filtered stations
  const stats = useMemo(() => {
    if (!filteredStations.length) return null;
    let aqiSum = 0;
    let aqiCount = 0;
    const pollutantSums: Record<string, { sum: number; count: number; min: number; max: number }> = {};

    for (const s of filteredStations) {
      if (s.calculatedAqi !== null) {
        aqiSum += s.calculatedAqi;
        aqiCount++;
      }
      for (const [pol, val] of Object.entries(s.pollutants)) {
        if (val.avg !== null && val.avg !== undefined) {
          if (!pollutantSums[pol]) {
            pollutantSums[pol] = { sum: 0, count: 0, min: val.avg, max: val.avg };
          }
          pollutantSums[pol].sum += val.avg;
          pollutantSums[pol].count++;
          if (val.avg < pollutantSums[pol].min) pollutantSums[pol].min = val.avg;
          if (val.avg > pollutantSums[pol].max) pollutantSums[pol].max = val.avg;
        }
      }
    }

    return {
      avgAqi: aqiCount > 0 ? Math.round(aqiSum / aqiCount) : null,
      stationCount: filteredStations.length,
      pollutantAverages: Object.fromEntries(
        Object.entries(pollutantSums).map(([k, v]) => [
          k,
          {
            avg: Math.round((v.sum / v.count) * 10) / 10,
            min: Math.round(v.min * 10) / 10,
            max: Math.round(v.max * 10) / 10,
            count: v.count,
          },
        ])
      ),
    };
  }, [filteredStations]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Spinner size={32} className="text-accent mb-4" />
        <h3 className="text-base font-semibold text-ink-100">Loading Official CPCB CAAQMS Dataset</h3>
        <p className="mt-1 text-xs text-ink-400">Ingesting continuous air quality records from data.gov.in…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Panel title="Air-Quality Analytics">
        <div className="p-8 text-center">
          <AlertTriangle size={32} className="mx-auto text-sev-critical mb-3" />
          <h3 className="text-sm font-semibold text-ink-100">Dataset Unavailable</h3>
          <p className="mt-1 text-xs text-ink-400">{error}</p>
          <button onClick={loadData} className="btn btn-primary mt-4 !text-xs">
            <RotateCcw size={14} /> Retry Ingestion
          </button>
        </div>
      </Panel>
    );
  }

  const meta = data!.metadata;

  return (
    <div className="space-y-6">
      {/* Header & Source Provenance Banner */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow !text-xs text-accent">National Environmental Intelligence</p>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              Official Open Government Data (data.gov.in)
            </span>
          </div>
          <h1 className="page-title mt-1">CPCB CAAQMS Air Quality Analytics</h1>
          <p className="mt-1 text-xs text-ink-400">
            Official monitoring observations from {meta.uniqueStations} CAAQMS stations across {meta.uniqueCities} cities in {meta.uniqueStates} states.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Clock size={13} className="text-ink-300" />
          <span>Observation Timestamp: <strong className="text-ink-200">{meta.observationTimestamp}</strong></span>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="panel p-3.5">
          <div className="flex items-center justify-between text-ink-400 text-xs">
            <span>CAAQMS Stations</span>
            <Radio size={14} className="text-accent" />
          </div>
          <div className="num mt-2 text-2xl font-bold text-ink-100">{stats?.stationCount ?? meta.uniqueStations}</div>
          <div className="mt-1 text-[11px] text-ink-400">
            {selectedState === 'All' ? `Across ${meta.uniqueStates} States` : `In ${selectedState}`}
          </div>
        </div>

        <div className="panel p-3.5">
          <div className="flex items-center justify-between text-ink-400 text-xs">
            <span>Average AQI</span>
            <Activity size={14} className="text-amber-400" />
          </div>
          <div className="num mt-2 text-2xl font-bold text-ink-100">{stats?.avgAqi ?? 'N/A'}</div>
          <div className="mt-1 text-[11px] text-ink-400">
            CPCB NAQI scale (24-h breakpoint)
          </div>
        </div>

        <div className="panel p-3.5">
          <div className="flex items-center justify-between text-ink-400 text-xs">
            <span>Cities Monitored</span>
            <Building2 size={14} className="text-sky-400" />
          </div>
          <div className="num mt-2 text-2xl font-bold text-ink-100">{availableCities.length}</div>
          <div className="mt-1 text-[11px] text-ink-400">Active municipal networks</div>
        </div>

        <div className="panel p-3.5">
          <div className="flex items-center justify-between text-ink-400 text-xs">
            <span>Highest AQI Station</span>
            <TrendingUp size={14} className="text-sev-critical" />
          </div>
          <div className="num mt-2 text-lg font-bold text-sev-critical truncate" title={data?.topPollutedStations[0]?.station}>
            {data?.topPollutedStations[0]?.calculatedAqi ?? '—'} · {data?.topPollutedStations[0]?.city}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {data?.topPollutedStations[0]?.station}
          </div>
        </div>

        <div className="panel p-3.5">
          <div className="flex items-center justify-between text-ink-400 text-xs">
            <span>Cleanest Station</span>
            <MapPin size={14} className="text-emerald-400" />
          </div>
          <div className="num mt-2 text-lg font-bold text-emerald-400 truncate" title={data?.cleanestStations[0]?.station}>
            {data?.cleanestStations[0]?.calculatedAqi ?? '—'} · {data?.cleanestStations[0]?.city}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {data?.cleanestStations[0]?.station}
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        {/* State Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-400 font-medium">State:</span>
          <select
            className="input !w-auto !py-1 !text-xs bg-ink-900 border-[var(--line)]"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedCity('All');
            }}
          >
            <option value="All">All States ({data?.filterOptions.states.length})</option>
            {data?.filterOptions.states.map((st) => (
              <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* City Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-400 font-medium">City:</span>
          <select
            className="input !w-auto !py-1 !text-xs bg-ink-900 border-[var(--line)]"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            <option value="All">All Cities ({availableCities.length})</option>
            {availableCities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Pollutant Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-400 font-medium">Pollutant:</span>
          <select
            className="input !w-auto !py-1 !text-xs bg-ink-900 border-[var(--line)]"
            value={selectedPollutant}
            onChange={(e) => setSelectedPollutant(e.target.value)}
          >
            <option value="All">All Pollutants</option>
            {data?.filterOptions.pollutants.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Station Search */}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            placeholder="Search station or city…"
            className="input !py-1 !pl-8 !text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(selectedState !== 'All' || selectedCity !== 'All' || selectedPollutant !== 'All' || searchQuery) && (
          <button
            onClick={() => {
              setSelectedState('All');
              setSelectedCity('All');
              setSelectedPollutant('All');
              setSearchQuery('');
            }}
            className="btn btn-ghost !min-h-7 !py-0 !px-2 !text-[11px] text-ink-400 hover:text-ink-100"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Pollutant Breakdown Cards */}
      <div>
        <h3 className="eyebrow mb-2">National Pollutant Breakdown (CPCB Averages)</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {['PM2.5', 'PM10', 'NO2', 'SO2', 'CO', 'OZONE'].map((pol) => {
            const pData = stats?.pollutantAverages[pol];
            const unit = pol === 'CO' ? 'mg/m³' : 'μg/m³';
            return (
              <div key={pol} className="rounded-lg border border-[var(--line)] bg-ink-950/60 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-ink-200">{pol}</span>
                  <span className="text-[10px] text-ink-400">{unit}</span>
                </div>
                <div className="num mt-1 text-lg font-bold text-ink-100">
                  {pData?.avg !== undefined ? `${pData.avg}` : 'N/A'}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-ink-400">
                  <span>Min: {pData?.min ?? '—'}</span>
                  <span>Max: {pData?.max ?? '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Trend Multi-Year Chart */}
      <Panel
        title="Historical Ambient Air Quality Trend"
        description="Daily timeseries from CPCB National Monitoring Archive (2014-2024)"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-[var(--line)] p-0.5 text-xs">
              {(['pm25', 'no2', 'o3'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setHistoryMetric(m)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                    historyMetric === m ? 'bg-accent text-ink-950' : 'text-ink-400 hover:text-ink-200'
                  )}
                >
                  {m === 'pm25' ? 'PM2.5' : m.toUpperCase()}
                </button>
              ))}
            </div>
            <select
              aria-label="Time span"
              className="input !w-auto !py-1 !text-xs bg-ink-900 border-[var(--line)]"
              value={historyDays}
              onChange={(e) => setHistoryDays(parseInt(e.target.value, 10))}
            >
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={180}>Last 180 Days</option>
              <option value={365}>Last 1 Year</option>
            </select>
          </div>
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historicalSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpcbGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#087f8c" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#087f8c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#222c36" />
              <XAxis dataKey="date" tick={{ fill: '#809196', fontSize: 10 }} />
              <YAxis tick={{ fill: '#809196', fontSize: 10 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#0f171d', borderColor: '#222c36', fontSize: '12px' }}
                formatter={(val: unknown) => [typeof val === 'number' ? `${val} μg/m³` : 'N/A', historyMetric.toUpperCase()]}
                labelFormatter={(d) => `Date: ${d}`}
              />
              <ReferenceLine y={historyMetric === 'pm25' ? 60 : historyMetric === 'no2' ? 80 : 100} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'NAAQS Standard Limit', fill: '#ef4444', fontSize: 10 }} />
              <Area type="monotone" dataKey={historyMetric} stroke="#087f8c" strokeWidth={2} fillOpacity={1} fill="url(#cpcbGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* City-wise & Station-wise Comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 10 Most Polluted Cities */}
        <Panel title="Highest Average AQI Cities" description="Ranked by station-averaged CPCB AQI">
          <div className="space-y-2">
            {filteredCities.slice(0, 8).map((c, idx) => (
              <div key={c.city} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-900/60 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-ink-100">{c.city}</div>
                    <div className="text-[10px] text-ink-400">{c.state.replace(/_/g, ' ')} · {c.stationCount} station(s)</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold" style={{ color: c.aqiColor }}>
                    AQI {c.avgAqi ?? 'N/A'}
                  </span>
                  <div className="text-[10px] text-ink-400">{c.aqiCategory}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Cleanest Cities */}
        <Panel title="Cleanest Recorded Cities" description="Cities with lowest recorded pollution levels">
          <div className="space-y-2">
            {[...filteredCities].filter((c) => c.avgAqi !== null).slice(-8).reverse().map((c, idx) => (
              <div key={c.city} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-900/60 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-ink-100">{c.city}</div>
                    <div className="text-[10px] text-ink-400">{c.state.replace(/_/g, ' ')} · {c.stationCount} station(s)</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-emerald-400">
                    AQI {c.avgAqi ?? 'N/A'}
                  </span>
                  <div className="text-[10px] text-ink-400">{c.aqiCategory}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Station-Wise Table */}
      <Panel
        title={`CAAQMS Stations Directory (${filteredStations.length})`}
        description="Comprehensive monitoring station parameters from CPCB real-time network"
      >
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-900 text-ink-400 border-b border-[var(--line)]">
              <tr>
                <th className="py-2 px-3">Station Name</th>
                <th className="py-2 px-3">City / State</th>
                <th className="py-2 px-3 text-center">AQI</th>
                <th className="py-2 px-3 text-center">Category</th>
                <th className="py-2 px-3 text-center">PM2.5</th>
                <th className="py-2 px-3 text-center">PM10</th>
                <th className="py-2 px-3 text-center">NO₂</th>
                <th className="py-2 px-3 text-center">SO₂</th>
                <th className="py-2 px-3 text-center">CO</th>
                <th className="py-2 px-3 text-center">O₃</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] font-mono text-[11px]">
              {filteredStations.slice(0, 100).map((s) => (
                <tr key={s.id} className="hover:bg-ink-900/60">
                  <td className="py-2 px-3 font-sans font-medium text-ink-100 max-w-[200px] truncate" title={s.station}>
                    {s.station}
                  </td>
                  <td className="py-2 px-3 font-sans text-ink-300">
                    {s.city}, {s.state.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2 px-3 text-center font-bold" style={{ color: s.aqiColor }}>
                    {s.calculatedAqi ?? 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-center font-sans">
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ color: s.aqiColor, backgroundColor: `${s.aqiColor}15` }}>
                      {s.aqiCategory}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['PM2.5']?.avg ?? '—'}</td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['PM10']?.avg ?? '—'}</td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['NO2']?.avg ?? '—'}</td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['SO2']?.avg ?? '—'}</td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['CO']?.avg ?? '—'}</td>
                  <td className="py-2 px-3 text-center text-ink-200">{s.pollutants['OZONE']?.avg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
