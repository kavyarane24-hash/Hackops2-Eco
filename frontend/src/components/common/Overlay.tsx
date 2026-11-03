import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useUI } from '@/context/uiStore';
import { cn } from '@/lib/utils';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

/** Right-hand slide-over used for incident details. */
export function Drawer({ open, onClose, title, children, width = 'max-w-3xl' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end" data-lenis-prevent>
      <button aria-label="Close panel" className="absolute inset-0 bg-[#1c2a30]/40" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn('relative flex h-full w-full flex-col border-l border-[var(--line-strong)] bg-ink-900 shadow-2xl outline-none', width)}
        style={{ animation: 'drawer-in 220ms cubic-bezier(.2,.8,.2,1)' }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <div className="min-w-0">{title}</div>
          <button className="btn btn-ghost !min-h-9 !px-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
      <style>{`@keyframes drawer-in{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}`}</style>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" data-lenis-prevent>
      <button aria-label="Close dialog" className="absolute inset-0 bg-[#1c2a30]/45" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="panel-solid relative w-full max-w-lg shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h2 className="panel-title">{title}</h2>
          <button className="btn btn-ghost !min-h-9 !px-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

const TONE = {
  success: { Icon: CheckCircle2, color: '#22c55e' },
  error: { Icon: AlertCircle, color: '#ef4444' },
  info: { Icon: Info, color: '#087f8c' },
};

export function Toaster() {
  const { toasts, dismissToast } = useUI();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[1300] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => {
        const { Icon, color } = TONE[t.tone];
        return (
          <div key={t.id} className="panel-solid pointer-events-auto flex items-start gap-3 px-4 py-3 shadow-xl" style={{ borderColor: `${color}55` }}>
            <Icon size={18} style={{ color }} className="mt-0.5 shrink-0" aria-hidden />
            <p className="flex-1 text-sm text-ink-100">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="text-ink-400 hover:text-ink-100" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
