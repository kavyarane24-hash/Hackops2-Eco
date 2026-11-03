import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, HardHat, LayoutDashboard, Map, Menu, PlayCircle, RotateCcw, Leaf, User, Wifi, WifiOff, FlaskConical } from 'lucide-react';
import type { Role } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { toast, useUI } from '@/context/uiStore';
import { APP_NAME, ROLE_LABEL } from '@/content/content';
import { checkBackend, type BackendState } from '@/services/api';
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
    mock: { label: 'Local mode', Icon: FlaskConical, color: '#a35a2a', title: 'Running on the in-browser mock store (VITE_USE_REAL_API=false).' },
    online: { label: 'Backend online', Icon: Wifi, color: '#1f8a5b', title: 'Backend /api/health is reachable.' },
    offline: { label: 'Backend offline', Icon: WifiOff, color: '#c0362c', title: 'Backend unreachable; mock fallbacks are in use.' },
    checking: { label: 'Checking…', Icon: Wifi, color: '#68777b', title: 'Checking backend' },
  }[state];
  return (
    <span className="chip" style={{ color: map.color, borderColor: `${map.color}55` }} title={map.title}>
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
        className="btn btn-quiet relative !px-2.5"
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

const ROLE_SECTIONS: Partial<Record<Role, { to: string; label: string; end?: boolean }[]>> = {
  citizen: [
    { to: '/citizen', label: 'Report pollution', end: true },
    { to: '/citizen/complaints', label: 'My complaints' },
  ],
  admin: [
    { to: '/admin', label: 'Incidents', end: true },
    { to: '/admin/actions', label: 'Action & Management' },
    { to: '/admin/timeline', label: 'Timeline' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/import', label: 'Data Import & Analysis' },
    { to: '/admin/reports', label: 'Incident Reports' },
  ],
};

export function currentSection(role: Role, pathname: string) {
  return ROLE_SECTIONS[role]?.find((x) => (x.end ? pathname === x.to : pathname.startsWith(x.to)))?.label;
}

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const role = roleFromPath(pathname);
  const resetDemo = useIncidentStore((s) => s.resetDemo);
  const verify = useIncidentStore((s) => s.incidents.filter((i) => i.status === 'Verification Pending').length);
  const pending = useIncidentStore((s) => s.potentials.filter((p) => p.status === 'pending').length);
  const { setDemoOpen } = useUI();
  const [confirmReset, setConfirmReset] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const section = currentSection(role, pathname);

  // Move focus to main content on navigation for screen-reader users.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, [pathname]);

  const badge = (label: string) => (label === 'Action & Management' ? verify : label.startsWith('Data') ? pending : 0);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <button onClick={() => navigate('/')} className="flex items-center gap-2.5 text-left" aria-label={`${APP_NAME} home`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
          <Leaf size={18} aria-hidden />
        </span>
        <span>
          <span className="block text-[17px] font-bold leading-tight text-ink-100 [font-family:var(--font-display)]">{APP_NAME}</span>
          <span className="muted block !text-[11px] leading-tight">Environmental Intelligence</span>
        </span>
      </button>

      <nav aria-label="Dashboards" className="space-y-5">
        <div>
          <p className="eyebrow mb-1.5 px-2">Workspace</p>
          <ul className="space-y-0.5">
            {ROLE_ROUTES.map(({ role: r, path, icon: Icon }) => (
              <li key={r}>
                <NavLink
                  to={path}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] transition-colors [font-family:var(--font-nav)]',
                    role === r ? 'bg-mint font-bold text-accent-strong' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {ROLE_LABEL[r]}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
        {ROLE_SECTIONS[role] && (
          <div>
            <p className="eyebrow mb-1.5 px-2">{ROLE_LABEL[role]}</p>
            <ul className="space-y-0.5">
              {ROLE_SECTIONS[role]!.map((sct) => (
                <li key={sct.to}>
                  <NavLink
                    to={sct.to}
                    end={sct.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-md py-1.5 pl-4 pr-2.5 text-[13.5px] [font-family:var(--font-nav)]',
                        isActive ? 'font-bold text-accent-strong shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-ink-300 hover:text-ink-100',
                      )
                    }
                  >
                    {sct.label}
                    {badge(sct.label) > 0 && <span className="num rounded-full bg-[#7456a81a] px-1.5 text-[11px] text-purple">{badge(sct.label)}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="mt-auto space-y-2">
        <button className="btn btn-primary w-full" onClick={() => setDemoOpen(true)}>
          <PlayCircle size={16} aria-hidden /> Quick Demo
        </button>
        <div className="flex items-center justify-between gap-1 px-1">
          <BackendPill />
          <button className="btn btn-quiet !min-h-8 !px-2 !text-[12.5px]" onClick={() => setConfirmReset(true)} title="Clear local data">
            <RotateCcw size={14} aria-hidden /> Clear data
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-950">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[2000] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-[1000] hidden w-60 border-r border-[var(--line)] bg-white lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-[1100] lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-[#1c2a30]/40" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-[900] flex items-center gap-3 border-b border-[var(--line)] bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <button className="btn btn-quiet !px-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <p className="truncate text-[14px] text-ink-300 [font-family:var(--font-nav)]">
            <span className="font-bold text-ink-100">{ROLE_LABEL[role]}</span>
            {section && <> · {section}</>}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Notifications role={role} />
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1360px] px-4 py-6 outline-none sm:px-6">
          <Outlet />
        </main>
        <footer className="muted mx-auto max-w-[1360px] px-4 pb-6 sm:px-6">
          Hackathon prototype. Role switching is a demo convenience, not authentication. All records shown were entered or imported by users; analysis is rule-based.
        </footer>
      </div>

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
