import type { IncidentCategory, IncidentStatus, Priority, Severity, Urgency } from '@/types';

export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
export const URGENCIES: Urgency[] = ['Low', 'Moderate', 'High', 'Immediate'];
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const CATEGORIES: IncidentCategory[] = [
  'Biomass / Stubble Burning',
  'Industrial Emissions',
  'Waste Burning',
  'Vehicular Emissions',
  'Construction Dust',
  'Other Air Pollution',
];

export const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#5fd38d',
  Medium: '#f2c14e',
  High: '#f59a52',
  Critical: '#f06b6b',
};

export const SEVERITY_RANK: Record<Severity, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

export const STATUS_TONE: Record<IncidentStatus, string> = {
  Reported: '#a9bac4',
  Assessed: '#8fb3c9',
  Allocated: '#7cc4c2',
  'Under Investigation': '#5fb3a8',
  'Action Submitted': '#e494a8',
  'Verification Pending': '#DA7B93',
  'Verified Closed': '#6fd39b',
  Reopened: '#f0a8b8',
};

/** Statuses that count as "open" work. */
export const OPEN_STATUSES: IncidentStatus[] = [
  'Reported',
  'Assessed',
  'Allocated',
  'Under Investigation',
  'Action Submitted',
  'Verification Pending',
  'Reopened',
];

export const DEPARTMENTS = [
  'Pollution Control Board – Industrial Cell',
  'Agriculture – Crop Residue Cell',
  'Municipal Solid Waste Dept.',
  'Transport Enforcement Wing',
  'Construction & Demolition Cell',
] as const;

export const CATEGORY_DEPARTMENT: Record<IncidentCategory, string> = {
  'Biomass / Stubble Burning': DEPARTMENTS[1],
  'Industrial Emissions': DEPARTMENTS[0],
  'Waste Burning': DEPARTMENTS[2],
  'Vehicular Emissions': DEPARTMENTS[3],
  'Construction Dust': DEPARTMENTS[4],
  'Other Air Pollution': DEPARTMENTS[0],
};

/**
 * CPCB National Ambient Air Quality Standards (NAAQS), notified 18 Nov 2009.
 * Only 24-hour limits are used for incident comparisons because incident readings
 * are 24-hour averages. Annual limits are listed for reference, never compared.
 */
export const NAAQS = {
  reference: 'CPCB National Ambient Air Quality Standards, 2009 (Notification B-29016/20/90/PCI-I)',
  url: 'https://cpcb.nic.in/air-quality-standard/',
  limits: [
    { pollutant: 'PM2.5', period: '24 hours', limit: 60, unit: 'µg/m³' },
    { pollutant: 'PM2.5', period: 'Annual', limit: 40, unit: 'µg/m³' },
    { pollutant: 'PM10', period: '24 hours', limit: 100, unit: 'µg/m³' },
    { pollutant: 'PM10', period: 'Annual', limit: 60, unit: 'µg/m³' },
    { pollutant: 'NO2', period: '24 hours', limit: 80, unit: 'µg/m³' },
    { pollutant: 'NO2', period: 'Annual', limit: 40, unit: 'µg/m³' },
    { pollutant: 'SO2', period: '24 hours', limit: 80, unit: 'µg/m³' },
    { pollutant: 'SO2', period: 'Annual', limit: 50, unit: 'µg/m³' },
    { pollutant: 'O3', period: '8 hours', limit: 100, unit: 'µg/m³' },
    { pollutant: 'O3', period: '1 hour', limit: 180, unit: 'µg/m³' },
    { pollutant: 'CO', period: '8 hours', limit: 2, unit: 'mg/m³' },
    { pollutant: 'CO', period: '1 hour', limit: 4, unit: 'mg/m³' },
  ],
} as const;

/** CPCB National AQI category bands (index values, not concentrations). */
export const AQI_BANDS = [
  { name: 'Good', min: 0, max: 50, color: '#22c55e' },
  { name: 'Satisfactory', min: 51, max: 100, color: '#86c34a' },
  { name: 'Moderate', min: 101, max: 200, color: '#f5b83d' },
  { name: 'Poor', min: 201, max: 300, color: '#f97316' },
  { name: 'Very Poor', min: 301, max: 400, color: '#ef4444' },
  { name: 'Severe', min: 401, max: 500, color: '#9f1239' },
] as const;

export function aqiCategory(aqi: number) {
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** Default map view: Delhi NCR (demo region). */
export const DEFAULT_CENTER: [number, number] = [28.6448, 77.2167];
export const DEFAULT_ZOOM = 10;
