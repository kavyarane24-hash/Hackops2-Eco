import { API_BASE_URL, USE_REAL_API } from './api';
import snapshotData from '@/data/cpcbSnapshot.json';

export interface CpcbPollutantValue {
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface CpcbStation {
  id: string;
  station: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  lastUpdate: string;
  pollutants: Record<string, CpcbPollutantValue>;
  calculatedAqi: number | null;
  aqiCategory: string;
  aqiColor: string;
  dominantPollutant: string;
}

export interface CpcbCity {
  city: string;
  state: string;
  stationCount: number;
  avgAqi: number | null;
  aqiCategory: string;
  aqiColor: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  o3: number | null;
}

export interface CpcbHistoricalPoint {
  date: string;
  pm25: number | null;
  o3: number | null;
  no2: number | null;
  aqiEstimate: number | null;
}

export interface CpcbDatasetPayload {
  metadata: {
    source: string;
    resourceId: string;
    datasetTitle: string;
    observationTimestamp: string;
    totalRecords: number;
    validNumericRecords: number;
    missingValuesCount: number;
    uniqueStations: number;
    uniqueCities: number;
    uniqueStates: number;
    nationalAvgAqi: number | null;
    nationalAqiCategory: string;
  };
  filterOptions: {
    states: string[];
    cities: string[];
    pollutants: string[];
  };
  topPollutedCities: CpcbCity[];
  cleanestCities: CpcbCity[];
  topPollutedStations: CpcbStation[];
  cleanestStations: CpcbStation[];
  cities: CpcbCity[];
  stations: CpcbStation[];
  history: CpcbHistoricalPoint[];
}

export async function fetchCpcbData(): Promise<CpcbDatasetPayload> {
  if (USE_REAL_API && API_BASE_URL) {
    try {
      const [ovRes, stRes, hiRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cpcb/overview`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE_URL}/api/cpcb/stations`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE_URL}/api/cpcb/history?days=90`).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (ovRes?.success && stRes?.success) {
        return {
          metadata: ovRes.metadata,
          filterOptions: ovRes.filterOptions,
          topPollutedCities: ovRes.topPollutedCities,
          cleanestCities: ovRes.cleanestCities,
          topPollutedStations: ovRes.topPollutedStations,
          cleanestStations: ovRes.cleanestStations,
          cities: snapshotData.cities as CpcbCity[],
          stations: (stRes.stations || snapshotData.stations) as CpcbStation[],
          history: (hiRes?.history || snapshotData.history) as CpcbHistoricalPoint[],
        };
      }
    } catch {
      // Fallback to embedded snapshot
    }
  }

  // Instant fallback to official verified dataset snapshot
  return snapshotData as unknown as CpcbDatasetPayload;
}
