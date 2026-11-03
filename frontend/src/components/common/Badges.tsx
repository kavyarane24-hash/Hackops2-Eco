import { AlertOctagon, AlertTriangle, CircleDot, FlaskConical, ShieldCheck } from 'lucide-react';
import type { IncidentStatus, Severity, Urgency } from '@/types';
import { SEVERITY_COLOR, STATUS_TONE } from '@/config/constants';
import { cn } from '@/lib/utils';

const SEV_ICON = { Low: ShieldCheck, Medium: CircleDot, High: AlertTriangle, Critical: AlertOctagon } as const;

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const color = SEVERITY_COLOR[severity];
  const Icon = SEV_ICON[severity];
  return (
    <span
      className={cn('chip font-semibold', className)}
      style={{ color, borderColor: `${color}66`, background: `${color}14` }}
    >
      <Icon size={12} aria-hidden />
      {severity}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  const color = STATUS_TONE[status];
  return (
    <span className={cn('chip', className)} style={{ color, borderColor: `${color}55`, background: `${color}12` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {status}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const tone = { Low: '#68777b', Moderate: '#f5b83d', High: '#f97316', Immediate: '#ef4444' }[urgency];
  return (
    <span className="chip" style={{ color: tone, borderColor: `${tone}55` }}>
      Urgency · {urgency}
    </span>
  );
}

export function DemoTag({ label = 'Demo data', title }: { label?: string; title?: string }) {
  return (
    <span className="demo-tag" title={title ?? 'Simulated for demonstration. Not a real observation.'}>
      <FlaskConical size={10} aria-hidden />
      {label}
    </span>
  );
}
