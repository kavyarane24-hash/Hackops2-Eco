import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/config/constants';
import { MapAutoResize, OSM_ATTRIBUTION, OSM_TILES } from './IncidentMap';
import { Spinner } from '@/components/common/Panel';
import { isValidCoord } from '@/utils';

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  useMyLocationLabel: string;
  invalid?: boolean;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))) });
  return null;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (isValidCoord(lat, lng)) map.setView([lat, lng as number], Math.max(map.getZoom(), 13));
  }, [lat, lng, map]);
  return null;
}

export function LocationPicker({ lat, lng, onChange, useMyLocationLabel, invalid }: Props) {
  const [geoState, setGeoState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [geoMsg, setGeoMsg] = useState('');

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoState('error');
      setGeoMsg('Location is not available in this browser.');
      return;
    }
    setGeoState('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoState('idle');
        onChange(Number(p.coords.latitude.toFixed(5)), Number(p.coords.longitude.toFixed(5)));
      },
      (err) => {
        setGeoState('error');
        setGeoMsg(err.code === err.PERMISSION_DENIED ? 'Location permission denied. Click the map instead.' : 'Could not get your location. Click the map instead.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div>
      <div className={`relative h-56 overflow-hidden rounded-xl border ${invalid ? 'border-sev-critical' : 'border-[var(--line-strong)]'}`} data-lenis-prevent>
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map-dark h-full w-full" scrollWheelZoom={false}>
          <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
          <MapAutoResize />
          <ClickToPick onPick={onChange} />
          <Recenter lat={lat} lng={lng} />
          {isValidCoord(lat, lng) && (
            <CircleMarker center={[lat, lng as number]} radius={9} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#087f8c', fillOpacity: 0.9 }} />
          )}
        </MapContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="num text-xs text-ink-300" aria-live="polite">
          {isValidCoord(lat, lng) ? `Lat ${lat.toFixed(5)}, Lng ${(lng as number).toFixed(5)}` : 'No location selected'}
        </p>
        <button type="button" className="btn btn-ghost !min-h-8 !text-xs" onClick={locate} disabled={geoState === 'busy'}>
          {geoState === 'busy' ? <Spinner size={12} /> : <Crosshair size={14} aria-hidden />}
          {useMyLocationLabel}
        </button>
      </div>
      {geoState === 'error' && <p className="mt-1 text-xs text-[#b42318]">{geoMsg}</p>}
    </div>
  );
}
