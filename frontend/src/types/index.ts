// Central domain model for the Environmental Intelligence & Compliance system.
// Every dashboard reads these shapes from the shared incident store.

export type Role = 'citizen' | 'admin' | 'stakeholder' | 'field';

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type Urgency = 'Low' | 'Moderate' | 'High' | 'Immediate';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Language = 'en' | 'hi';

export type IncidentCategory =
  | 'Biomass / Stubble Burning'
  | 'Industrial Emissions'
  | 'Waste Burning'
  | 'Vehicular Emissions'
  | 'Construction Dust'
  | 'Other Air Pollution';

export const INCIDENT_STATUSES = [
  'Reported',
  'Assessed',
  'Allocated',
  'Under Investigation',
  'Action Submitted',
  'Verification Pending',
  'Verified Closed',
  'Reopened',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface GeoLocation {
  address: string;
  lat: number | null;
  lng: number | null;
  /** True when coordinates are simulated demo values, not a real observation. */
  simulated?: boolean;
}

export interface MediaFile {
  id: string;
  name: string;
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  /** data: URL for images (persisted), blob: URL for videos (session only). */
  url: string;
  /** blob: URLs do not survive a reload; the UI shows a placeholder instead. */
  sessionOnly?: boolean;
  phase?: 'complaint' | 'before' | 'after';
  uploadedAt: string;
  /** Name the backend stored the file under, when the real upload API was used. */
  backendRef?: string;
}

export interface ComplaintInput {
  id: string;
  originalText: string;
  language: Language;
  translatedText?: string;
  translationNote?: string;
  location: GeoLocation;
  timestamp: string;
  evidenceFiles: MediaFile[];
  reporterName?: string;
  reporterContact?: string;
}

export type EvidenceType =
  | 'citizen_report'
  | 'citizen_media'
  | 'sensor'
  | 'weather'
  | 'satellite'
  | 'regulatory'
  | 'field_inspection';

export type Reliability = 'High' | 'Medium' | 'Low' | 'Unverified';

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  description: string;
  source: string;
  url?: string;
  timestamp: string;
  location?: GeoLocation;
  reliability?: Reliability;
  /** Simulated/demo data must always be flagged in the UI. */
  simulated: boolean;
}

export interface SourceHypothesis {
  id: string;
  source: string;
  /** Confidence that this source is involved (0–1). NOT a share of pollution contributed. */
  confidence: number;
  supportingEvidenceIds: string[];
  contraryEvidence: string[];
  verificationRequired: string[];
}

export type Pollutant = 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'O3';

export type ComplianceAssessment =
  | 'Within selected reference limit'
  | 'Above selected reference limit'
  | 'Potential exceedance requiring verification'
  | 'Insufficient data for assessment';

export interface ComplianceComparison {
  pollutant: Pollutant;
  observedValue: number;
  observedAveragingPeriod: string;
  standardLimit: number;
  unit: string;
  averagingPeriod: string;
  standardName: string;
  reference: string;
  referenceUrl?: string;
  exceeded: boolean;
  /** observed / limit, only when averaging periods match. */
  exceedanceFactor?: number;
  assessment: ComplianceAssessment;
  /** Data limitations that qualify the comparison. */
  note: string;
}

export interface EnvironmentalContext {
  stationName: string;
  readingTime: string;
  aqi: number;
  aqiCategory: string;
  pm25_24h: number;
  pm10_24h: number;
  windDirection: string;
  windSpeedKmh: number;
  temperatureC: number;
  humidityPct: number;
  simulated: boolean;
}

export interface TrendEstimate {
  direction: 'rising' | 'falling' | 'stable';
  next72hAqi: number[];
  method: string;
  /** Always shown as an estimate in the UI. */
  disclaimer: string;
}

export interface AIAnalysisOutput {
  category: IncidentCategory;
  severity: Severity;
  urgency: Urgency;
  /** Confidence in the overall classification (0–1). */
  confidence: number;
  summary: string;
  possibleSources: SourceHypothesis[];
  supportingEvidence: EvidenceItem[];
  contradictoryEvidence: string[];
  trendEstimate: TrendEstimate;
  recommendations: string[];
  compliance: ComplianceComparison[];
  environmentalContext: EnvironmentalContext;
  generatedBy: 'mock-rules' | 'backend-ai';
  generatedAt: string;
  engineNote?: string;
}

export interface Officer {
  id: string;
  name: string;
  department: string;
  zone: string;
  phone: string;
  badge: string;
}

export interface Assignment {
  department: string;
  officerId: string;
  officerName: string;
  deadline: string;
  priority: Priority;
  assignedAt: string;
  assignedBy: string;
  instructions?: string;
}

export interface FieldUpdate {
  id: string;
  officerId: string;
  officerName: string;
  timestamp: string;
  type: 'inspection' | 'action_submission';
  inspectionNotes: string;
  observations: string;
  actionTaken: string;
  beforeMedia: MediaFile[];
  afterMedia: MediaFile[];
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  status: IncidentStatus;
  actor: string;
  role: Role | 'system';
  note?: string;
}

export interface Verification {
  decision: 'verified' | 'rejected' | 'reopened' | 'further_investigation';
  note: string;
  at: string;
  by: string;
}

export interface ImportReference {
  batchId: string;
  potentialId: string;
  fileNames: string[];
  readingIds: string[];
}

