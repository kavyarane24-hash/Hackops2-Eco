import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ClipboardCheck, MapPin, Navigation, Save, Send } from 'lucide-react';
import type { MediaFile } from '@/types';
import { useIncidentStore, OFFICERS } from '@/context/IncidentStore';
import { toast, useUI } from '@/context/uiStore';
import { Panel, EmptyState, Field } from '@/components/common/Panel';
import { MediaUploader, MediaGrid } from '@/components/common/Media';
import { SeverityBadge, StatusBadge, UrgencyBadge } from '@/components/common/Badges';
import { AIAnalysisPanel, AnalysisState, EvidenceList } from '@/components/incidents/AnalysisPanels';
import { FieldUpdateList, Timeline } from '@/components/incidents/Workflow';
import { OfficerCard } from '@/components/effects/OfficerCard';
import { OPEN_STATUSES, SEVERITY_RANK } from '@/config/constants';
import { useReveal } from '@/hooks/motion';
import { daysUntil, fmtDate, isValidCoord } from '@/utils';
import { cn } from '@/lib/utils';

const ACTIONABLE = ['Allocated', 'Under Investigation', 'Reopened'];

export default function FieldOfficerDashboard() {
  const scope = useRef<HTMLDivElement>(null);
  const { fieldOfficerId, setFieldOfficer } = useUI();
  useReveal(scope, [fieldOfficerId]);
  const officer = OFFICERS.find((o) => o.id === fieldOfficerId) ?? OFFICERS[0];
  const incidents = useIncidentStore((s) => s.incidents);
  const { addFieldUpdate, submitFieldAction, updateIncidentStatus } = useIncidentStore();

  const mine = useMemo(
    () =>
      incidents
        .filter((i) => i.assignment?.officerId === officer.id)
        .sort((a, b) => {
          const openA = OPEN_STATUSES.includes(a.status) ? 1 : 0;
          const openB = OPEN_STATUSES.includes(b.status) ? 1 : 0;
          if (openA !== openB) return openB - openA;
          return SEVERITY_RANK[b.analysis?.severity ?? 'Low'] - SEVERITY_RANK[a.analysis?.severity ?? 'Low'];
        }),
    [incidents, officer.id],
  );
  const [caseId, setCaseId] = useState<string | undefined>();
  const current = mine.find((i) => i.id === caseId) ?? mine[0];
  const [view, setView] = useState<'act' | 'analysis' | 'history'>('act');

  const [notes, setNotes] = useState('');
  const [observations, setObservations] = useState('');
  const [action, setAction] = useState('');
  const [before, setBefore] = useState<MediaFile[]>([]);
  const [after, setAfter] = useState<MediaFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setNotes('');
    setObservations('');
    setAction('');
    setBefore([]);
    setAfter([]);
    setErrors({});
  };

  const canAct = current && ACTIONABLE.includes(current.status);

  const payload = () => ({
    officerId: officer.id,
    officerName: officer.name,
    inspectionNotes: notes.trim(),
    observations: observations.trim(),
    actionTaken: action.trim(),
    beforeMedia: before.map((m) => ({ ...m, phase: 'before' as const })),
    afterMedia: after.map((m) => ({ ...m, phase: 'after' as const })),
  });

  const saveInspection = () => {
    if (!current) return;
    if (notes.trim().length < 5 && observations.trim().length < 5) {
      setErrors({ notes: 'Add inspection notes or observations before saving.' });
      return;
    }
    addFieldUpdate(current.id, payload());
    toast('Inspection update saved');
    resetForm();
  };

  const submitAction = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const errs: Record<string, string> = {};
    if (notes.trim().length < 5) errs.notes = 'Inspection notes are required (5+ characters).';
    if (action.trim().length < 5) errs.action = 'Describe the action taken (5+ characters).';
    if (after.length === 0) errs.after = 'Upload at least one after-action photo or video.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    submitFieldAction(current.id, payload());
    toast(`${current.id} submitted for admin verification`);
    resetForm();
  };

  return (
    <div ref={scope} className="space-y-5">
      <div className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Field operations</p>
          <h1 className="page-title">Assigned cases</h1>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-400">Signed in as (demo)</span>
          <select
            className="input !w-auto"
            value={officer.id}
            onChange={(e) => {
              setFieldOfficer(e.target.value);
              setCaseId(undefined);
              resetForm();
            }}
          >
            {OFFICERS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({incidents.filter((i) => i.assignment?.officerId === o.id && OPEN_STATUSES.includes(i.status)).length} open)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="panel reveal p-4">
            <OfficerCard
              officer={officer}
              assignment={current?.assignment}
              openCases={mine.filter((i) => OPEN_STATUSES.includes(i.status)).length}
              progressLabel={`${mine.filter((i) => i.status === 'Verified Closed').length} closed · ${mine.filter((i) => i.status === 'Verification Pending').length} awaiting review`}
            />
          </div>
          <Panel title="My cases" eyebrow={`${mine.length} assigned`} bodyClassName="p-0">
            {mine.length === 0 ? (
              <EmptyState title="No cases assigned" body="Cases appear here once an administrator assigns them to you." />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {mine.map((i) => {
                  const due = daysUntil(i.assignment?.deadline);
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => {
                          setCaseId(i.id);
                          resetForm();
                          setView('act');
                        }}
                        className={cn('w-full px-4 py-3 text-left transition-colors hover:bg-ink-800/60', current?.id === i.id && 'bg-accent-soft')}
                        aria-current={current?.id === i.id}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="num text-sm font-semibold">{i.id}</span>
                          {i.analysis && <SeverityBadge severity={i.analysis.severity} />}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <StatusBadge status={i.status} />
                          {i.status !== 'Verified Closed' && due != null && (
                            <span className={cn('num text-[11px]', due < 0 ? 'text-sev-critical' : due <= 1 ? 'text-sev-medium' : 'text-ink-400')}>
                              {due < 0 ? `${-due}d overdue` : due === 0 ? 'Due today' : `Due in ${due}d`}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>

        {!current ? (
          <Panel title="Case details">
            <EmptyState title="Select a case" body="Choose a case on the left to see its details." />
          </Panel>
        ) : (
          <div className="space-y-5">
            <Panel
              title={<span className="num">{current.id}</span>}
              eyebrow={current.analysis?.category}
              actions={
                <div className="flex flex-wrap gap-1.5">
                  {current.analysis && <SeverityBadge severity={current.analysis.severity} />}
                  {current.analysis && <UrgencyBadge urgency={current.analysis.urgency} />}
                  <StatusBadge status={current.status} />
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <p className="text-sm text-ink-100" lang={current.complaint.language}>{current.complaint.originalText}</p>
                  <p className="flex items-start gap-1.5 text-xs text-ink-300">
                    <MapPin size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {current.complaint.location.address}
                    {isValidCoord(current.complaint.location.lat, current.complaint.location.lng) && (
                      <span className="num text-ink-500"> · {current.complaint.location.lat!.toFixed(4)}, {current.complaint.location.lng!.toFixed(4)}</span>
                    )}
                  </p>
                  {current.assignment?.instructions && (
                    <p className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-xs text-ink-200">
                      <strong className="text-accent">Admin instructions:</strong> {current.assignment.instructions}
                    </p>
                  )}
                  <p className="text-xs text-ink-400">
                    Deadline {fmtDate(current.assignment?.deadline)} · {current.assignment?.priority} · {current.assignment?.department}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {isValidCoord(current.complaint.location.lat, current.complaint.location.lng) && (
                    <a
                      className="btn btn-ghost"
                     
                      href={`https://www.openstreetmap.org/directions?to=${current.complaint.location.lat}%2C${current.complaint.location.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={15} aria-hidden /> Navigate
                    </a>
                  )}
                  {current.status === 'Allocated' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        updateIncidentStatus(current.id, 'Under Investigation', 'Officer started on-site investigation.', { name: officer.name, role: 'field' });
                        toast('Investigation started');
                      }}
                    >
                      Start investigation
                    </button>
                  )}
                </div>
              </div>
              {current.complaint.evidenceFiles.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Citizen evidence</p>
                  <MediaGrid media={current.complaint.evidenceFiles} />
                </div>
              )}
            </Panel>

            <div role="tablist" aria-label="Case sections" className="reveal flex gap-1 rounded-xl border border-[var(--line)] bg-ink-900/70 p-1">
              {([['act', 'Inspection & action'], ['analysis', 'AI analysis & evidence'], ['history', 'History']] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm', view === k ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100')}>
                  {label}
                </button>
              ))}
            </div>

            {view === 'act' && (
              <>
                {canAct ? (
                  <Panel title="Record inspection & corrective action" eyebrow="Officers submit for verification; only admins close cases">
                    <form onSubmit={submitAction} noValidate className="space-y-4">
                      <Field label="Inspection notes" htmlFor="f-notes" required error={errors.notes}>
                        <textarea id="f-notes" rows={3} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!errors.notes} placeholder="Time of arrival, what you found on site…" />
                      </Field>
                      <Field label="Observations" htmlFor="f-obs">
                        <textarea id="f-obs" rows={2} className="input" value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Plume direction, source identified, people affected…" />
                      </Field>
                      <Field label="Action taken" htmlFor="f-action" required error={errors.action}>
                        <textarea id="f-action" rows={2} className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-invalid={!!errors.action} placeholder="Fire doused, notice issued, site cleared…" />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="field-label">Before photos / videos</p>
                          <MediaUploader id="f-before" value={before} onChange={setBefore} phase="before" label="Add before evidence" />
                        </div>
                        <div>
                          <p className="field-label">
                            After photos / videos <span className="text-sev-critical" aria-hidden>*</span>
                          </p>
                          <MediaUploader id="f-after" value={after} onChange={setAfter} phase="after" label="Add after evidence" />
                          {errors.after && <p role="alert" className="mt-1 text-xs text-[#fca5a5]">{errors.after}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-ghost" onClick={saveInspection}>
                          <Save size={15} aria-hidden /> Save inspection update
                        </button>
                        <button type="submit" className="btn btn-primary">
                          <Send size={15} aria-hidden /> Submit for verification
                        </button>
                      </div>
                    </form>
                  </Panel>
                ) : (
                  <Panel title="Inspection & action">
                    <div className="flex items-start gap-3 text-sm text-ink-300">
                      <ClipboardCheck size={18} className="mt-0.5 text-accent" aria-hidden />
                      {current.status === 'Verification Pending' || current.status === 'Action Submitted'
                        ? 'Your action has been submitted and is awaiting admin verification.'
                        : current.status === 'Verified Closed'
                          ? 'This case has been verified and closed by the administrator.'
                          : 'This case is not open for field action.'}
                    </div>
                  </Panel>
                )}
                {current.verifications.length > 0 && current.verifications[current.verifications.length - 1].decision !== 'verified' && (
                  <div className="panel border-sev-medium/40 px-4 py-3 text-sm">
                    <p className="font-medium text-sev-medium">Admin feedback</p>
                    <p className="text-ink-200">{current.verifications[current.verifications.length - 1].note}</p>
                  </div>
                )}
                <Panel title="Action history" eyebrow={`${current.fieldUpdates.length} updates`}>
                  <FieldUpdateList updates={current.fieldUpdates} />
                </Panel>
              </>
            )}
            {view === 'analysis' && (
              <Panel title="AI analysis & supporting evidence">
                {current.analysis ? (
                  <div className="space-y-6">
                    <AIAnalysisPanel analysis={current.analysis} />
                    <div>
                      <h3 className="eyebrow mb-2">Supporting evidence</h3>
                      <EvidenceList evidence={current.analysis.supportingEvidence} />
                    </div>
                  </div>
                ) : (
                  <AnalysisState incident={current} />
                )}
              </Panel>
            )}
            {view === 'history' && (
              <Panel title="Case history">
                <Timeline history={current.history} />
              </Panel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
