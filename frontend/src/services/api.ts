// Central API abstraction. Mock mode runs entirely in the browser; real mode
// calls the deployed Express backend (Render) and falls back to mock per call if an
// endpoint is missing (501/404) or the server is unreachable.
//
// Backend endpoints supported:
//   GET  /api/health
//   GET  /api/intelligence/health
//   POST /api/intelligence/upload-image      multipart field "image"
//   POST /api/intelligence/upload-data       multipart field "dataFile"
//   POST /api/intelligence/analyze-complaint JSON complaint analysis
//   GET  /api/intelligence/environmental-data lat/lon/radius live query
import type { AIAnalysisOutput, ComplaintInput, EnvironmentalReading } from '@/types';
import { mockAnalyze } from './ai';

export const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type BackendState = 'mock' | 'online' | 'offline' | 'checking';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  if (!API_BASE_URL) throw new ApiError('VITE_API_BASE_URL is not set');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Backend unreachable');
  } finally {
    clearTimeout(t);
  }
}

export async function checkBackend(): Promise<BackendState> {
  if (!USE_REAL_API) return 'mock';
  try {
    await request('/api/health', undefined, 8000);
    return 'online';
  } catch {
    return 'offline';
  }
}

export interface IntelligenceHealthResponse {
  success: boolean;
  module: string;
  status: string;
  phase: number;
  timestamp: string;
  endpoints: {
    implemented: string[];
    pending: string[];
  };
}

export async function checkIntelligenceHealth(): Promise<IntelligenceHealthResponse | undefined> {
  if (!USE_REAL_API) return undefined;
  try {
    return await request<IntelligenceHealthResponse>('/api/intelligence/health', undefined, 8000);
  } catch {
    return undefined;
  }
}

/** Stores an image on the backend (validation + private storage only). */
export async function uploadImage(imageInput: string | File | Blob, name = 'upload.jpg'): Promise<string | undefined> {
  if (!USE_REAL_API) return undefined;
  try {
    let blob: Blob;
    let fileName = name;
    if (typeof imageInput === 'string') {
      blob = await (await fetch(imageInput)).blob();
      fileName = name.replace(/\.\w+$/, '') + '.jpg';
    } else {
      blob = imageInput;
      if (imageInput instanceof File && imageInput.name) {
        fileName = imageInput.name;
      }
    }
    const form = new FormData();
    // Do not set Content-Type header: FormData will provide the multipart boundary automatically
    form.append('image', blob, fileName);
    const res = await request<{ fileInfo: { storedAs: string } }>('/api/intelligence/upload-image', {
      method: 'POST',
      body: form,
    }, 20000);
    return res.fileInfo?.storedAs;
  } catch {
    return undefined; // non-fatal: the local preview is still kept
  }
}

/** Stores a data file (.csv, .xlsx, .xls) on the backend (validation + private storage). */
export async function uploadDataFile(
  fileInput: File | Blob,
  name = 'data.csv'
): Promise<{ success: boolean; fileInfo?: { storedAs: string; originalName: string; sizeBytes: number } } | undefined> {
  if (!USE_REAL_API) return undefined;
  try {
    const fileName = (fileInput instanceof File && fileInput.name) ? fileInput.name : name;
    const form = new FormData();
    // Do not set Content-Type header: FormData will provide the multipart boundary automatically
    form.append('dataFile', fileInput, fileName);
    const res = await request<{ success: boolean; fileInfo: { storedAs: string; originalName: string; sizeBytes: number } }>(
      '/api/intelligence/upload-data',
      {
        method: 'POST',
        body: form,
      },
      20000
    );
    return res;
  } catch {
    return undefined;
  }
}

/**
 * Analyse a complaint. Tries the backend Intelligence Engine first in real
 * mode; any failure falls back to the in-browser rule engine so the demo keeps
 * working. The result always says which engine produced it.
 */
export async function analyzeComplaint(c: ComplaintInput, readings: EnvironmentalReading[] = []): Promise<AIAnalysisOutput> {
  if (USE_REAL_API) {
    try {
      const res = await request<{ success: boolean; analysis: AIAnalysisOutput }>('/api/intelligence/analyze-complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          text: c.originalText,
          language: c.language,
          location: c.location,
          timestamp: c.timestamp,
          media: (c.evidenceFiles || []).map((m) => ({ name: m.name, kind: m.kind, backendRef: m.backendRef })),
        }),
      }, 25000);
      if (res.analysis) return { ...res.analysis, generatedBy: 'backend-ai' };
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'unknown error';
      const fallback = mockAnalyze(c, readings);
      return { ...fallback, engineNote: `Backend analysis unavailable (${reason}); used the in-browser rule engine.` };
    }
  }
  // Small delay so the "analysing" state is visible in the demo.
  await new Promise((r) => setTimeout(r, 900));
  return mockAnalyze(c, readings);
}

