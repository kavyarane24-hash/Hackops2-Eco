// Activity timeline derived from stored records only. Days appear only when
// something was actually recorded on them; nothing is interpolated.
import type { EnvironmentalReading, ImportBatch, Incident, IncidentStatus, MeasureKey } from '@/types';

export type EventType = 'complaint' | 'import' | 'assessed' | 'assigned' | 'inspection' | 'verification' | 'resolved';

export const EVENT_META: Record<EventType, { label: string; color: string }> = {
  complaint: { label: 'Complaint submitted', color: '#2563a8' },
  import: { label: 'Data imported', color: '#2f6f86' },
  assessed: { label: 'Incident assessed', color: '#5b6b70' },
  assigned: { label: 'Action assigned', color: '#087f8c' },
  inspection: { label: 'Inspection recorded', color: '#b07800' },
  verification: { label: 'Verification', color: '#7456a8' },
  resolved: { label: 'Incident resolved', color: '#1f8a5b' },
};

export interface TimelineEvent {
  id: string;
  timestamp: string;
  day: string;
  type: EventType;
  description: string;
  incidentId?: string;
  location?: string;
  status?: IncidentStatus;
}

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', opts);
};

const STATUS_TYPE: Partial<Record<IncidentStatus, EventType>> = {
  Assessed: 'assessed',
  Allocated: 'assigned',
  'Under Investigation': 'inspection',
  'Action Submitted': 'verification',
  'Verified Closed': 'resolved',
  Reopened: 'verification',
};

/** Builds events from incident histories, field updates and import batches. */
export function buildEvents(incidents: Incident[], imports: ImportBatch[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const i of incidents) {
    const loc = i.complaint.location.address || undefined;
    for (const h of i.history) {
      let type: EventType | undefined;
      if (h.status === 'Reported') type = i.source === 'data_import' ? 'assessed' : 'complaint';
      else if (h.status === 'Verification Pending') continue; // system echo of "Action Submitted"
      else if (h.status === 'Under Investigation' && h.role === 'admin') type = 'verification'; // reject / send back
      else type = STATUS_TYPE[h.status];
      if (!type) continue;
      // Field inspections are added from fieldUpdates below with richer text.
      if (type === 'inspection' && h.note === 'Inspection update recorded.') continue;
      out.push({
        id: `${i.id}-${h.id}`,
        timestamp: h.timestamp,
        day: dayKey(h.timestamp),
        type,
        description: h.status === 'Reported' && i.source === 'data_import' ? `Incident created from imported data. ${h.note ?? ''}`.trim() : `${h.status}${h.note ? ` — ${h.note}` : ''} (${h.actor})`,
        incidentId: i.id,
        location: loc,
        status: i.status,
      });
    }
    for (const u of i.fieldUpdates.filter((f) => f.type === 'inspection')) {
      out.push({
        id: `${i.id}-${u.id}`,
        timestamp: u.timestamp,
        day: dayKey(u.timestamp),
        type: 'inspection',
        description: `${u.officerName}: ${u.inspectionNotes || u.observations || 'Inspection update'}`.slice(0, 180),
        incidentId: i.id,
        location: loc,
        status: i.status,
      });
    }
  }
  for (const b of imports) {
    out.push({
      id: b.id,
      timestamp: b.createdAt,
      day: dayKey(b.createdAt),
      type: 'import',
      description: `${b.fileNames.join(', ')}: ${b.readings.length} record(s) imported${b.documents.length ? `, ${b.documents.length} document(s)` : ''}${b.evidence.length ? `, ${b.evidence.length} image(s)` : ''}.`,
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function groupByDay(events: TimelineEvent[]) {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) map.set(e.day, [...(map.get(e.day) ?? []), e]);
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, list]) => ({ day, events: list }));
}

export interface ReadingDay {
  day: string;
  observations: number;
  stations: string[];
  pollutants: { key: MeasureKey; unit: string; count: number; min: number; max: number; mean: number }[];
  readings: EnvironmentalReading[];
}

/** Days on which environmental readings were recorded (by measurement timestamp). */
export function readingDays(imports: ImportBatch[]): ReadingDay[] {
  const map = new Map<string, EnvironmentalReading[]>();
  for (const r of imports.flatMap((b) => b.readings)) map.set(dayKey(r.timestamp), [...(map.get(dayKey(r.timestamp)) ?? []), r]);
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, rs]) => {
    const keys = [...new Set(rs.flatMap((r) => Object.keys(r.values)))] as MeasureKey[];
    return {
      day,
      observations: rs.length,
      stations: [...new Set(rs.map((r) => r.station))],
      readings: rs,
      pollutants: keys.map((k) => {
        const v = rs.map((r) => r.values[k]).filter((x): x is number => x != null);
        return { key: k, unit: rs.find((r) => r.units[k])?.units[k] ?? '', count: v.length, min: Math.min(...v), max: Math.max(...v), mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 };
      }),
    };
  });
}