export interface Incident {
  id: string;
  /** Where the incident came from. */
  source?: 'citizen' | 'data_import';
  importRef?: ImportReference;
  complaint: ComplaintInput;
  analysis: AIAnalysisOutput | null;
  analysisState: 'pending' | 'done' | 'failed';
  status: IncidentStatus;
  assignment?: Assignment;
  fieldUpdates: FieldUpdate[];
  history: HistoryEntry[];
  verifications: Verification[];
  /** Device-local citizen id, used for "My Complaints" in the demo. */
  reporterId: string;
  isDemo: boolean;
  closedAt?: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  role: Role;
  incidentId: string;
  message: string;
  at: string;
  read: boolean;
}

export interface AirQualityPoint {
  date: string; // ISO day
  label: string; // short display label
  aqi: number;
  pm25: number; // 24-h average µg/m³
  pm10: number; // 24-h average µg/m³
  projected?: boolean;
}

// ── Data import & analysis ─────────────────────────────────────────────────

export type DataOrigin = 'imported' | 'manual' | 'demo' | 'citizen';
export type MeasureKey = 'AQI' | Pollutant;

/** One environmental measurement row, with full provenance back to its file. */
export interface EnvironmentalReading {
  id: string;
  batchId: string;
  fileName: string;
  uploadedAt: string;
  /** Sheet/row or page reference in the original file, e.g. "Sheet1 · row 14". */
  ref: string;
  originalRecordId?: string;
  sourceOrganisation?: string;
  station: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
  values: Partial<Record<MeasureKey, number>>;
  units: Partial<Record<MeasureKey, string>>;
  /** Averaging period of the values when known ('1 hour', '24 hours'); otherwise 'unknown'. */
  averagingPeriod: string;
  extractionStatus: 'valid' | 'warning';
  transformations: string[];
  origin: DataOrigin;
}

export type FieldKey =
  | 'ignore'
  | 'station'
  | 'timestamp'
  | 'date'
  | 'time'
  | 'lat'
  | 'lng'
  | 'aqi'
  | 'pm25'
  | 'pm10'
  | 'no2'
  | 'so2'
  | 'co'
  | 'o3'
  | 'unit'
  | 'averaging'
  | 'organisation'
  | 'recordId';

export interface ExtractedRecord {
  ref: string;
  raw: Record<string, string>;
}

export interface ExtractedTable {
  sheet: string;
  columns: string[];
  records: ExtractedRecord[];
}

export interface DocumentFinding {
  ref: string;
  type: 'reading' | 'date' | 'location' | 'observation' | 'compliance_reference' | 'recommendation' | 'evidence_reference';
  text: string;
  pollutant?: MeasureKey;
  value?: number;
  unit?: string;
  averagingPeriod?: string;
}

export interface ValidationIssue {
  ref: string;
  field?: string;
  level: 'error' | 'warning';
  message: string;
}

export interface DataValidationResult {
  totalRecords: number;
  validRecords: number;
  warningRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  missingByField: Record<string, number>;
  issues: ValidationIssue[];
  /** Overall extraction confidence 0–1 (heuristic: mapping coverage and row validity). */
  confidence: number;
}

export type ImportFileKind = 'csv' | 'excel' | 'pdf' | 'docx' | 'image' | 'json';
export type ImportFileStatus = 'Uploaded' | 'Processing' | 'Processed' | 'Failed';

export interface ImportFile {
  id: string;
  name: string;
  kind: ImportFileKind;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: ImportFileStatus;
  progress: number;
  error?: string;
  previewUrl?: string;
  tables?: ExtractedTable[];
  sections?: { ref: string; text: string }[];
  findings?: DocumentFinding[];
  mapping?: Record<string, FieldKey>;
  notes?: string[];
  /** Images: attach to the batch as evidence. Documents: include extracted findings. */
  include?: boolean;
  organisation?: string;
}

export interface ImportBatch {
  id: string;
  createdAt: string;
  fileNames: string[];
  readings: EnvironmentalReading[];
  documents: { fileName: string; findings: DocumentFinding[] }[];
  evidence: MediaFile[];
  validation: DataValidationResult;
  sourceOrganisation?: string;
}

export interface DailyAggregate {
  day: string;
  pm25?: number;
  pm10?: number;
  aqiMax?: number;
  hours: number;
}

export interface PotentialIncident {
  id: string;
  batchId: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'dismissed';
  incidentId?: string;
  title: string;
  station: string;
  location: GeoLocation;
  periodStart: string;
  periodEnd: string;
  pollutants: MeasureKey[];
  analysis: AIAnalysisOutput;
  readingIds: string[];
  daily: DailyAggregate[];
  spikes: { timestamp: string; pollutant: MeasureKey; value: number; baseline: number; ref: string }[];
  missingInformation: string[];
  nextSteps: string[];
  suggestedDepartment: string;
  suggestedOfficerId: string;
  suggestedDeadline: string;
  relatedComplaintIds: string[];
}

export interface IncidentReport {
  id: string;
  incidentId: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  status: 'Draft' | 'Final';
  incidentStatusAtGeneration: IncidentStatus;
  dataSources: string[];
  /** Frozen copy of everything the report was built from, so versions don't drift. */
  snapshot: {
    incident: Incident;
    readings: EnvironmentalReading[];
    daily: DailyAggregate[];
    documents: { fileName: string; findings: DocumentFinding[] }[];
    potential?: PotentialIncident;
  };
}