export interface NormalizedPollutant {
  value: number | null;
  unit: string;
  hasValue: boolean;
}

export interface NormalizedMetric {
  value: number | null;
  unit: string;
  hasValue: boolean;
}

export interface NormalizedHotspot {
  latitude: number;
  longitude: number;
  distanceKm: number;
  bearingDegrees: number;
  acquisitionTimestampUtc: string | null;
  satellite: string;
  instrument?: string;
  confidence: string;
  brightnessKelvin: number | null;
  fireRadiativePowerMw: number | null;
  dayNight: string;
  isPotentialUpwind: boolean;
}

export interface EnvironmentalDataResponse {
  success: boolean;
  assessmentStatus?: string;
  timestamp?: string;
  query?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  data: {
    metadata?: {
      generatedAt: string;
      requestedLocation: { latitude: number; longitude: number; radiusKm: number };
      pipelineVersion?: string;
    };
    airQuality: {
      status: string;
      dataCategory: string;
      isGroundMeasurement: boolean;
      sourceProvider: string;
      modelAttribution?: {
        domain?: string;
        modelName?: string;
        spatialResolution?: string;
        gridCoordinates?: { latitude: number; longitude: number; elevationMeters?: number } | null;
        requestedCoordinates?: { latitude: number; longitude: number } | null;
      };
      timestamp: string | null;
      pollutants: {
        pm25?: NormalizedPollutant;
        pm10?: NormalizedPollutant;
        no2?: NormalizedPollutant;
        so2?: NormalizedPollutant;
        co?: NormalizedPollutant;
        o3?: NormalizedPollutant;
      };
      indices?: {
        foreignIndices?: {
          europeanAqi?: { value: number | null; scale: string; standard?: string; cpcbCalibrated?: boolean };
          usAqi?: { value: number | null; scale: string; standard?: string; cpcbCalibrated?: boolean };
        };
        cpcbNaqiDisclaimer?: string;
      };
      disclaimers?: Record<string, string>;
    };
    weather: {
      status: string;
      dataCategory: string;
      isGroundMeasurement: boolean;
      sourceProvider: string;
      timestamp: string | null;
      metrics: {
        temperature?: NormalizedMetric;
        apparentTemperature?: NormalizedMetric;
        relativeHumidity?: NormalizedMetric;
        precipitation?: NormalizedMetric;
        surfacePressure?: NormalizedMetric;
      };
      wind: {
        speed?: NormalizedMetric;
        direction?: {
          degrees: number | null;
          unit: string;
          originCardinal: string | null;
          meteorologicalDefinition?: string;
        };
      };
      disclaimer?: string | null;
    };
    thermalHotspots: {
      status: string;
      dataCategory: string;
      isGroundMeasurement: boolean;
      sourceProvider: string;
      sensorSource: string;
      count: number;
      hotspots: NormalizedHotspot[];
      correlationSummary?: {
        totalHotspotsWithinRadius: number;
        potentialUpwindHotspots: number;
      };
      disclaimers?: Record<string, string>;
    };
  };
  validation?: {
    status: string;
    passed: boolean;
    issues?: string[];
  };
  providerStatuses?: Record<string, string>;
}

/**
 * Queries real Open-Meteo Air Quality, Open-Meteo Weather and NASA FIRMS
 * data through the backend Intelligence Engine pipeline.
 * If backend is unreachable or in cold-start, seamlessly queries public Open-Meteo APIs directly.
 * Coordinates are validated and values not returned are kept as null / 'N/A' (never fabricated or zeroed).
 */
