// Shared incident store. All four dashboards read and write through these
// actions, so a change made in one view is visible in every other view at once.
// Persisted to localStorage so the demo survives a page reload.
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  AppNotification,
  Assignment,
  ComplaintInput,
  FieldUpdate,
  HistoryEntry,
  ImportBatch,
  Incident,
  IncidentReport,
  IncidentStatus,
  PotentialIncident,
  Role,
} from '@/types';
import { analyseBatch } from '@/services/analysis';
import { analyzeComplaint, uploadImage } from '@/services/api';
import { OFFICERS, DEMO_REPORTER_ID } from '@/services/mockData';
import { complaintId, uid } from '@/utils';
import { toast } from './uiStore';

interface Actor {
  name: string;
  role: Role | 'system';
}

export interface SubmitComplaintPayload extends Omit<ComplaintInput, 'id' | 'timestamp'> {}

interface IncidentState {
  incidents: Incident[];
  notifications: AppNotification[];
  submitComplaint: (payload: SubmitComplaintPayload) => Promise<string>;
  retryAnalysis: (id: string) => Promise<void>;
  allocateIncident: (id: string, assignment: Omit<Assignment, 'assignedAt' | 'officerName'>, actor?: Actor) => void;
  addFieldUpdate: (id: string, update: Omit<FieldUpdate, 'id' | 'timestamp' | 'type'>) => void;
  submitFieldAction: (id: string, update: Omit<FieldUpdate, 'id' | 'timestamp' | 'type'>) => void;
  closeIncident: (id: string, note: string, actor?: Actor) => void;
  rejectAction: (id: string, note: string, actor?: Actor) => void;
  requestFurtherInvestigation: (id: string, note: string, actor?: Actor) => void;
  reopenIncident: (id: string, note: string, actor?: Actor) => void;
  updateIncidentStatus: (id: string, status: IncidentStatus, note?: string, actor?: Actor) => void;
  markNotificationsRead: (role: Role) => void;
  resetDemo: () => void;

  // Data import & reports
  imports: ImportBatch[];
  potentials: PotentialIncident[];
  reports: IncidentReport[];
  /** Stores a confirmed import batch and runs the preliminary analysis on it. Returns new potential incidents. */
  importEnvironmentalData: (batch: ImportBatch) => PotentialIncident[];
  createPotentialIncident: (p: PotentialIncident) => void;
  /** Turns a reviewed potential incident into a shared incident (status Assessed). */
  approveIncident: (potentialId: string, overrides: { title?: string; lat: number | null; lng: number | null; address?: string; note?: string }) => string | null;
  dismissPotential: (potentialId: string, reason: string) => void;
  generateIncidentReport: (incidentId: string, by?: string) => IncidentReport | null;
}

const ADMIN: Actor = { name: 'Admin', role: 'admin' };
const now = () => new Date().toISOString();

function entry(status: IncidentStatus, actor: Actor, note?: string): HistoryEntry {
  return { id: uid('h'), timestamp: now(), status, actor: actor.name, role: actor.role, note };
}

function notify(roles: Role[], incidentId: string, message: string): AppNotification[] {
  return roles.map((role) => ({ id: uid('n'), role, incidentId, message, at: now(), read: false }));
}

