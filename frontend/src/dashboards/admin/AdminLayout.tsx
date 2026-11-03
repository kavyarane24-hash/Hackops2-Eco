import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { currentSection } from '@/components/layout/AppShell';
import { useReveal } from '@/hooks/motion';

const DESCRIPTION: Record<string, string> = {
  Incidents: 'All incidents, what needs allocation and what is awaiting verification.',
  'Action & Management': 'Assignments, deadlines, field progress and verification decisions.',
  Timeline: 'Every day on which something was recorded, with its events and readings.',
  Analytics: 'Trends from imported monitoring data.',
  'Data Import & Analysis': 'Upload datasets and documents, review extraction, approve findings.',
  'Incident Reports': 'Generate, version and download formal investigation reports.',
};

/** Admin frame: compact header for the active section (navigation lives in the sidebar). */
export default function AdminLayout() {
  const scope = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useReveal(scope, [pathname]);
  const section = currentSection('admin', pathname) ?? 'Incidents';

  return (
    <div ref={scope} className="space-y-5">
      <header className="reveal">
        <h1 className="page-title">{section}</h1>
        <p className="mt-1 text-[13px] text-ink-400 [font-family:var(--font-small)]">{DESCRIPTION[section]}</p>
      </header>
      <Outlet />
    </div>
  );
}
