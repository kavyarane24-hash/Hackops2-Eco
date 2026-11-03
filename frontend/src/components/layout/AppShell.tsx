import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Waves, HardHat, LayoutDashboard, Map, MousePointer2, PlayCircle, RotateCcw, Leaf, User, Wifi, WifiOff, FlaskConical } from 'lucide-react';
import type { Role } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { toast, useUI } from '@/context/uiStore';
import { APP_NAME, ROLE_LABEL } from '@/content/content';
import { checkBackend, type BackendState } from '@/services/api';
import { BackgroundLayer, CursorLayer } from '@/components/effects/EffectLayers';
import { IncidentDrawer, useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { Modal, Toaster } from '@/components/common/Overlay';
import { QuickDemo } from './QuickDemo';
import { timeAgo } from '@/utils';
import { cn } from '@/lib/utils';

export const ROLE_ROUTES: { role: Role; path: string; icon: typeof User }[] = [
  { role: 'citizen', path: '/citizen', icon: User },
  { role: 'admin', path: '/admin', icon: LayoutDashboard },
  { role: 'stakeholder', path: '/stakeholder', icon: Map },
  { role: 'field', path: '/field', icon: HardHat },
];

export function roleFromPath(pathname: string): Role {
  return ROLE_ROUTES.find((r) => pathname.startsWith(r.path))?.role ?? 'citizen';
}

function BackendPill() {
  const [state, setState] = useState<BackendState>('checking');
  useEffect(() => {
    let alive = true;
    const run = () => checkBackend().then((s) => alive && setState(s));
    run();
    const t = setInterval(run, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const map = {
    mock: { label: 'Demo mode', Icon: FlaskConical, color: '#c0784a', title: 'Running on the in-browser mock store (VITE_USE_REAL_API=false).' },
    online: { label: 'Backend online', Icon: Wifi, color: '#22c55e', title: 'Backend /api/health is reachable.' },
    offline: { label: 'Backend offline', Icon: WifiOff, color: '#ef4444', title: 'Backend unreachable; mock fallbacks are in use.' },
    checking: { label: 'Checking…', Icon: Wifi, color: '#9aa7b8', title: 'Checking backend' },
  }[state];
  return (
    <span className="chip hidden md:inline-flex" style={{ color: map.color, borderColor: `${map.color}55` }} title={map.title}>
      <map.Icon size={12} aria-hidden /> {map.label}
    </span>
  );
}

function Notifications({ role }: { role: Role }) {
  const all = useIncidentStore((s) => s.notifications);
  const markRead = useIncidentStore((s) => s.markNotificationsRead);
  const { open: openIncident } = useIncidentParam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mine = all.filter((n) => n.role === role);
  const unread = mine.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-ghost relative !px-2.5"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(() => markRead(role), 1500);
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="num absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sev-critical px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel-solid absolute right-0 top-11 z-[1050] w-80 shadow-2xl">
          <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-ink-400">{ROLE_LABEL[role]} notifications</p>
          <ul className="max-h-80 overflow-y-auto">
            {mine.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-400">Nothing new.</li>}
            {mine.map((n) => (
              <li key={n.id}>
                <button
                  className={cn('w-full px-4 py-2.5 text-left text-sm hover:bg-ink-800', !n.read && 'bg-accent-soft')}
                  onClick={() => {
                    openIncident(n.incidentId);
                    setOpen(false);
                  }}
                >
                  <span className="block text-ink-100">{n.message}</span>
                  <span className="text-[11px] text-ink-400">{timeAgo(n.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const role = roleFromPath(pathname);
  const resetDemo = useIncidentStore((s) => s.resetDemo);
  const { effectsEnabled, cursorEnabled, setEffects, setCursor, setDemoOpen } = useUI();
  const [confirmReset, setConfirmReset] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to main content on role change for screen-reader users.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative min-h-dvh">
      <BackgroundLayer />
      <CursorLayer />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[2000] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to main content
      </a>

      <header className="sticky top-0 z-[1000] border-b border-[var(--line)] bg-ink-950/92 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2.5 text-left" aria-label={`${APP_NAME} home`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
              <Leaf size={16} className="text-accent" aria-hidden />
            </span>
            <span className="hidden sm:block">
              <span className="block text-[16px] font-bold leading-tight [font-family:var(--font-display)]">{APP_NAME}</span>
              <span className="muted block !text-[11px] leading-tight">Environmental Intelligence &amp; Compliance</span>
            </span>
          </button>

          <nav aria-label="Dashboards" className="order-3 flex w-full gap-1 overflow-x-auto lg:order-none lg:ml-4 lg:w-auto">
            {ROLE_ROUTES.map(({ role: r, path, icon: Icon }) => (
              <NavLink
                key={r}
                to={path}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-1 py-1.5 text-[11px] transition-colors sm:flex-row sm:gap-1.5 sm:px-3 sm:text-[13.5px] lg:flex-none',
                    isActive ? 'bg-ink-800 font-bold text-ink-100 shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100',
                  )
                }
              >
                <Icon size={15} aria-hidden />
                {ROLE_LABEL[r]}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <BackendPill />
            <Notifications role={role} />
            <button className="btn btn-quiet !px-2.5" title={effectsEnabled ? 'Turn visual effects off' : 'Turn visual effects on'} aria-pressed={effectsEnabled} onClick={() => setEffects(!effectsEnabled)}>
              <Waves size={16} className={effectsEnabled ? 'text-accent' : 'text-ink-500'} aria-hidden />
              <span className="sr-only">Visual effects</span>
            </button>
            <button className="btn btn-quiet hidden !px-2.5 md:inline-flex" title={cursorEnabled ? 'Turn glow cursor off' : 'Turn glow cursor on'} aria-pressed={cursorEnabled} onClick={() => setCursor(!cursorEnabled)}>
              <MousePointer2 size={16} className={cursorEnabled ? 'text-accent' : 'text-ink-500'} aria-hidden />
              <span className="sr-only">Glow cursor</span>
            </button>
            <button className="btn btn-quiet !px-2.5" onClick={() => setConfirmReset(true)} title="Clear local data">
              <RotateCcw size={16} aria-hidden />
              <span className="hidden xl:inline">Reset</span>
            </button>
            <button className="btn btn-primary" onClick={() => setDemoOpen(true)}>
              <PlayCircle size={16} aria-hidden />
              <span className="hidden sm:inline">Quick Demo</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="relative z-10 mx-auto max-w-[1440px] px-4 py-6 outline-none sm:px-6">
        <Outlet />
      </main>

      <footer className="muted relative z-10 mx-auto max-w-[1440px] px-4 pb-6 sm:px-6">
        Hackathon prototype. Role switching is a demo convenience, not authentication. All records shown were entered or imported by users; analysis is rule-based.
      </footer>

      <IncidentDrawer role={role} />
      <QuickDemo />
      <Toaster />
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Clear all local data?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                toast('All local data cleared.', 'info');
              }}
            >
              Clear data
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-200">This permanently removes every complaint, import, incident, assignment, field update and report stored in this browser. The app will start empty.</p>
      </Modal>
    </div>
  );
}