/** localStorage wrapper that never throws (private mode, quota exceeded). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      console.warn('Demo store could not be saved (storage full or blocked). Changes stay in memory only.');
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useIncidentStore = create<IncidentState>()(
  persist(
    (set, get) => {
      const patch = (id: string, fn: (i: Incident) => Partial<Incident>, notes: AppNotification[] = []) =>
        set((s) => ({
          incidents: s.incidents.map((i) => (i.id === id ? { ...i, ...fn(i), updatedAt: now() } : i)),
          notifications: [...notes, ...s.notifications].slice(0, 60),
        }));

      const runAnalysis = async (id: string) => {
        const inc = get().incidents.find((i) => i.id === id);
        if (!inc) return;
        try {
          const analysis = await analyzeComplaint(inc.complaint, get().imports.flatMap((b) => b.readings));
          patch(
            id,
            (i) => ({
              analysis,
              analysisState: 'done',
              status: i.status === 'Reported' ? 'Assessed' : i.status,
              history:
                i.status === 'Reported'
                  ? [...i.history, entry('Assessed', { name: 'Intelligence Engine', role: 'system' }, `Automated analysis: ${analysis.category}, ${analysis.severity} severity.`)]
                  : i.history,
            }),
            notify(['admin'], id, `${id} assessed as ${analysis.severity} · ${analysis.category}`),
          );
        } catch {
          patch(id, () => ({ analysisState: 'failed' }));
          toast('Analysis failed. You can retry from the incident panel.', 'error');
        }
      };

      return {
        incidents: [],
        notifications: [],
        imports: [],
        potentials: [],
        reports: [],

        importEnvironmentalData: (batch) => {
          const found = analyseBatch(batch, get().incidents);
          set((s) => ({ imports: [batch, ...s.imports], potentials: [...found, ...s.potentials] }));
          return found;
        },

        createPotentialIncident: (p) => set((s) => ({ potentials: [p, ...s.potentials] })),

        dismissPotential: (potentialId, reason) =>
          set((s) => ({ potentials: s.potentials.map((p) => (p.id === potentialId ? { ...p, status: 'dismissed', missingInformation: [`Dismissed: ${reason}`, ...p.missingInformation] } : p)) })),

        approveIncident: (potentialId, o) => {
          const pot = get().potentials.find((p) => p.id === potentialId);
          if (!pot || pot.status !== 'pending') return null;
          const batch = get().imports.find((b) => b.id === pot.batchId);
          const id = complaintId();
          const ts = now();
          const location = { address: o.address?.trim() || pot.location.address, lat: o.lat, lng: o.lng };
          const incident: Incident = {
            id,
            source: 'data_import',
            importRef: { batchId: pot.batchId, potentialId, fileNames: batch?.fileNames ?? [], readingIds: pot.readingIds },
            complaint: {
              id,
              originalText: `${o.title?.trim() || pot.title}. ${pot.analysis.summary}`,
              language: 'en',
              location,
              timestamp: ts,
              evidenceFiles: batch?.evidence ?? [],
              reporterName: 'Data import (admin)',
            },
            analysis: { ...pot.analysis },
            analysisState: 'done',
            status: 'Assessed',
            fieldUpdates: [],
            verifications: [],
            history: [
              entry('Reported', { name: 'Data import', role: 'system' }, `Potential incident detected in ${(batch?.fileNames ?? []).join(', ')}.`),
              entry('Assessed', ADMIN, `Approved by administrator after review.${o.note ? ' ' + o.note : ''}`),
            ],
            reporterId: 'system-import',
            isDemo: false,
            updatedAt: ts,
          };
          set((s) => ({
            incidents: [incident, ...s.incidents],
            potentials: s.potentials.map((p) => (p.id === potentialId ? { ...p, status: 'approved', incidentId: id } : p)),
            notifications: [...notify(['admin', 'stakeholder'], id, `Incident ${id} created from imported data`), ...s.notifications].slice(0, 60),
          }));
          return id;
        },

        generateIncidentReport: (incidentId, by = 'Admin') => {
          const incident = get().incidents.find((i) => i.id === incidentId);
          if (!incident) return null;
          const potential = incident.importRef ? get().potentials.find((p) => p.id === incident.importRef!.potentialId) : undefined;
          const batch = incident.importRef ? get().imports.find((b) => b.id === incident.importRef!.batchId) : undefined;
          const readingIds = new Set(incident.importRef?.readingIds ?? []);
          const readings = (batch?.readings ?? []).filter((r) => readingIds.has(r.id));
          const prior = get().reports.filter((r) => r.incidentId === incidentId);
          const sources = [
            incident.source === 'data_import' ? `Imported files: ${(batch?.fileNames ?? []).join(', ') || 'n/a'}` : 'Citizen complaint',
            incident.isDemo ? 'Seeded demonstration data' : null,
            incident.analysis ? (incident.analysis.generatedBy === 'backend-ai' ? 'Backend AI analysis' : 'In-browser rule-based assessment (mock, not an AI model)') : null,
            incident.fieldUpdates.length ? `${incident.fieldUpdates.length} field officer update(s)` : null,
            incident.verifications.length ? 'Administrator verification records' : null,
          ].filter(Boolean) as string[];
          const report: IncidentReport = {
            id: `RPT-${incidentId}-v${prior.length + 1}`,
            incidentId,
            version: prior.length + 1,
            generatedAt: now(),
            generatedBy: by,
            status: incident.status === 'Verified Closed' ? 'Final' : 'Draft',
            incidentStatusAtGeneration: incident.status,
            dataSources: sources,
            snapshot: {
              incident: JSON.parse(JSON.stringify(incident)),
              readings: readings.slice(0, 2000),
              daily: potential?.daily ?? [],
              documents: batch?.documents ?? [],
              potential,
            },
          };
          set((s) => ({ reports: [report, ...s.reports] }));
          return report;
        },

        submitComplaint: async (payload) => {
          const id = complaintId();
          const timestamp = now();
          // Best-effort backend storage for images (no-op in mock mode).
          const evidenceFiles = await Promise.all(
            payload.evidenceFiles.map(async (m) =>
              m.kind === 'image' ? { ...m, backendRef: await uploadImage(m.url, m.name) } : m,
            ),
          );
          const incident: Incident = {
            id,
            complaint: { ...payload, evidenceFiles, id, timestamp },
            analysis: null,
            analysisState: 'pending',
            status: 'Reported',
            fieldUpdates: [],
            verifications: [],
            history: [entry('Reported', { name: payload.reporterName || 'Citizen', role: 'citizen' }, 'Complaint submitted via citizen portal.')],
            reporterId: DEMO_REPORTER_ID,
            isDemo: false,
            updatedAt: timestamp,
          };
          set((s) => ({
            incidents: [incident, ...s.incidents],
            notifications: [...notify(['admin', 'stakeholder'], id, `New complaint ${id} reported`), ...s.notifications].slice(0, 60),
          }));
          void runAnalysis(id);
          return id;
        },

        retryAnalysis: async (id) => {
          patch(id, () => ({ analysisState: 'pending' }));
          await runAnalysis(id);
        },

        allocateIncident: (id, a, actor = ADMIN) => {
          const officer = OFFICERS.find((o) => o.id === a.officerId);
          const assignment: Assignment = { ...a, officerName: officer?.name ?? 'Unassigned', assignedAt: now(), assignedBy: actor.name };
          patch(
            id,
            (i) => ({
              assignment,
              status: 'Allocated',
              history: [...i.history, entry('Allocated', actor, `Assigned to ${assignment.officerName} · ${a.department} · due ${a.deadline} · ${a.priority}`)],
            }),
            notify(['field', 'stakeholder', 'citizen'], id, `${id} allocated to ${assignment.officerName}`),
          );
        },

        addFieldUpdate: (id, u) => {
          const update: FieldUpdate = { ...u, id: uid('fu'), timestamp: now(), type: 'inspection' };
          patch(id, (i) => ({
            fieldUpdates: [...i.fieldUpdates, update],
            status: ['Allocated', 'Reopened'].includes(i.status) ? 'Under Investigation' : i.status,
            history: [
              ...i.history,
              entry(['Allocated', 'Reopened'].includes(i.status) ? 'Under Investigation' : i.status, { name: u.officerName, role: 'field' }, 'Inspection update recorded.'),
            ],
          }), notify(['admin'], id, `${u.officerName} added an inspection update on ${id}`));
        },

        submitFieldAction: (id, u) => {
          const update: FieldUpdate = { ...u, id: uid('fu'), timestamp: now(), type: 'action_submission' };
          const officer = { name: u.officerName, role: 'field' as const };
          patch(
            id,
            (i) => ({
              fieldUpdates: [...i.fieldUpdates, update],
              status: 'Verification Pending',
              history: [
                ...i.history,
                entry('Action Submitted', officer, 'Corrective action submitted for verification.'),
                entry('Verification Pending', { name: 'System', role: 'system' }),
              ],
            }),
            notify(['admin', 'stakeholder'], id, `${id}: action submitted for verification`),
          );
        },

        closeIncident: (id, note, actor = ADMIN) =>
          patch(
            id,
            (i) => ({
              status: 'Verified Closed',
              closedAt: now(),
              verifications: [...i.verifications, { decision: 'verified', note, at: now(), by: actor.name }],
              history: [...i.history, entry('Verified Closed', actor, note || 'Action verified; incident closed.')],
            }),
            notify(['citizen', 'stakeholder', 'field'], id, `${id} verified and closed`),
          ),

        rejectAction: (id, note, actor = ADMIN) =>
          patch(
            id,
            (i) => ({
              status: 'Under Investigation',
              verifications: [...i.verifications, { decision: 'rejected', note, at: now(), by: actor.name }],
              history: [...i.history, entry('Under Investigation', actor, `Action rejected: ${note}`)],
            }),
            notify(['field', 'stakeholder'], id, `${id}: submitted action rejected`),
          ),

        requestFurtherInvestigation: (id, note, actor = ADMIN) =>
          patch(
            id,
            (i) => ({
              status: 'Under Investigation',
              verifications: [...i.verifications, { decision: 'further_investigation', note, at: now(), by: actor.name }],
              history: [...i.history, entry('Under Investigation', actor, `Further investigation requested: ${note}`)],
            }),
            notify(['field'], id, `${id}: further investigation requested`),
          ),

        reopenIncident: (id, note, actor = ADMIN) =>
          patch(
            id,
            (i) => ({
              status: 'Reopened',
              closedAt: undefined,
              verifications: [...i.verifications, { decision: 'reopened', note, at: now(), by: actor.name }],
              history: [...i.history, entry('Reopened', actor, note || 'Incident reopened.')],
            }),
            notify(['field', 'stakeholder', 'citizen'], id, `${id} reopened`),
          ),

        updateIncidentStatus: (id, status, note, actor = ADMIN) =>
          patch(id, (i) => ({ status, history: [...i.history, entry(status, actor, note)] })),

        markNotificationsRead: (role) =>
          set((s) => ({ notifications: s.notifications.map((n) => (n.role === role ? { ...n, read: true } : n)) })),

        resetDemo: () => set({ incidents: [], notifications: [], imports: [], potentials: [], reports: [] }),
      };
    },
    {
      name: 'enviro-intel-store-v1',
      storage: createJSONStorage(() => safeStorage),
      // v2: seeded demo incidents removed. Drop them from saved state, keep real records.
      version: 2,
      migrate: (persisted) => {
        const st = persisted as { incidents?: Incident[]; notifications?: { incidentId: string }[] };
        const demoIds = new Set((st.incidents ?? []).filter((i) => i.isDemo).map((i) => i.id));
        return {
          ...st,
          incidents: (st.incidents ?? []).filter((i) => !i.isDemo),
          notifications: (st.notifications ?? []).filter((n) => !demoIds.has(n.incidentId)),
        } as never;
      },
      partialize: (s) => ({
        // blob: URLs (videos) don't survive reloads; mark them so the UI can explain.
        incidents: s.incidents,
        notifications: s.notifications,
        imports: s.imports,
        potentials: s.potentials,
        reports: s.reports,
      }),
      onRehydrateStorage: () => (state) => {
        state?.incidents.forEach((i) => {
          if (i.analysisState === 'pending') void state.retryAnalysis(i.id);
        });
      },
    },
  ),
);

export { OFFICERS };
