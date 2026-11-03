import { useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, FileText, LayoutList, UploadCloud } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { useReveal } from '@/hooks/motion';

const TABS = [
  { to: '/admin', end: true, label: 'Operations', icon: LayoutList },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/import', label: 'Data Import & Analysis', icon: UploadCloud },
  { to: '/admin/reports', label: 'Incident Reports', icon: FileText },
];

/** Admin dashboard frame: one header, sub-navigation, and the active view. */
export default function AdminLayout() {
  const scope = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useReveal(scope, [pathname]);
  const pending = useIncidentStore((s) => s.potentials.filter((p) => p.status === 'pending').length);
  const verify = useIncidentStore((s) => s.incidents.filter((i) => i.status === 'Verification Pending').length);

  return (
    <div ref={scope} className="space-y-5">
      <div className="reveal">
        <p className="eyebrow mb-1">Admin</p>
        <h1 className="page-title">Environmental operations</h1>
      </div>
      <nav aria-label="Admin sections" className="tabs reveal">
        {TABS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon size={15} aria-hidden />
            {label}
            {label === 'Operations' && verify > 0 && <span className="num rounded-full bg-[#c084fc22] px-1.5 text-[11px] text-[#d8b4fe]" title="Awaiting verification">{verify}</span>}
            {label.startsWith('Data') && pending > 0 && <span className="num rounded-full bg-accent-soft px-1.5 text-[11px] text-accent" title="Potential incidents awaiting review">{pending}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
