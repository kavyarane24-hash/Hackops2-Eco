import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title?: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  solid?: boolean;
  id?: string;
}

/** Content surface. The header is separated by spacing, not a divider line. */
export function Panel({ title, eyebrow, description, actions, children, className, bodyClassName, solid, id }: PanelProps) {
  return (
    <section id={id} className={cn(solid ? 'panel-solid' : 'panel', 'reveal flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
            {title && <h2 className="panel-title">{title}</h2>}
            {description && <p className="muted mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1 px-5 pb-5 pt-3', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Page header: title + one-line context + actions. Used once per view. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="reveal flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-300 [font-family:var(--font-small)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="rounded-full bg-ink-800 p-3 text-ink-400">{icon ?? <Inbox size={20} aria-hidden />}</div>
      <p className="font-bold text-ink-100">{title}</p>
      {body && <p className="muted max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-sev-critical" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs text-[#fca5a5]">
          {error}
        </p>
      ) : (
        help && <p id={`${htmlFor}-help`} className="muted mt-1">{help}</p>
      )}
    </div>
  );
}

export function KeyValue({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow !text-[11px]">{k}</dt>
      <dd className={cn('mt-0.5 break-words text-sm text-ink-100 [overflow-wrap:anywhere]', mono && 'num')}>{v}</dd>
    </div>
  );
}

/** Compact inline KPI row: many numbers, one surface. */
export function KpiStrip({ items }: { items: { label: string; value: ReactNode; tone?: string; hint?: string; onClick?: () => void; active?: boolean }[] }) {
  return (
    <div className="panel reveal grid grid-cols-2 divide-[var(--line)] sm:grid-cols-4 lg:flex lg:divide-x">
      {items.map((k) => {
        const Comp = k.onClick ? 'button' : 'div';
        return (
          <Comp
            key={k.label}
            onClick={k.onClick}
            aria-pressed={k.onClick ? !!k.active : undefined}
            className={cn('min-w-0 flex-1 px-5 py-3 text-left', k.onClick && 'transition-colors hover:bg-ink-800/60', k.active && 'bg-accent-soft')}
          >
            <p className="eyebrow truncate">{k.label}</p>
            <p className="num mt-0.5 text-[22px] font-bold leading-tight" style={{ color: k.tone ?? 'var(--color-ink-100)' }}>{k.value}</p>
            {k.hint && <p className="muted truncate">{k.hint}</p>}
          </Comp>
        );
      })}
    </div>
  );
}
