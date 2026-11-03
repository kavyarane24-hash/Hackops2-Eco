import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Megaphone } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { useUI } from '@/context/uiStore';
import { citizenCopy } from '@/content/content';
import { DEMO_REPORTER_ID } from '@/services/mockData';
import { Panel, EmptyState, PageHeader } from '@/components/common/Panel';
import { SeverityBadge } from '@/components/common/Badges';
import { StageProgress } from '@/components/timeline/Timeline';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { useReveal } from '@/hooks/motion';
import { fmtDateTime } from '@/utils';

/** Citizen › My complaints: tracking, separate from the report form. */
export default function CitizenComplaints() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  const lang = useUI((s) => s.citizenLang);
  const t = citizenCopy(lang);
  const incidents = useIncidentStore((s) => s.incidents);
  const mine = useMemo(() => incidents.filter((i) => i.reporterId === DEMO_REPORTER_ID), [incidents]);
  const { open } = useIncidentParam();

  return (
    <div ref={scope} className="space-y-5">
      <PageHeader
        eyebrow="Citizen"
        title={<span lang={lang}>{t.myComplaints}</span>}
        description="Progress of each complaint, with the date every stage was reached. Select one for its full history."
        actions={<Link to="/citizen" className="btn btn-primary"><Megaphone size={15} aria-hidden /> Report pollution</Link>}
      />
      {mine.length === 0 ? (
        <Panel>
          <EmptyState title={t.noComplaints} action={<Link to="/citizen" className="btn btn-primary mt-2">Report pollution</Link>} />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {mine.map((i) => (
            <li key={i.id} className="panel reveal">
              <button className="w-full px-5 py-4 text-left transition-colors hover:bg-ink-850" onClick={() => open(i.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[14px] font-bold text-ink-100">{i.id}</span>
                  {i.analysis && <SeverityBadge severity={i.analysis.severity} />}
                  <span className="muted">{fmtDateTime(i.complaint.timestamp)}{i.assignment && ` · ${i.assignment.department}`}</span>
                  <ChevronRight size={16} className="ml-auto text-ink-500" aria-hidden />
                </div>
                <p className="mt-1 line-clamp-1 text-[13.5px] text-ink-300" lang={i.complaint.language}>{i.complaint.originalText}</p>
                <div className="mt-4 max-w-2xl">
                  <StageProgress incident={i} />
                </div>
                {i.status === 'Reopened' && <p className="muted mt-2">Reopened for further action.</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
