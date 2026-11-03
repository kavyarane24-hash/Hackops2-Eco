import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { Incident, Severity } from '@/types';
import type { NormalizedHotspot } from '@/services/api';
import type { CpcbStation } from '@/services/cpcb';
import { DEFAULT_CENTER, DEFAULT_ZOOM, SEVERITY_COLOR, SEVERITY_RANK } from '@/config/constants';
import { fmtDateTime, isValidCoord } from '@/utils';

export const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
      }
    },
  });
  return null;
}

/** Keeps Leaflet sized correctly when its container resizes (drawers, grids). */
export function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyToSelected({ incident }: { incident?: Incident }) {
  const map = useMap();
  useEffect(() => {
    if (!incident) return;
    const { lat, lng } = incident.complaint.location;
    // Pan only when the marker is near/outside the edge, so an open popup isn't shifted off-screen.
    if (isValidCoord(lat, lng) && !map.getBounds().pad(-0.15).contains([lat, lng as number])) {
      map.panTo([lat, lng as number], { animate: true, duration: 0.5 });
    }
  }, [incident, map]);
  return null;
}

export interface Hotspot {
  key: string;
  center: [number, number];
  count: number;
  maxSeverity: Severity;
}

/** Grid clustering (~5.5 km cells) of open incidents into hotspots. */
export function computeHotspots(incidents: Incident[], cell = 0.05): Hotspot[] {
  const map = new Map<string, { lat: number; lng: number; n: number; sev: Hotspot['maxSeverity'] }>();
  for (const i of incidents) {
    const { lat, lng } = i.complaint.location;
    if (!isValidCoord(lat, lng) || i.status === 'Verified Closed') continue;
    const key = `${Math.round(lat / cell)}:${Math.round((lng as number) / cell)}`;
    const sev = i.analysis?.severity ?? 'Low';
    const cur = map.get(key);
    if (cur) {
      cur.lat += lat;
      cur.lng += lng as number;
      cur.n += 1;
      if (SEVERITY_RANK[sev] > SEVERITY_RANK[cur.sev]) cur.sev = sev;
    } else map.set(key, { lat, lng: lng as number, n: 1, sev });
  }
  return [...map.entries()].map(([key, v]) => ({ key, center: [v.lat / v.n, v.lng / v.n], count: v.n, maxSeverity: v.sev }));
}

