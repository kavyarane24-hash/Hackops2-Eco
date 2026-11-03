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
  const statusColor = due == null ? '#6f8887' : due < 0 ? '#b42318' : due <= 1 ? '#c98a00' : '#1f9d55';
  const status = assignment ? (due == null ? 'Assigned' : due < 0 ? `Overdue ${-due}d` : `Due in ${due}d`) : `${openCases} open case${openCases === 1 ? '' : 's'}`;
  const initials = officer.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted-teal/20 font-[family-name:var(--font-nav)] text-sm font-bold text-teal-lite ring-1 ring-muted-teal/30" aria-hidden>
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="panel-title text-ink-100">{officer.name}</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-300 font-medium">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} aria-hidden />
            {status}
          </span>
        </div>
        <p className="muted text-ink-400">
          <span className="num font-semibold text-ink-100">{officer.badge}</span> · {officer.zone}
        </p>
        {!compact && (
          <dl className="mt-2 space-y-1.5 text-[13px] text-ink-200">
            <div className="flex items-start gap-1.5">
              <Building2 size={13} className="mt-0.5 shrink-0 text-teal-lite" aria-hidden />
              <dd className="font-medium text-ink-100">{assignment?.department ?? officer.department}</dd>
            </div>
            {assignment && (
              <div className="flex items-center gap-1.5">
                <CalendarClock size={13} className="text-dusty-rose shrink-0" aria-hidden />
                <dd className="font-medium">Deadline {fmtDate(assignment.deadline)} · <span className="text-dusty-rose font-bold">{assignment.priority}</span></dd>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Phone size={13} className="text-teal-lite shrink-0" aria-hidden />
              <dd className="num font-medium">{officer.phone}</dd>
            </div>
            {progressLabel && <p className="pt-0.5 text-xs text-ink-300 font-medium">{progressLabel}</p>}
          </dl>
        )}
      </div>
    </div>
  );
}
