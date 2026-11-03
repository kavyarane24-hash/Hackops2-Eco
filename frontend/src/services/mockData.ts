// DEMONSTRATION DATA. All incidents, people, coordinates and readings below are
// simulated for the hackathon demo and do not describe real events.
import type { Incident, MediaFile, Officer, Severity, IncidentCategory, Urgency } from '@/types';
import { DEPARTMENTS } from '@/config/constants';
import { mockAnalyze } from './ai';
import { localDay } from '@/utils';

export const OFFICERS: Officer[] = [
  { id: 'off-ak', name: 'Aarav Kulkarni', department: DEPARTMENTS[1], zone: 'North Zone', phone: '+91 90000 00101', badge: 'FO-1021' },
  { id: 'off-ns', name: 'Neha Sharma', department: DEPARTMENTS[0], zone: 'Central Zone', phone: '+91 90000 00102', badge: 'FO-1034' },
  { id: 'off-rv', name: 'Rohan Verma', department: DEPARTMENTS[2], zone: 'East Zone', phone: '+91 90000 00103', badge: 'FO-1047' },
  { id: 'off-pm', name: 'Priya Menon', department: DEPARTMENTS[4], zone: 'South Zone', phone: '+91 90000 00104', badge: 'FO-1052' },
  { id: 'off-ik', name: 'Imran Khan', department: DEPARTMENTS[3], zone: 'Central Zone', phone: '+91 90000 00105', badge: 'FO-1066' },
  { id: 'off-sd', name: 'Sana D’Souza', department: DEPARTMENTS[0], zone: 'North Zone', phone: '+91 90000 00106', badge: 'FO-1071' },
];

export const DEMO_REPORTER_ID = 'citizen-demo';

