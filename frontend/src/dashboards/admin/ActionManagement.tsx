import { lazy, Suspense, useMemo, useState } from 'react';
import { Building2, CalendarClock, User } from 'lucide-react';
import type { Incident } from '@/types';
import { useIncidentStore, OFFICERS } from '@/context/IncidentStore';
import { Panel, EmptyState, KpiStrip } from '@/components/common/Panel';
import { SeverityBadge, StatusBadge } from '@/components/common/Badges';
import { OfficerCard } from '@/components/effects/OfficerCard';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { CAROUSEL } from '@/config/motion';
import { OPEN_STATUSES } from '@/config/constants';
import { daysUntil, fmtDate, fmtDateTime, timeAgo } from '@/utils';
import { cn } from '@/lib/utils';

const Carousel = lazy(() => import('@/components/effects/Carousel'));

type ActionState = 'Overdue' | 'Due soon' | 'Awaiting verification' | 'In progress' | 'Assigned' | 'Unassigned' | 'Completed';

const STATE_COLOR: Record<ActionState, string> = {
  Overdue: '#f06b6b',
  'Due soon': '#f2c14e',
  'Awaiting verification': '#DA7B93',
  'In progress': '#8fb3c9',
  Assigned: '#7cc4c2',
  Unassigned: '#a9bac4',
  Completed: '#6fd39b',
};
const ORDER: ActionState[] = ['Overdue', 'Awaiting verification', 'Due soon', 'Unassigned', 'In progress', 'Assigned', 'Completed'];

function stateOf(i: Incident): ActionState {
  if (i.status === 'Verified Closed') return 'Completed';
  if (i.status === 'Verification Pending' || i.status === 'Action Submitted') return 'Awaiting verification';
  if (!i.assignment) return 'Unassigned';
  const due = daysUntil(i.assignment.deadline);
  if (due != null && due < 0) return 'Overdue';
  if (due != null && due <= 2) return 'Due soon';
  return i.status === 'Under Investigation' ? 'In progress' : 'Assigned';
}