export async function fetchEnvironmentalData(
  lat: number,
  lon: number,
  radiusKm = 50
): Promise<EnvironmentalDataResponse | undefined> {
  // 1. Query backend Intelligence Engine endpoint if API_BASE_URL is configured
  if (API_BASE_URL) {
    try {
      const res = await request<EnvironmentalDataResponse>(
        `/api/intelligence/environmental-data?lat=${lat}&lon=${lon}&radius=${radiusKm}`,
        undefined,
        15000
      );
      if (res && res.success && res.data) return res;
    } catch {
      // Backend cold-starting or unavailable; proceed to direct browser query fallback
    }
  }

  // 2. Direct browser fallback to Open-Meteo Air Quality & Weather APIs (public CORS)
  try {
    const [aqRes, wRes] = await Promise.all([
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi`
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m`
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    const aqCurrent = aqRes?.current || {};
    const wCurrent = wRes?.current || {};

    const degreesToCardinal = (deg: number | null): string | null => {
      if (deg === null || Number.isNaN(deg)) return null;
      const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      return cardinals[Math.round(deg / 22.5) % 16];
    };

    const toPollutant = (val: number | null | undefined, unit = 'μg/m³'): NormalizedPollutant => ({
      value: typeof val === 'number' ? val : null,
      unit,
      hasValue: typeof val === 'number',
    });

    const toMetric = (val: number | null | undefined, unit: string): NormalizedMetric => ({
      value: typeof val === 'number' ? val : null,
      unit,
      hasValue: typeof val === 'number',
    });

    const windDeg = typeof wCurrent.wind_direction_10m === 'number' ? wCurrent.wind_direction_10m : null;

    return {
      success: true,
      assessmentStatus: 'DIRECT_OPEN_METEO_FETCH',
      timestamp: new Date().toISOString(),
      query: { latitude: lat, longitude: lon, radiusKm },
      data: {
        metadata: {
          generatedAt: new Date().toISOString(),
          requestedLocation: { latitude: lat, longitude: lon, radiusKm },
          pipelineVersion: 'ClientDirect-OpenMeteo-v1',
        },
        airQuality: {
          status: aqRes ? 'available' : 'unavailable',
          dataCategory: 'atmospheric_composition_model',
          isGroundMeasurement: false,
          sourceProvider: 'Open-Meteo Air Quality (CAMS Global)',
          modelAttribution: {
            domain: 'cams_global',
            modelName: 'Copernicus Atmosphere Monitoring Service (CAMS) Global',
            requestedCoordinates: { latitude: lat, longitude: lon },
          },
          timestamp: aqCurrent.time || null,
          pollutants: {
            pm25: toPollutant(aqCurrent.pm2_5),
            pm10: toPollutant(aqCurrent.pm10),
            no2: toPollutant(aqCurrent.nitrogen_dioxide),
            so2: toPollutant(aqCurrent.sulphur_dioxide),
            co: toPollutant(aqCurrent.carbon_monoxide),
            o3: toPollutant(aqCurrent.ozone),
          },
          indices: {
            foreignIndices: {
              europeanAqi: {
                value: typeof aqCurrent.european_aqi === 'number' ? aqCurrent.european_aqi : null,
                scale: 'European AQI (0-100+)',
                standard: 'European Environment Agency (EEA)',
                cpcbCalibrated: false,
              },
              usAqi: {
                value: typeof aqCurrent.us_aqi === 'number' ? aqCurrent.us_aqi : null,
                scale: 'US EPA AQI (0-500)',
                standard: 'United States EPA',
                cpcbCalibrated: false,
              },
            },
            cpcbNaqiDisclaimer: 'Indices are foreign standards (European/US EPA). They are NOT calibrated to Indian CPCB NAQI.',
          },
        },
        weather: {
          status: wRes ? 'available' : 'unavailable',
          dataCategory: 'meteorological_numerical_forecast',
          isGroundMeasurement: false,
          sourceProvider: 'Open-Meteo Weather API',
          timestamp: wCurrent.time || null,
          metrics: {
            temperature: toMetric(wCurrent.temperature_2m, '°C'),
            apparentTemperature: toMetric(wCurrent.apparent_temperature, '°C'),
            relativeHumidity: toMetric(wCurrent.relative_humidity_2m, '%'),
            precipitation: toMetric(wCurrent.precipitation, 'mm'),
            surfacePressure: toMetric(wCurrent.surface_pressure, 'hPa'),
          },
          wind: {
            speed: toMetric(wCurrent.wind_speed_10m, 'km/h'),
            direction: {
              degrees: windDeg,
              unit: '°',
              originCardinal: degreesToCardinal(windDeg),
            },
          },
        },
        thermalHotspots: {
          status: 'backend_proxy_required',
          dataCategory: 'satellite_thermal_radiometry',
          isGroundMeasurement: false,
          sourceProvider: 'NASA FIRMS Area API',
          sensorSource: 'VIIRS_SNPP_NRT',
          count: 0,
          hotspots: [],
          disclaimers: {
            scientificDisclaimer: 'Satellite thermal anomaly queries require backend proxy to protect NASA FIRMS MAP_KEY credentials.',
          },
        },
      },
      providerStatuses: {
        openMeteoAirQuality: aqRes ? 'available' : 'unavailable',
        openMeteoWeather: wRes ? 'available' : 'unavailable',
        nasaFirms: 'backend_proxy_required',
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Formats a pollutant or environmental value honestly:
 * If value is null, undefined, or missing, returns "N/A" rather than fabricating a zero.
 */
export function formatEnvironmentalValue(val: number | null | undefined, unit = ''): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return 'N/A';
  }
  return `${val} ${unit}`.trim();
}
