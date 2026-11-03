import { Building2, CalendarClock, Phone } from 'lucide-react';
import type { Assignment, Officer } from '@/types';
import { daysUntil, fmtDate } from '@/utils';

interface Props {
  officer: Officer;
  assignment?: Assignment;
  openCases: number;
  progressLabel?: string;
  compact?: boolean;
}

/** Officer / action-ownership summary, driven by live store data. */
export function OfficerCard({ officer, assignment, openCases, progressLabel, compact }: Props) {
  const due = daysUntil(assignment?.deadline);
  const statusColor = due == null ? '#68777b' : due < 0 ? '#ef4444' : due <= 1 ? '#f5b83d' : '#22c55e';
  const status = assignment ? (due == null ? 'Assigned' : due < 0 ? `Overdue ${-due}d` : `Due in ${due}d`) : `${openCases} open case${openCases === 1 ? '' : 's'}`;
  const initials = officer.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-[family-name:var(--font-nav)] text-sm font-bold text-accent" aria-hidden>
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="panel-title">{officer.name}</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} aria-hidden />
            {status}
          </span>
        </div>
        <p className="muted">
          <span className="num">{officer.badge}</span> · {officer.zone}
        </p>
        {!compact && (
          <dl className="mt-2 space-y-1 text-[13px] text-ink-300">
            <div className="flex items-start gap-1.5">
              <Building2 size={13} className="mt-0.5 shrink-0" aria-hidden />
              <dd>{assignment?.department ?? officer.department}</dd>
            </div>
            {assignment && (
              <div className="flex items-center gap-1.5">
                <CalendarClock size={13} aria-hidden />
                <dd>Deadline {fmtDate(assignment.deadline)} · {assignment.priority}</dd>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Phone size={13} aria-hidden />
              <dd className="num">{officer.phone}</dd>
            </div>
            {progressLabel && <p className="pt-0.5 text-ink-200">{progressLabel}</p>}
          </dl>
        )}
      </div>
    </div>
  );
}
