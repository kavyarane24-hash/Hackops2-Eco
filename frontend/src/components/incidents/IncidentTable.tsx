import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import type { Incident, IncidentCategory, IncidentStatus, Severity } from '@/types';
import { INCIDENT_STATUSES } from '@/types';
import { CATEGORIES, DEPARTMENTS, SEVERITIES, SEVERITY_RANK } from '@/config/constants';
import { SeverityBadge, StatusBadge } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/Panel';
import { daysUntil, fmtDateTime } from '@/utils';
import { cn } from '@/lib/utils';

export interface IncidentFilters {
  q: string;
  category: IncidentCategory | '';
  severity: Severity | '';
  status: IncidentStatus | '';
  department: string;
}

export const EMPTY_FILTERS: IncidentFilters = { q: '', category: '', severity: '', status: '', department: '' };

export function applyFilters(list: Incident[], f: IncidentFilters) {
  const q = f.q.trim().toLowerCase();
  return list.filter((i) => {
    if (f.category && i.analysis?.category !== f.category) return false;
    if (f.severity && i.analysis?.severity !== f.severity) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.department && i.assignment?.department !== f.department) return false;
    if (q) {
      const hay = [i.id, i.complaint.originalText, i.complaint.location.address, i.analysis?.category, i.assignment?.officerName, i.assignment?.department].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function FilterBar({ value, onChange, showDepartment = true, compact }: { value: IncidentFilters; onChange: (f: IncidentFilters) => void; showDepartment?: boolean; compact?: boolean }) {
  const set = <K extends keyof IncidentFilters>(k: K, v: IncidentFilters[K]) => onChange({ ...value, [k]: v });
  const active = Object.values(value).some(Boolean);
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(0,1fr))_auto]')}>
      <label className={cn('relative', compact && 'col-span-2')}>
        <span className="sr-only">Search incidents</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
        <input className="input !pl-8 border-[var(--line-strong)] focus:border-muted-teal" placeholder="Search ID, text, location, officer…" value={value.q} onChange={(e) => set('q', e.target.value)} />
      </label>
      <select aria-label="Filter by category" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100 font-medium" value={value.category} onChange={(e) => set('category', e.target.value as IncidentCategory | '')}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select aria-label="Filter by severity" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100 font-medium" value={value.severity} onChange={(e) => set('severity', e.target.value as Severity | '')}>
        <option value="">All severities</option>
        {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select aria-label="Filter by status" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100 font-medium" value={value.status} onChange={(e) => set('status', e.target.value as IncidentStatus | '')}>
        <option value="">All statuses</option>
        {INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      {showDepartment && (
        <select aria-label="Filter by department" className="input border-[var(--line-strong)] focus:border-muted-teal text-ink-100 font-medium" value={value.department} onChange={(e) => set('department', e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      )}
      {active && (
        <button className="btn btn-ghost hover:bg-deep-burgundy-soft hover:text-deep-burgundy hover:border-deep-burgundy/30" onClick={() => onChange(EMPTY_FILTERS)}>
          <X size={14} aria-hidden /> Clear
        </button>
      )}
    </div>
  );
}

type SortKey = 'reported' | 'severity' | 'status' | 'deadline' | 'id';

export function IncidentTable({ incidents, onOpen, highlightId }: { incidents: Incident[]; onOpen: (id: string) => void; highlightId?: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'reported', dir: -1 });

  const rows = useMemo(() => {
    const val = (i: Incident): string | number => {
      switch (sort.key) {
        case 'severity': return SEVERITY_RANK[i.analysis?.severity ?? 'Low'];
        case 'status': return INCIDENT_STATUSES.indexOf(i.status);
        case 'deadline': return i.assignment?.deadline ?? '9999';
        case 'id': return i.id;
        default: return i.complaint.timestamp;
      }
    };
    return [...incidents].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [incidents, sort]);

  const head = (key: SortKey, label: string) => {
    const activeKey = sort.key === key;
    const Icon = !activeKey ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={activeKey ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="px-3.5 py-2.5 font-bold">
        <button className="inline-flex items-center gap-1 text-ink-100 hover:text-teal-lite font-bold transition-colors" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
          {label} <Icon size={11} aria-hidden className={activeKey ? 'text-dusty-rose' : 'text-ink-400'} />
        </button>
      </th>
    );
  };

  if (!incidents.length) return <EmptyState title="No incidents match these filters" body="Clear a filter or search term to see more." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs text-ink-100 font-bold bg-deep-teal/50 border-b border-[var(--line)]">
          <tr>
            {head('id', 'Incident')}
            <th scope="col" className="px-3.5 py-2.5 font-bold">Category · location</th>
            {head('severity', 'Severity')}
            {head('status', 'Status')}
            <th scope="col" className="px-3.5 py-2.5 font-bold">Assigned</th>
            {head('deadline', 'Deadline')}
            {head('reported', 'Reported')}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const due = daysUntil(i.assignment?.deadline);
            const overdue = due != null && due < 0 && i.status !== 'Verified Closed';
            return (
              <tr
                key={i.id}
                tabIndex={0}
                onClick={() => onOpen(i.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(i.id))}
                className={cn(
                  'cursor-pointer border-b border-[var(--line)] transition-colors hover:bg-muted-teal/20 focus:bg-muted-teal/20 focus:outline-none',
                  highlightId === i.id && 'bg-dusty-rose/15/80 shadow-[inset_3px_0_0_#DA7B93]',
                )}
              >
                <td className="px-3.5 py-2.5">
                  <span className="num whitespace-nowrap font-bold text-ink-100 hover:text-teal-lite">{i.id}</span>
                </td>
                <td className="max-w-[280px] px-3.5 py-2.5">
                  <p className="truncate font-medium text-ink-100">{i.analysis?.category ?? (i.analysisState === 'pending' ? 'Analysing…' : 'Unclassified')}</p>
                  <p className="truncate text-xs text-ink-400" title={i.complaint.location.address}>{i.complaint.location.address}</p>
                </td>
                <td className="px-3.5 py-2.5">{i.analysis ? <SeverityBadge severity={i.analysis.severity} /> : <span className="text-xs text-ink-500">—</span>}</td>
                <td className="px-3.5 py-2.5"><StatusBadge status={i.status} /></td>
                <td className="px-3.5 py-2.5 text-xs">
                  {i.assignment ? (
                    <>
                      <p className="font-medium text-ink-100">{i.assignment.officerName}</p>
                      <p className="max-w-[180px] truncate text-ink-400">{i.assignment.department}</p>
                    </>
                  ) : (
                    <span className="text-sev-medium font-medium">Unassigned</span>
                  )}
                </td>
                <td className={cn('num whitespace-nowrap px-3.5 py-2.5 text-xs', overdue ? 'text-sev-critical font-bold' : 'text-ink-200')}>
                  {i.assignment ? `${i.assignment.deadline}${overdue ? ' · overdue' : ''}` : '—'}
                </td>
                <td className="num px-3.5 py-2.5 text-xs text-ink-300">{fmtDateTime(i.complaint.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