interface Props {
  incidents: Incident[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpenDetails: (id: string) => void;
  showHotspots?: boolean;
  className?: string;
  fireHotspots?: NormalizedHotspot[];
  selectedLocation?: [number, number] | null;
  onMapClick?: (lat: number, lng: number) => void;
  cpcbStations?: CpcbStation[];
  showCpcbStations?: boolean;
  onCpcbStationSelect?: (station: CpcbStation) => void;
}

export function IncidentMap({ 
  incidents, 
  selectedId, 
  onSelect, 
  onOpenDetails, 
  showHotspots = true, 
  className,
  fireHotspots,
  selectedLocation,
  onMapClick,
  cpcbStations,
  showCpcbStations = false,
  onCpcbStationSelect,
}: Props) {
  const located = useMemo(() => incidents.filter((i) => isValidCoord(i.complaint.location.lat, i.complaint.location.lng)), [incidents]);
  const hotspots = useMemo(() => (showHotspots ? computeHotspots(incidents) : []), [incidents, showHotspots]);
  const selected = located.find((i) => i.id === selectedId);

  return (
    <MapContainer center={DEFAULT_CENTER as LatLngExpression} zoom={DEFAULT_ZOOM} className={`map-dark h-full w-full ${className ?? ''}`} scrollWheelZoom>
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
      <MapAutoResize />
      <FlyToSelected incident={selected} />
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

      {/* CPCB CAAQMS Monitoring Stations */}
      {showCpcbStations && cpcbStations?.map((s) => (
        <CircleMarker
          key={`cpcb-${s.id}`}
          center={[s.latitude, s.longitude]}
          radius={6}
          pathOptions={{
            color: s.aqiColor || '#087f8c',
            weight: 1.5,
            fillColor: s.aqiColor || '#087f8c',
            fillOpacity: 0.8,
          }}
          eventHandlers={{
            click: () => onCpcbStationSelect?.(s),
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <div className="text-[11px] font-sans">
              <strong>{s.station}</strong> ({s.city})
              <div>CPCB AQI: {s.calculatedAqi ?? 'N/A'} ({s.aqiCategory})</div>
            </div>
          </Tooltip>
          <Popup minWidth={240}>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-1">
                <span className="font-semibold text-ink-100 truncate max-w-[160px]">{s.station}</span>
                <span className="font-mono text-xs font-bold" style={{ color: s.aqiColor }}>
                  AQI {s.calculatedAqi ?? 'N/A'}
                </span>
              </div>
              <div className="text-[11px] text-ink-300">
                {s.city}, {s.state} · <span className="font-medium text-emerald-400">Official CPCB CAAQMS</span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded bg-ink-900/60 p-1.5 text-center text-[10px]">
                <div>
                  <div className="text-ink-400">PM2.5</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['PM2.5']?.avg ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-ink-400">PM10</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['PM10']?.avg ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-ink-400">NO₂</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['NO2']?.avg ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-ink-400">SO₂</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['SO2']?.avg ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-ink-400">CO</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['CO']?.avg ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-ink-400">O₃</div>
                  <div className="font-mono font-bold text-ink-100">{s.pollutants['OZONE']?.avg ?? 'N/A'}</div>
                </div>
              </div>
              <div className="text-[10px] text-ink-400">
                Updated: {s.lastUpdate} (CPCB Bulletin)
              </div>
              {onCpcbStationSelect && (
                <button
                  type="button"
                  className="btn btn-ghost !min-h-7 w-full !text-[11px] mt-1"
                  onClick={() => onCpcbStationSelect(s)}
                >
                  Inspect Live Atmosphere Here
                </button>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {selectedLocation && (
        <CircleMarker
          center={selectedLocation}
          radius={14}
          pathOptions={{ color: '#087f8c', weight: 3, fillColor: '#087f8c', fillOpacity: 0.25 }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            Selected inspection target ({selectedLocation[0].toFixed(4)}, {selectedLocation[1].toFixed(4)})
          </Tooltip>
        </CircleMarker>
      )}

      {/* NASA FIRMS Thermal Satellite Fire Hotspots */}
      {fireHotspots?.map((f, idx) => (
        <CircleMarker
          key={`fire-${idx}-${f.latitude}-${f.longitude}`}
          center={[f.latitude, f.longitude]}
          radius={8}
          pathOptions={{
            color: '#ef4444',
            weight: 2,
            fillColor: '#f97316',
            fillOpacity: 0.85,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            🔥 NASA FIRMS: {f.satellite} ({f.confidence} conf)
          </Tooltip>
          <Popup minWidth={220}>
            <div className="space-y-1 text-xs">
              <strong className="text-orange-400">🔥 NASA FIRMS Thermal Anomaly</strong>
              <div className="text-[11px] text-ink-300">
                Satellite fire detection by {f.satellite} ({f.instrument || 'VIIRS'})
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div>Confidence: <strong className="text-ink-100">{f.confidence}</strong></div>
                <div>FRP: <strong className="text-ink-100">{f.fireRadiativePowerMw ? `${f.fireRadiativePowerMw} MW` : 'N/A'}</strong></div>
                <div>Brightness: <strong className="text-ink-100">{f.brightnessKelvin ? `${Math.round(f.brightnessKelvin)} K` : 'N/A'}</strong></div>
                <div>Distance: <strong className="text-ink-100">{f.distanceKm.toFixed(1)} km</strong></div>
              </div>
              {f.isPotentialUpwind && (
                <div className="text-[10px] text-sev-critical font-medium">
                  ⚠️ Potential upwind plume relative to wind origin
                </div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {hotspots.map((h) => (
        <Circle
          key={h.key}
          center={h.center}
          radius={900 + h.count * 700}
          pathOptions={{ color: SEVERITY_COLOR[h.maxSeverity], weight: 1.5, opacity: 0.65, fillOpacity: 0.15, dashArray: '4 4' }}
          interactive={false}
        />
      ))}

      {located.map((i) => {
        const sev = i.analysis?.severity ?? 'Low';
        const color = i.status === 'Verified Closed' ? '#435e72' : SEVERITY_COLOR[sev];
        const isSel = i.id === selectedId;
        const pos: [number, number] = [i.complaint.location.lat as number, i.complaint.location.lng as number];
        return (
          <CircleMarker
            key={`${i.id}-${i.status}-${sev}`}
            center={pos}
            radius={isSel ? 13 : sev === 'Critical' ? 10 : 8}
            pathOptions={{
              color: isSel ? '#DA7B93' : color,
              weight: isSel ? 3.5 : 2,
              fillColor: color,
              fillOpacity: i.status === 'Verified Closed' ? 0.4 : 0.85,
              dashArray: i.status === 'Verified Closed' ? '3 3' : undefined,
            }}
            eventHandlers={{ click: () => onSelect(i.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {i.id} · {sev}
            </Tooltip>
            <Popup minWidth={240}>
              <div className="space-y-2 p-1">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-1">
                  <strong className="num text-[13px] text-ink-100 font-bold">{i.id}</strong>
                  <span style={{ color }} className="text-xs font-bold">{sev}</span>
                </div>
                <p className="text-xs font-medium text-ink-100">{i.analysis?.category ?? 'Awaiting analysis'}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-200">
                  <dt className="text-ink-400">Urgency</dt>
                  <dd className="font-semibold text-ink-100">{i.analysis?.urgency ?? '—'}</dd>
                  <dt className="text-ink-400">Status</dt>
                  <dd className="font-semibold text-ink-100">{i.status}</dd>
                  <dt className="text-ink-400">Department</dt>
                  <dd className="font-medium truncate">{i.assignment?.department ?? 'Unassigned'}</dd>
                  <dt className="text-ink-400">Officer</dt>
                  <dd className="font-medium">{i.assignment?.officerName ?? '—'}</dd>
                  <dt className="text-ink-400">Reported</dt>
                  <dd className="font-medium">{fmtDateTime(i.complaint.timestamp)}</dd>
                </dl>
                <p className="text-[11px] text-ink-300">{i.complaint.location.address}</p>
                {i.complaint.location.simulated && <p className="text-[10px] uppercase tracking-wider text-deep-burgundy font-bold">Simulated demo coordinates</p>}
                <button className="btn btn-primary !min-h-8 w-full !text-xs bg-muted-teal hover:bg-deep-teal font-bold shadow-xs" onClick={() => onOpenDetails(i.id)}>
                  Open full details
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