/** Admin › Action & Management: who is doing what, by when, and what needs a decision. */
export default function ActionManagement() {
  const incidents = useIncidentStore((s) => s.incidents);
  const { open } = useIncidentParam();
  const [filter, setFilter] = useState<ActionState | 'all'>('all');

  const rows = useMemo(
    () => incidents.filter((i) => i.analysis).map((i) => ({ i, state: stateOf(i), last: i.fieldUpdates[i.fieldUpdates.length - 1] })).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)),
    [incidents],
  );
  const count = (s: ActionState) => rows.filter((r) => r.state === s).length;
  const visible = filter === 'all' ? rows : rows.filter((r) => r.state === filter);
  // Cards: open work first, then a few recent completions.
  const cards = [...rows.filter((r) => r.state !== 'Completed'), ...rows.filter((r) => r.state === 'Completed').slice(0, 3)].slice(0, 12);
  const pick = (s: ActionState) => setFilter((f) => (f === s ? 'all' : s));

  const workload = OFFICERS.map((o) => {
    const cases = incidents.filter((i) => i.assignment?.officerId === o.id && OPEN_STATUSES.includes(i.status));
    const soonest = [...cases].sort((a, b) => (a.assignment!.deadline > b.assignment!.deadline ? 1 : -1))[0];
    return { officer: o, cases, soonest };
  }).filter((w) => w.cases.length).sort((a, b) => b.cases.length - a.cases.length);

  const action = (r: (typeof rows)[number]) =>
    r.state === 'Awaiting verification' ? { label: 'Review submission', tab: 'manage' } :
    r.state === 'Unassigned' ? { label: 'Allocate', tab: 'manage' } :
    r.state === 'Completed' ? { label: 'View / reopen', tab: 'manage' } :
    { label: 'Manage', tab: 'manage' };

  return (
    <div className="space-y-5">
      <KpiStrip
        items={(['Overdue', 'Due soon', 'Awaiting verification', 'In progress', 'Unassigned', 'Completed'] as ActionState[]).map((s) => ({
          label: s,
          value: count(s),
          tone: count(s) ? STATE_COLOR[s] : undefined,
          onClick: () => pick(s),
          active: filter === s,
        }))}
      />

      <Panel title="Action board" description="Live from incident records. Drag, swipe or use the arrows; select a card to manage it.">
        {cards.length === 0 ? (
          <EmptyState title="No actions yet" body="Actions appear once incidents are assessed and assigned to departments and officers." />
        ) : (
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <div className="mx-auto max-w-[540px]">
              <Carousel
                {...CAROUSEL}
                effect="tilt"
                baseWidth="100%"
                aspectRatio={2.2}
                items={cards.map(({ i, state, last }) => (
                  <button
                    key={i.id}
                    onClick={() => open(i.id, 'manage')}
                    className="flex h-full w-full flex-col justify-between rounded-[12px] bg-[var(--surface)] p-4 text-left ring-1 ring-[var(--line-strong)] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                    style={{
                      boxShadow: `inset 4px 0 0 ${STATE_COLOR[state]}, 0 6px 18px rgba(10, 20, 26, 0.35)`,
                      background: 'linear-gradient(160deg, #1C3334 0%, #243846 60%, #2E151B 140%)',
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-bold [font-family:var(--font-nav)]" style={{ color: STATE_COLOR[state] }}>{state}</span>
                        <span className="num text-[12px] font-semibold text-ink-100 bg-slate-blue/40 px-2 py-0.5 rounded border border-[var(--line)]">{i.id}</span>
                      </div>
                      <p className="panel-title mt-1.5 text-ink-100">{i.analysis!.category}</p>
                      <p className="muted truncate text-ink-400">{i.complaint.location.address}</p>
                    </div>
                    <dl className="space-y-1 text-[12.5px] text-ink-200">
                      <div className="flex items-center gap-1.5"><Building2 size={12} className="text-teal-lite" aria-hidden /><dd className="truncate">{i.assignment?.department ?? 'No department assigned'}</dd></div>
                      <div className="flex items-center gap-1.5"><User size={12} className="text-teal-lite" aria-hidden /><dd>{i.assignment?.officerName ?? 'No officer assigned'}</dd></div>
                      <div className="flex items-center gap-1.5"><CalendarClock size={12} className="text-dusty-rose" aria-hidden /><dd className="font-medium">{i.assignment ? `Due ${fmtDate(i.assignment.deadline)} · ${i.assignment.priority}` : 'No deadline'}{last ? ` · last update ${timeAgo(last.timestamp)}` : ''}</dd></div>
                    </dl>
                  </button>
                ))}
              />
            </div>
          </Suspense>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Actions" description={`${visible.length} shown${filter !== 'all' ? ` · ${filter}` : ''}`} bodyClassName="px-0 pb-2">
          {visible.length === 0 ? (
            <EmptyState title="Nothing in this state" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13.5px]">
                <thead className="text-left text-[12.5px] font-bold text-ink-100 bg-deep-teal/50 border-b border-[var(--line)]">
                  <tr>{['Incident', 'State', 'Department · officer', 'Deadline', 'Last field update', ''].map((h) => <th key={h} className="px-5 py-2.5 font-bold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const a = action(r);
                    return (
                      <tr key={r.i.id} className="border-t border-[var(--line)] align-top transition-colors hover:bg-muted-teal/20">
                        <td className="px-5 py-3">
                          <span className="num whitespace-nowrap font-bold text-ink-100">{r.i.id}</span>
                          <div className="mt-1 flex flex-wrap gap-1">{r.i.analysis && <SeverityBadge severity={r.i.analysis.severity} />}<StatusBadge status={r.i.status} /></div>
                        </td>
                        <td className="px-5 py-3 font-bold" style={{ color: STATE_COLOR[r.state] }}>{r.state}</td>
                        <td className="px-5 py-3">{r.i.assignment ? <><span className="text-ink-100 font-medium">{r.i.assignment.officerName}</span><span className="muted block text-ink-400">{r.i.assignment.department}</span></> : <span className="muted">—</span>}</td>
                        <td className={cn('num whitespace-nowrap px-5 py-3 font-medium', r.state === 'Overdue' ? 'text-[#b42318] font-bold' : 'text-ink-200')}>{r.i.assignment ? fmtDate(r.i.assignment.deadline) : '—'}</td>
                        <td className="px-5 py-3">{r.last ? <><span className="font-medium text-ink-100">{r.last.type === 'action_submission' ? 'Action submitted' : 'Inspection'}</span><span className="muted block text-ink-400">{fmtDateTime(r.last.timestamp)}</span></> : <span className="muted">None</span>}</td>
                        <td className="px-5 py-3 text-right"><button className={cn('btn !min-h-8', r.state === 'Awaiting verification' || r.state === 'Unassigned' ? 'btn-primary' : 'btn-ghost')} onClick={() => open(r.i.id, a.tab)}>{a.label}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Officer workload" description="Officers with open assignments">
          {workload.length === 0 ? <p className="muted">No open assignments.</p> : (
            <ul className="space-y-4">
              {workload.map(({ officer, cases, soonest }) => (
                <li key={officer.id}><OfficerCard officer={officer} assignment={soonest?.assignment} openCases={cases.length} compact /></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