/** Labelled SVG placeholder used instead of real photos in seeded incidents. */
function demoImage(label: string, tone: string): MediaFile {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="#10161f"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><g fill="none" stroke="#ffffff22"><path d="M0 300 Q160 240 320 290 T640 270"/><path d="M0 330 Q200 280 360 320 T640 300"/></g><text x="24" y="44" font-family="monospace" font-size="16" fill="#ffffffaa">DEMO IMAGE · SIMULATED</text><text x="24" y="370" font-family="sans-serif" font-size="22" fill="#fff">${label}</text></svg>`;
  return {
    id: `demo-${label.replace(/\W+/g, '-').toLowerCase()}`,
    name: `${label}.svg`,
    kind: 'image',
    mimeType: 'image/svg+xml',
    sizeBytes: svg.length,
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    uploadedAt: new Date().toISOString(),
  };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAhead = localDay;

interface SeedSpec {
  id: string;
  text: string;
  address: string;
  lat: number;
  lng: number;
  reportedHoursAgo: number;
  category: IncidentCategory;
  severity: Severity;
  urgency: Urgency;
  media: MediaFile[];
}

function seedIncident(spec: SeedSpec): Incident {
  const complaint = {
    id: spec.id,
    originalText: spec.text,
    language: 'en' as const,
    location: { address: spec.address, lat: spec.lat, lng: spec.lng, simulated: true },
    timestamp: hoursAgo(spec.reportedHoursAgo),
    evidenceFiles: spec.media.map((m) => ({ ...m, phase: 'complaint' as const, uploadedAt: hoursAgo(spec.reportedHoursAgo) })),
    reporterName: 'Demo Citizen',
  };
  const analysis = mockAnalyze(complaint);
  analysis.category = spec.category;
  analysis.severity = spec.severity;
  analysis.urgency = spec.urgency;
  return {
    id: spec.id,
    complaint,
    analysis: { ...analysis, generatedAt: hoursAgo(spec.reportedHoursAgo - 0.1) },
    analysisState: 'done',
    status: 'Assessed',
    fieldUpdates: [],
    verifications: [],
    history: [
      { id: `${spec.id}-h1`, timestamp: complaint.timestamp, status: 'Reported', actor: 'Demo Citizen', role: 'citizen', note: 'Complaint submitted via citizen portal.' },
      { id: `${spec.id}-h2`, timestamp: hoursAgo(spec.reportedHoursAgo - 0.1), status: 'Assessed', actor: 'Intelligence Engine', role: 'system', note: 'Automated analysis completed.' },
    ],
    reporterId: DEMO_REPORTER_ID,
    isDemo: true,
    updatedAt: hoursAgo(spec.reportedHoursAgo - 0.1),
  };
}

export function createSeedIncidents(): Incident[] {
  // 1 — Critical, suspected stubble/biomass burning, under investigation.
  const i1 = seedIncident({
    id: 'ENV-DEMO-0001',
    text: 'Thick smoke from stubble burning in the farm fields behind the village every evening. Children are coughing and it is hard to breathe.',
    address: 'Farmland near Narela outskirts, North Delhi (demo location)',
    lat: 28.8521,
    lng: 77.0929,
    reportedHoursAgo: 30,
    category: 'Biomass / Stubble Burning',
    severity: 'Critical',
    urgency: 'Immediate',
    media: [demoImage('Smoke over farm fields', '#874e2b')],
  });
  i1.assignment = {
    department: DEPARTMENTS[1],
    officerId: 'off-ak',
    officerName: 'Aarav Kulkarni',
    deadline: daysAhead(1),
    priority: 'P1',
    assignedAt: hoursAgo(26),
    assignedBy: 'Admin (demo)',
    instructions: 'Confirm active burning, record extent, coordinate with crop-residue cell.',
  };
  i1.status = 'Under Investigation';
  i1.fieldUpdates = [
    {
      id: 'fu-1-1',
      officerId: 'off-ak',
      officerName: 'Aarav Kulkarni',
      timestamp: hoursAgo(20),
      type: 'inspection',
      inspectionNotes: 'Reached site 17:40. Two adjoining plots with smouldering residue.',
      observations: 'Visible smoke plume drifting south-east towards residential blocks.',
      actionTaken: 'Fire service informed; farmer counselled on residue management.',
      beforeMedia: [demoImage('Smouldering residue', '#5b3a24')],
      afterMedia: [],
    },
  ];
  i1.history.push(
    { id: 'h1-3', timestamp: hoursAgo(26), status: 'Allocated', actor: 'Admin (demo)', role: 'admin', note: `Assigned to Aarav Kulkarni · ${DEPARTMENTS[1]}` },
    { id: 'h1-4', timestamp: hoursAgo(20), status: 'Under Investigation', actor: 'Aarav Kulkarni', role: 'field', note: 'Inspection started on site.' },
  );
  i1.updatedAt = hoursAgo(20);

  // 2 — High, suspected industrial emissions, allocated.
  const i2 = seedIncident({
    id: 'ENV-DEMO-0002',
    text: 'Black smoke coming out of a factory chimney in the industrial area since early morning. Strong chemical smell in the lanes.',
    address: 'Industrial area near Wazirpur, North-West Delhi (demo location)',
    lat: 28.6985,
    lng: 77.1665,
    reportedHoursAgo: 9,
    category: 'Industrial Emissions',
    severity: 'High',
    urgency: 'High',
    media: [demoImage('Chimney plume', '#237acd')],
  });
  i2.assignment = {
    department: DEPARTMENTS[0],
    officerId: 'off-ns',
    officerName: 'Neha Sharma',
    deadline: daysAhead(2),
    priority: 'P2',
    assignedAt: hoursAgo(6),
    assignedBy: 'Admin (demo)',
    instructions: 'Inspect units within 1 km; check consent conditions and APCD operation.',
  };
  i2.status = 'Allocated';
  i2.history.push({ id: 'h2-3', timestamp: hoursAgo(6), status: 'Allocated', actor: 'Admin (demo)', role: 'admin', note: `Assigned to Neha Sharma · ${DEPARTMENTS[0]}` });
  i2.updatedAt = hoursAgo(6);

  // 3 — Resolved, suspected waste burning.
  const i3 = seedIncident({
    id: 'ENV-DEMO-0003',
    text: 'Garbage and plastic being burnt at the roadside dump near the landfill. Smoke enters our homes at night.',
    address: 'Roadside dump near Ghazipur, East Delhi (demo location)',
    lat: 28.6253,
    lng: 77.3268,
    reportedHoursAgo: 96,
    category: 'Waste Burning',
    severity: 'Medium',
    urgency: 'Moderate',
    media: [demoImage('Roadside waste fire', '#6ea0b1')],
  });
  i3.assignment = {
    department: DEPARTMENTS[2],
    officerId: 'off-rv',
    officerName: 'Rohan Verma',
    deadline: daysAhead(-2),
    priority: 'P3',
    assignedAt: hoursAgo(90),
    assignedBy: 'Admin (demo)',
  };
  i3.fieldUpdates = [
    {
      id: 'fu-3-1',
      officerId: 'off-rv',
      officerName: 'Rohan Verma',
      timestamp: hoursAgo(70),
      type: 'action_submission',
      inspectionNotes: 'Active waste fire on ~20 m² patch adjacent to drain.',
      observations: 'Mixed MSW including plastic. No collection for 4 days in the lane.',
      actionTaken: 'Fire doused, site cleared by sanitation crew, daily collection restored, signage installed.',
      beforeMedia: [demoImage('Before: waste fire', '#7a3b2e')],
      afterMedia: [demoImage('After: site cleared', '#2f6b4f')],
    },
  ];
  i3.status = 'Verified Closed';
  i3.closedAt = hoursAgo(60);
  i3.verifications = [{ decision: 'verified', note: 'Before/after evidence satisfactory. Closing.', at: hoursAgo(60), by: 'Admin (demo)' }];
  i3.history.push(
    { id: 'h3-3', timestamp: hoursAgo(90), status: 'Allocated', actor: 'Admin (demo)', role: 'admin', note: `Assigned to Rohan Verma · ${DEPARTMENTS[2]}` },
    { id: 'h3-4', timestamp: hoursAgo(80), status: 'Under Investigation', actor: 'Rohan Verma', role: 'field' },
    { id: 'h3-5', timestamp: hoursAgo(70), status: 'Action Submitted', actor: 'Rohan Verma', role: 'field', note: 'Corrective action submitted with before/after photos.' },
    { id: 'h3-6', timestamp: hoursAgo(70), status: 'Verification Pending', actor: 'System', role: 'system' },
    { id: 'h3-7', timestamp: hoursAgo(60), status: 'Verified Closed', actor: 'Admin (demo)', role: 'admin', note: 'Before/after evidence satisfactory. Closing.' },
  );
  i3.updatedAt = hoursAgo(60);

  // 4 — Medium, construction dust, awaiting verification (lets the demo show review immediately).
  const i4 = seedIncident({
    id: 'ENV-DEMO-0004',
    text: 'Construction site with uncovered sand and cement, dust blowing onto the main road all day.',
    address: 'Construction site near Saket, South Delhi (demo location)',
    lat: 28.5245,
    lng: 77.2066,
    reportedHoursAgo: 50,
    category: 'Construction Dust',
    severity: 'Medium',
    urgency: 'Moderate',
    media: [],
  });
  i4.assignment = {
    department: DEPARTMENTS[4],
    officerId: 'off-pm',
    officerName: 'Priya Menon',
    deadline: daysAhead(1),
    priority: 'P3',
    assignedAt: hoursAgo(44),
    assignedBy: 'Admin (demo)',
  };
  i4.fieldUpdates = [
    {
      id: 'fu-4-1',
      officerId: 'off-pm',
      officerName: 'Priya Menon',
      timestamp: hoursAgo(4),
      type: 'action_submission',
      inspectionNotes: 'Sand and aggregate stockpiles uncovered; no wind barriers on road side.',
      observations: 'Dust visible on carriageway; sprinklers not operational.',
      actionTaken: 'Directed contractor to cover stockpiles and run sprinklers; barrier installation started.',
      beforeMedia: [demoImage('Before: uncovered stockpile', '#6b5a3a')],
      afterMedia: [demoImage('After: covered stockpile', '#3f5f55')],
    },
  ];
  i4.status = 'Verification Pending';
  i4.history.push(
    { id: 'h4-3', timestamp: hoursAgo(44), status: 'Allocated', actor: 'Admin (demo)', role: 'admin', note: `Assigned to Priya Menon · ${DEPARTMENTS[4]}` },
    { id: 'h4-4', timestamp: hoursAgo(30), status: 'Under Investigation', actor: 'Priya Menon', role: 'field' },
    { id: 'h4-5', timestamp: hoursAgo(4), status: 'Action Submitted', actor: 'Priya Menon', role: 'field', note: 'Corrective action submitted.' },
    { id: 'h4-6', timestamp: hoursAgo(4), status: 'Verification Pending', actor: 'System', role: 'system' },
  );
  i4.updatedAt = hoursAgo(4);

  // 5 — Low, vehicular emissions, assessed but not yet allocated.
  const i5 = seedIncident({
    id: 'ENV-DEMO-0005',
    text: 'Heavy truck traffic jam with diesel exhaust near the flyover during morning hours.',
    address: 'Flyover junction near ITO, Central Delhi (demo location)',
    lat: 28.6289,
    lng: 77.2411,
    reportedHoursAgo: 3,
    category: 'Vehicular Emissions',
    severity: 'Low',
    urgency: 'Low',
    media: [],
  });

  return [i1, i2, i3, i4, i5];
}
