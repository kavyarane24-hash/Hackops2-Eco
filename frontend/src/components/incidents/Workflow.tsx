import { useState, type FormEvent } from 'react';
import { CheckCircle2, RotateCcw, Search, Send, XCircle } from 'lucide-react';
import type { FieldUpdate, HistoryEntry, Incident, Priority } from '@/types';
import { CATEGORY_DEPARTMENT, DEPARTMENTS, PRIORITIES, STATUS_TONE } from '@/config/constants';
import { OFFICERS, useIncidentStore } from '@/context/IncidentStore';
import { toast } from '@/context/uiStore';
import { Field } from '@/components/common/Panel';
import { MediaGrid } from '@/components/common/Media';
import { Modal } from '@/components/common/Overlay';
import { fmtDateTime, localDay } from '@/utils';

export function Timeline({ history }: { history: HistoryEntry[] }) {
  const items = [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <ol className="relative space-y-3.5 border-l-2 border-[var(--line)] pl-5">
      {items.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ring-1 ring-[var(--line-strong)]" style={{ background: STATUS_TONE[h.status] }} aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold" style={{ color: STATUS_TONE[h.status] }}>{h.status}</span>
            <span className="num text-[11px] text-ink-400">{fmtDateTime(h.timestamp)}</span>
          </div>
          <p className="text-xs text-ink-100 font-medium">
            {h.actor} <span className="text-ink-400">({h.role})</span>
            {h.note && <> · {h.note}</>}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function FieldUpdateList({ updates }: { updates: FieldUpdate[] }) {
  if (!updates.length) return <p className="text-sm text-ink-400">No field updates yet.</p>;
  return (
    <ul className="space-y-3">
      {[...updates].reverse().map((u) => (
        <li key={u.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
            <span className="text-sm font-bold text-ink-100">
              {u.type === 'action_submission' ? 'Action submitted for verification' : 'Inspection update'}
            </span>
            <span className="num text-[11px] text-ink-200 font-medium">{u.officerName} · {fmtDateTime(u.timestamp)}</span>
          </div>
          <dl className="mt-2.5 grid gap-2.5 text-xs sm:grid-cols-3">
            <div><dt className="font-bold text-ink-200">Inspection notes</dt><dd className="mt-0.5 text-ink-100">{u.inspectionNotes || '—'}</dd></div>
            <div><dt className="font-bold text-ink-200">Observations</dt><dd className="mt-0.5 text-ink-100">{u.observations || '—'}</dd></div>
            <div><dt className="font-bold text-ink-200">Action taken</dt><dd className="mt-0.5 text-ink-100 font-medium">{u.actionTaken || '—'}</dd></div>
          </dl>
          {(u.beforeMedia.length > 0 || u.afterMedia.length > 0) && <MediaGrid media={[...u.beforeMedia, ...u.afterMedia]} className="mt-3" />}
        </li>
      ))}
    </ul>
  );
}

const inDays = localDay;

export function AllocationForm({ incident, onDone }: { incident: Incident; onDone?: () => void }) {
  const allocate = useIncidentStore((s) => s.allocateIncident);
  const suggested = incident.analysis ? CATEGORY_DEPARTMENT[incident.analysis.category] : DEPARTMENTS[0];
  const [department, setDepartment] = useState(incident.assignment?.department ?? suggested);
  const officersInDept = OFFICERS.filter((o) => o.department === department);
  const [officerId, setOfficerId] = useState(incident.assignment?.officerId ?? officersInDept[0]?.id ?? '');
  const sevPriority: Record<string, Priority> = { Critical: 'P1', High: 'P2', Medium: 'P3', Low: 'P4' };
  const [priority, setPriority] = useState<Priority>(incident.assignment?.priority ?? sevPriority[incident.analysis?.severity ?? 'Low']);
  const [deadline, setDeadline] = useState(incident.assignment?.deadline ?? inDays(priority === 'P1' ? 1 : priority === 'P2' ? 2 : 5));
  const [instructions, setInstructions] = useState(incident.assignment?.instructions ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!officerId) return setError('Choose a field officer.');
    if (!deadline || deadline < localDay()) return setError('Deadline must be today or later.');
    allocate(incident.id, { department, officerId, priority, deadline, assignedBy: 'Admin', instructions: instructions.trim() || undefined });
    toast(`${incident.id} assigned to ${OFFICERS.find((o) => o.id === officerId)?.name}`);
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Field label="Department" htmlFor="alloc-dept" required help={department === suggested ? 'Suggested by AI routing' : undefined}>
        <select
          id="alloc-dept"
          className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setOfficerId(OFFICERS.find((o) => o.department === e.target.value)?.id ?? '');
          }}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Field>
      <Field label="Field officer" htmlFor="alloc-officer" required>
        <select id="alloc-officer" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100" value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
          {officersInDept.length === 0 && <option value="">No officers in this department</option>}
          {officersInDept.map((o) => (
            <option key={o.id} value={o.id}>{o.name} · {o.zone}</option>
          ))}
          <optgroup label="Other departments">
            {OFFICERS.filter((o) => o.department !== department).map((o) => (
              <option key={o.id} value={o.id}>{o.name} · {o.department.split(' ')[0]}</option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Field label="Priority" htmlFor="alloc-priority" required>
        <select id="alloc-priority" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Deadline" htmlFor="alloc-deadline" required>
        <input id="alloc-deadline" type="date" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100" value={deadline} min={localDay()} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Instructions for officer" htmlFor="alloc-notes">
          <textarea id="alloc-notes" rows={2} className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {error && <p role="alert" className="text-xs text-[#b42318] font-bold sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary bg-muted-teal hover:bg-deep-teal text-white font-bold shadow-md">
          <Send size={15} aria-hidden /> {incident.assignment ? 'Update assignment' : 'Assign incident'}
        </button>
      </div>
    </form>
  );
}

type Decision = 'verify' | 'reject' | 'further' | 'reopen';
const DECISION_COPY: Record<Decision, { title: string; cta: string; placeholder: string }> = {
  verify: { title: 'Verify and close incident', cta: 'Verify & close', placeholder: 'Verification note (optional)' },
  reject: { title: 'Reject submitted action', cta: 'Reject action', placeholder: 'Why is the action insufficient? (required)' },
  further: { title: 'Request further investigation', cta: 'Send back', placeholder: 'What else should the officer check? (required)' },
  reopen: { title: 'Reopen incident', cta: 'Reopen', placeholder: 'Reason for reopening (required)' },
};

export function VerificationActions({ incident }: { incident: Incident }) {
  const { closeIncident, rejectAction, requestFurtherInvestigation, reopenIncident } = useIncidentStore();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const confirm = () => {
    if (!decision) return;
    if (decision !== 'verify' && note.trim().length < 5) return setError('Please add a short reason (5+ characters).');
    const n = note.trim();
    if (decision === 'verify') closeIncident(incident.id, n || 'Action verified; incident closed.');
    if (decision === 'reject') rejectAction(incident.id, n);
    if (decision === 'further') requestFurtherInvestigation(incident.id, n);
    if (decision === 'reopen') reopenIncident(incident.id, n);
    toast(`${incident.id}: ${DECISION_COPY[decision].cta.toLowerCase()} done`, decision === 'verify' ? 'success' : 'info');
    setDecision(null);
    setNote('');
    setError('');
  };

  const pending = incident.status === 'Verification Pending';
  const closed = incident.status === 'Verified Closed';
  return (
    <div className="flex flex-wrap gap-2">
      {pending && (
        <>
          <button className="btn btn-success" onClick={() => setDecision('verify')}>
            <CheckCircle2 size={15} aria-hidden /> Verify & close
          </button>
          <button className="btn btn-danger" onClick={() => setDecision('reject')}>
            <XCircle size={15} aria-hidden /> Reject action
          </button>
          <button className="btn btn-ghost" onClick={() => setDecision('further')}>
            <Search size={15} aria-hidden /> Request further investigation
          </button>
        </>
      )}
      {closed && (
        <button className="btn btn-ghost" onClick={() => setDecision('reopen')}>
          <RotateCcw size={15} aria-hidden /> Reopen incident
        </button>
      )}
      {!pending && !closed && <p className="text-sm text-ink-400">Verification becomes available once the field officer submits an action.</p>}
      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision ? DECISION_COPY[decision].title : ''}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDecision(null)}>Cancel</button>
            <button className={decision === 'verify' ? 'btn btn-primary' : decision === 'reject' ? 'btn btn-danger' : 'btn btn-primary'} onClick={confirm}>
              {decision && DECISION_COPY[decision].cta}
            </button>
          </>
        }
      >
        <Field label="Note" htmlFor="verify-note" error={error} required={decision !== 'verify'}>
          <textarea id="verify-note" rows={3} className="input border-[var(--line-strong)] focus:border-muted-teal" value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision ? DECISION_COPY[decision].placeholder : ''} aria-invalid={!!error} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
