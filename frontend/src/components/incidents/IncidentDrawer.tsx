import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileDown, MapPin } from 'lucide-react';
import type { Role } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { Drawer } from '@/components/common/Overlay';
import { SeverityBadge, StatusBadge } from '@/components/common/Badges';
import { IncidentDayTimeline, StageProgress } from '@/components/timeline/Timeline';
import { KeyValue } from '@/components/common/Panel';
import { MediaGrid } from '@/components/common/Media';
import { AIAnalysisPanel, AnalysisState, ComplianceTable, EvidenceList } from './AnalysisPanels';
import { AllocationForm, FieldUpdateList, VerificationActions } from './Workflow';
import { downloadIncidentPdf } from '@/services/reports';
import { fmtDate, fmtDateTime, isValidCoord } from '@/utils';
import { useFlashOnChange } from '@/hooks/motion';
import { cn } from '@/lib/utils';

/** Opens/closes the shared detail drawer through the `?incident=` URL param (deep-linkable). */
export function useIncidentParam() {
  const [params, setParams] = useSearchParams();
  const id = params.get('incident');
  const tab = params.get('tab');
  const open = (incidentId: string, tabName?: string) =>
    setParams((p) => {
      p.set('incident', incidentId);
      if (tabName) p.set('tab', tabName);
      else p.delete('tab');
      return p;
    });
  const close = () =>
    setParams((p) => {
      p.delete('incident');
      p.delete('tab');
      return p;
    });
  return { id, tab, open, close };
}

type Tab = 'overview' | 'analysis' | 'evidence' | 'compliance' | 'field' | 'history' | 'manage';

