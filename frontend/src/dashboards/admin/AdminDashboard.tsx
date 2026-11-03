import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, FileText, UploadCloud } from 'lucide-react';
import type { IncidentStatus } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { Panel, EmptyState, KpiStrip } from '@/components/common/Panel';
import { SeverityBadge } from '@/components/common/Badges';
import { IncidentTable, FilterBar, applyFilters, EMPTY_FILTERS, type IncidentFilters } from '@/components/incidents/IncidentTable';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { downloadCsv, downloadSummaryPdf } from '@/services/reports';
import { timeAgo } from '@/utils';
import { toast } from '@/context/uiStore';

type Quick = 'all' | 'critical' | 'unassigned' | 'pending' | 'verification' | 'resolved';

const QUICK: Record<Quick, (s: IncidentStatus, critical: boolean, assigned: boolean) => boolean> = {
  all: () => true,
  critical: (s, c) => c && s !== 'Verified Closed',
  unassigned: (s, _c, a) => !a && s !== 'Verified Closed',
  pending: (s) => ['Allocated', 'Under Investigation', 'Reopened'].includes(s),
  verification: (s) => s === 'Verification Pending' || s === 'Action Submitted',
  resolved: (s) => s === 'Verified Closed',
};

/** Admin › Operations: the incident table is the main workspace. */
export default function AdminDashboard() {
  const incidents = useIncidentStore((s) => s.incidents);
  const potentials = useIncidentStore((s) => s.potentials);
  const pendingPotentials = potentials.filter((p) => p.status === 'pending');
  const { open, id: openId } = useIncidentParam();
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS);
  const [quick, setQuick] = useState<Quick>('all');

  const count = (q: Quick) => incidents.filter((i) => QUICK[q](i.status, i.analysis?.severity === 'Critical', !!i.assignment)).length;
  const avgH = useMemo(() => {
    const closed = incidents.filter((i) => i.closedAt);
    return closed.length ? Math.round(closed.reduce((a, i) => a + (new Date(i.closedAt!).getTime() - new Date(i.complaint.timestamp).getTime()), 0) / closed.length / 3600000) : null;
  }, [incidents]);

  const visible = useMemo(
    () => applyFilters(incidents, filters).filter((i) => QUICK[quick](i.status, i.analysis?.severity === 'Critical', !!i.assignment)),
    [incidents, filters, quick],
  );
  const toVerify = incidents.filter((i) => QUICK.verification(i.status, false, true));
  const unassigned = incidents.filter((i) => QUICK.unassigned(i.status, false, !!i.assignment)).sort((a, b) => b.complaint.timestamp.localeCompare(a.complaint.timestamp));
  const pick = (q: Quick) => setQuick((cur) => (cur === q ? 'all' : q));

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          { label: 'All incidents', value: incidents.length, onClick: () => pick('all'), active: quick === 'all' },
          { label: 'Critical open', value: count('critical'), tone: '#c0362c', onClick: () => pick('critical'), active: quick === 'critical' },
          { label: 'Unassigned', value: count('unassigned'), tone: '#f5b83d', onClick: () => pick('unassigned'), active: quick === 'unassigned' },
          { label: 'Action pending', value: count('pending'), onClick: () => pick('pending'), active: quick === 'pending' },
          { label: 'Awaiting verification', value: count('verification'), tone: '#6b4a9e', onClick: () => pick('verification'), active: quick === 'verification' },
          { label: 'Resolved', value: count('resolved'), tone: '#1f8a5b', hint: avgH != null ? `Avg ${avgH} h to close` : undefined, onClick: () => pick('resolved'), active: quick === 'resolved' },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Incidents"
          description={`${visible.length} of ${incidents.length} shown${quick !== 'all' ? ` · filter: ${quick}` : ''}. Select a row for details, analysis, allocation and verification.`}
          actions={
            <>
              <button className="btn btn-quiet" onClick={() => { downloadCsv(visible); toast(`Exported ${visible.length} incidents to CSV`, 'info'); }}>
                <FileSpreadsheet size={15} aria-hidden /> CSV
              </button>
              <button className="btn btn-quiet" onClick={() => void downloadSummaryPdf(visible).then(() => toast('Summary PDF downloaded', 'info'))}>
                <FileText size={15} aria-hidden /> Summary PDF
              </button>
            </>
          }
          bodyClassName="px-0 pb-2"
        >
          <div className="px-5 pb-3">
            <FilterBar value={filters} onChange={setFilters} />
          </div>
          <IncidentTable incidents={visible} onOpen={open} highlightId={openId ?? undefined} />
        </Panel>

        <aside className="space-y-5">
          <Panel title="Awaiting verification" description="Field submissions to review">
            {toVerify.length === 0 ? (
              <p className="muted">Nothing to verify.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {toVerify.map((i) => (
                  <li key={i.id}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink-800" onClick={() => open(i.id)}>
                      <span className="num text-[13px] font-bold">{i.id}</span>
                      {i.analysis && <SeverityBadge severity={i.analysis.severity} />}
                      <span className="muted ml-auto truncate">{timeAgo(i.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Needs allocation" description="Assessed, no officer yet">
            {unassigned.length === 0 ? (
              <p className="muted">Every open incident is assigned.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {unassigned.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink-800" onClick={() => open(i.id)}>
                      <span className="num text-[13px] font-bold">{i.id}</span>
                      {i.analysis ? <SeverityBadge severity={i.analysis.severity} /> : <span className="muted">Analysing…</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Data import & reports">
            {pendingPotentials.length > 0 ? (
              <Link to="/admin/import" className="mb-3 flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-[13px] text-ink-100 hover:bg-accent/20">
                <span><strong className="num text-accent">{pendingPotentials.length}</strong> potential incident{pendingPotentials.length === 1 ? '' : 's'} awaiting review</span>
                <ArrowRight size={14} aria-hidden />
              </Link>
            ) : (
              <EmptyState title="No imports awaiting review" icon={<UploadCloud size={18} aria-hidden />} />
            )}
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/import" className="btn btn-ghost"><UploadCloud size={15} aria-hidden /> Import data</Link>
              <Link to="/admin/reports" className="btn btn-ghost"><FileText size={15} aria-hidden /> Reports</Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
