import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Braces, FileDown, FilePlus2, Printer, RefreshCw, Table2 } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { toast } from '@/context/uiStore';
import { Panel, EmptyState, Spinner } from '@/components/common/Panel';
import { SeverityBadge, StatusBadge } from '@/components/common/Badges';
import { ReportDocument } from '@/components/reports/ReportDocument';
import { downloadReportPdf, exportReportJson, exportReportReadingsCsv } from '@/services/incidentReport';
import { fmtDateTime } from '@/utils';
import { cn } from '@/lib/utils';

/** Admin › Incident Reports: generate, preview, version and download reports. */
export default function IncidentReports() {
  const incidents = useIncidentStore((s) => s.incidents);
  const reports = useIncidentStore((s) => s.reports);
  const generate = useIncidentStore((s) => s.generateIncidentReport);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('for') ?? incidents[0]?.id;
  const incident = incidents.find((i) => i.id === selectedId);
  const versions = useMemo(() => reports.filter((r) => r.incidentId === selectedId).sort((a, b) => b.version - a.version), [reports, selectedId]);
  const [versionId, setVersionId] = useState<string | undefined>();
  const report = versions.find((r) => r.id === versionId) ?? versions[0];
  const outdated = !!(report && incident && incident.updatedAt > report.generatedAt);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => setVersionId(undefined), [selectedId]);

  const select = (id: string) => setParams((p) => { p.set('for', id); return p; });
  const run = () => {
    if (!incident) return;
    const r = generate(incident.id);
    if (r) {
      setVersionId(r.id);
      toast(`${r.id} generated`);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <Panel title="Incidents" description="Choose an incident to report on" bodyClassName="px-2 pb-3 max-h-[60vh] overflow-y-auto">
          <ul className="space-y-0.5">
            {incidents.map((i) => {
              const n = reports.filter((r) => r.incidentId === i.id).length;
              return (
                <li key={i.id}>
                  <button onClick={() => select(i.id)} aria-current={i.id === selectedId} className={cn('w-full rounded-md px-3 py-2 text-left hover:bg-ink-800', i.id === selectedId && 'bg-ink-800 shadow-[inset_2px_0_0_var(--color-accent)]')}>
                    <span className="flex items-center gap-2">
                      <span className="num text-[13px] font-bold">{i.id}</span>
                      {i.source === 'data_import' && <span className="chip !text-[10.5px]">import</span>}
                      {n > 0 && <span className="muted ml-auto">{n} ver.</span>}
                    </span>
                    <span className="muted block truncate">{i.analysis?.category ?? 'Pending'} · {i.status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
        {versions.length > 0 && (
          <Panel title="Report history" bodyClassName="px-2 pb-3">
            <ul className="space-y-0.5">
              {versions.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setVersionId(r.id)} className={cn('w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-ink-800', r.id === report?.id && 'bg-ink-800')}>
                    <span className="num">v{r.version}</span> · {r.status} · <span className="muted">{fmtDateTime(r.generatedAt)}</span>
                    <span className="muted block">Incident was “{r.incidentStatusAtGeneration}”</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>

      <div className="min-w-0 space-y-4">
        {!incident ? (
          <Panel title="Incident report"><EmptyState title="No incident selected" /></Panel>
        ) : (
          <>
            <div className="panel reveal flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-[240px] flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="num whitespace-nowrap font-bold">{incident.id}</span>
                  {incident.analysis && <SeverityBadge severity={incident.analysis.severity} />}
                  <StatusBadge status={incident.status} />
                </p>
                <p className="muted mt-0.5 truncate">{incident.complaint.location.address}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={run}>
                  {report ? <RefreshCw size={15} aria-hidden /> : <FilePlus2 size={15} aria-hidden />}
                  {report ? 'Regenerate report' : 'Generate report'}
                </button>
                {report && (
                  <>
                    <button
                      className="btn btn-ghost"
                      disabled={pdfBusy}
                      onClick={async () => {
                        setPdfBusy(true);
                        try {
                          await downloadReportPdf(report);
                          toast('PDF downloaded', 'info');
                        } catch {
                          toast('PDF generation failed', 'error');
                        } finally {
                          setPdfBusy(false);
                        }
                      }}
                    >
                      {pdfBusy ? <Spinner size={13} /> : <FileDown size={15} aria-hidden />} PDF
                    </button>
                    <button className="btn btn-quiet" onClick={() => exportReportJson(report)}><Braces size={15} aria-hidden /> JSON</button>
                    {report.snapshot.readings.length > 0 && <button className="btn btn-quiet" onClick={() => exportReportReadingsCsv(report)}><Table2 size={15} aria-hidden /> Records CSV</button>}
                    <button className="btn btn-quiet" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print</button>
                  </>
                )}
              </div>
            </div>
            {outdated && (
              <p className="flex items-center gap-2 rounded-md bg-sev-medium/10 px-4 py-2 text-[13px] text-[#fcd68a]">
                <AlertCircle size={15} aria-hidden /> The incident has changed since this version was generated (new evidence, assignment or verification). Regenerate to include it.
              </p>
            )}
            {report ? (
              <ReportDocument report={report} />
            ) : (
              <Panel title="No report yet">
                <EmptyState title="Generate a report for this incident" body="The report is built from the incident record, imported data, analysis, evidence, field updates and verification history." />
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