export function IncidentDrawer({ role }: { role: Role }) {
  const { id, tab: tabParam, close } = useIncidentParam();
  const incident = useIncidentStore((s) => s.incidents.find((i) => i.id === id));
  const [tab, setTab] = useState<Tab>('overview');
  // Deep link to a tab, e.g. ?incident=X&tab=manage from Action & Management.
  useEffect(() => {
    if (tabParam) setTab(tabParam as Tab);
  }, [tabParam, id]);
  const statusRef = useRef<HTMLSpanElement>(null);
  useFlashOnChange(statusRef, incident?.status);

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'analysis', label: 'AI analysis' },
      { id: 'evidence', label: 'Evidence' },
      { id: 'compliance', label: 'Compliance' },
      { id: 'field', label: `Field updates${incident?.fieldUpdates.length ? ` (${incident.fieldUpdates.length})` : ''}` },
      { id: 'history', label: 'History' },
    ];
    if (role === 'admin') t.push({ id: 'manage', label: 'Allocate & verify' });
    // Citizens see a simpler view
    return role === 'citizen' ? t.filter((x) => ['overview', 'history'].includes(x.id)) : t;
  }, [role, incident?.fieldUpdates.length]);

  if (!id) return null;
  const c = incident?.complaint;
  const a = incident?.analysis;

  return (
    <Drawer
      open={!!id}
      onClose={() => {
        setTab('overview');
        close();
      }}
      title={
        incident ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-sm font-semibold">{incident.id}</span>
            {a && <SeverityBadge severity={a.severity} />}
            <span ref={statusRef} className="rounded-full">
              <StatusBadge status={incident.status} />
            </span>
          </div>
        ) : (
          <span className="text-sm">Incident not found</span>
        )
      }
    >
      {!incident || !c ? (
        <p className="p-6 text-sm text-ink-400">This incident does not exist (it may have been removed by a demo reset).</p>
      ) : (
        <div>
          <div role="tablist" aria-label="Incident sections" className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-ink-900 px-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors', tab === t.id ? 'border-accent text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200')}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-5 p-5">
            {tab === 'overview' && (
              <>
                <section aria-label="Progress"><StageProgress incident={incident} /></section>
                <AnalysisState incident={incident} />
                <section>
                  <h3 className="eyebrow mb-1">{incident.source === 'data_import' ? 'Finding (from imported data)' : `Complaint (${c.language === 'hi' ? 'Hindi, original' : 'English'})`}</h3>
                  <p className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-ink-950/40 p-3 text-sm text-ink-100" lang={c.language}>
                    {c.originalText}
                  </p>
                  {c.language === 'hi' && (
                    <p className="mt-2 text-xs text-ink-400">
                      {c.translatedText ? <>English translation: {c.translatedText}</> : c.translationNote ?? 'Machine translation needs the backend AI service; the original Hindi text is preserved.'}
                    </p>
                  )}
                </section>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <KeyValue k="Category" v={a?.category ?? 'Pending'} />
                  <KeyValue k="Urgency" v={a?.urgency ?? 'Pending'} />
                  <KeyValue k="Reported" v={fmtDateTime(c.timestamp)} />
                  <KeyValue k="Department" v={incident.assignment?.department ?? 'Not yet assigned'} />
                  <KeyValue k="Field officer" v={incident.assignment?.officerName ?? '—'} />
                  <KeyValue k="Deadline" v={incident.assignment ? `${fmtDate(incident.assignment.deadline)} · ${incident.assignment.priority}` : '—'} />
                </dl>
                <section>
                  <h3 className="eyebrow mb-1">Location</h3>
                  <p className="flex items-start gap-1.5 text-sm text-ink-100">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                    {c.location.address || 'No address given'}
                  </p>
                  <p className="num mt-0.5 text-xs text-ink-400">
                    {isValidCoord(c.location.lat, c.location.lng) ? `${c.location.lat!.toFixed(5)}, ${c.location.lng!.toFixed(5)}` : 'Coordinates missing or invalid'}
                    {c.location.simulated && ' · simulated demo coordinates'}
                  </p>
                  {isValidCoord(c.location.lat, c.location.lng) && role === 'field' && (
                    <a
                      className="btn btn-ghost mt-2 !min-h-8 !text-xs"
                      href={`https://www.openstreetmap.org/directions?to=${c.location.lat}%2C${c.location.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Navigate with OpenStreetMap
                    </a>
                  )}
                </section>
                {c.evidenceFiles.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-2">Citizen evidence</h3>
                    <MediaGrid media={c.evidenceFiles} />
                  </section>
                )}
                {incident.importRef && (
                  <section>
                    <h3 className="eyebrow mb-1">Data provenance</h3>
                    <p className="text-[13px] text-ink-300">
                      Created from imported data: {incident.importRef.fileNames.join(', ')} · {incident.importRef.readingIds.length} linked record(s). Analysis is a rule-based preliminary assessment.
                    </p>
                  </section>
                )}
                {role === 'admin' ? (
                  <Link className="btn btn-ghost" to={`/admin/reports?for=${incident.id}`} onClick={() => close()}>
                    <FileDown size={15} aria-hidden /> Open incident report
                  </Link>
                ) : role !== 'citizen' ? (
                  <button className="btn btn-ghost" onClick={() => downloadIncidentPdf(incident)}>
                    <FileDown size={15} aria-hidden /> Download incident summary (PDF)
                  </button>
                ) : null}
              </>
            )}
            {tab === 'analysis' && (a ? <AIAnalysisPanel analysis={a} /> : <AnalysisState incident={incident} />)}
            {tab === 'evidence' && (a ? <EvidenceList evidence={a.supportingEvidence} /> : <AnalysisState incident={incident} />)}
            {tab === 'compliance' && (a ? <ComplianceTable rows={a.compliance} /> : <AnalysisState incident={incident} />)}
            {tab === 'field' && <FieldUpdateList updates={incident.fieldUpdates} />}
            {tab === 'history' && <IncidentDayTimeline incident={incident} />}
            {tab === 'manage' && role === 'admin' && (
              <>
                <section>
                  <h3 className="panel-title mb-3">Allocation</h3>
                  {incident.status === 'Verified Closed' ? (
                    <p className="text-sm text-ink-400">Closed incidents cannot be reallocated. Reopen it first.</p>
                  ) : (
                    <AllocationForm key={incident.assignment?.assignedAt ?? 'new'} incident={incident} />
                  )}
                </section>
                <section className="border-t border-[var(--line)] pt-5">
                  <h3 className="panel-title mb-3">Verification</h3>
                  {incident.fieldUpdates.filter((u) => u.type === 'action_submission').slice(-1).map((u) => (
                    <div key={u.id} className="mb-3">
                      <FieldUpdateList updates={[u]} />
                    </div>
                  ))}
                  <VerificationActions incident={incident} />
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
