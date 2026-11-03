import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useUI } from '@/context/uiStore';
import { useIncidentStore } from '@/context/IncidentStore';
import { Drawer } from '@/components/common/Overlay';

const STEPS = [
  { path: '/admin/import', title: 'Import a dataset', body: 'Download the sample CSV, drop it on the upload zone, review the field mapping and validation, then Confirm import.' },
  { path: '/admin/import', title: 'Review a potential incident', body: 'Open the top finding: preliminary analysis, evidence with row references, NAAQS comparison. Approve to create an incident.' },
  { path: '/admin', title: 'Allocate', body: 'Open the new incident from the table → Allocate & verify → choose department, officer, deadline.' },
  { path: '/stakeholder', title: 'See it on the map', body: 'The incident appears at its coordinates with severity colour. Click the marker for details.' },
  { path: '/field', title: 'Field officer acts', body: 'Select the officer, open the case, add inspection notes, after-action evidence, submit for verification.' },
  { path: '/admin', title: 'Verify', body: 'Awaiting verification → review the submission → Verify & close (or reject).' },
  { path: '/admin/reports', title: 'Generate the report', body: 'Pick the incident → Generate report → preview, download PDF / JSON / records CSV.' },
  { path: '/citizen', title: 'Citizen complaint path', body: 'Submit a complaint (English/Hindi) with a pin and photo; it joins the same incident list.' },
];

export function QuickDemo() {
  const { demoOpen, setDemoOpen } = useUI();
  const navigate = useNavigate();
  const latest = useIncidentStore((s) => s.incidents.find((i) => !i.isDemo));
  return (
    <Drawer open={demoOpen} onClose={() => setDemoOpen(false)} title={<span className="panel-title">Quick Demo: end-to-end workflow</span>} width="max-w-md">
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-300">Follow these steps to show one incident moving through all four dashboards. Every view reads the same shared store.</p>
        {latest && (
          <p className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-ink-200">
            Latest citizen complaint: <span className="num font-semibold text-accent">{latest.id}</span> · {latest.status}
          </p>
        )}
        <ol className="space-y-2">
          {STEPS.map((s, idx) => (
            <li key={s.title}>
              <button
                className="group flex w-full gap-3 rounded-xl border border-[var(--line)] bg-ink-950/40 p-3 text-left hover:border-accent/50"
                onClick={() => {
                  setDemoOpen(false);
                  navigate(s.path);
                }}
              >
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/50 text-xs text-accent">{idx + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-100">{s.title}</span>
                  <span className="block text-xs text-ink-400">{s.body}</span>
                </span>
                <ArrowRight size={15} className="mt-1 text-ink-500 group-hover:text-accent" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Drawer>
  );
}
