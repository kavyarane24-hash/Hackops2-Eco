import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, ChevronDown, FileImage, FileJson, FileSpreadsheet, FileText, FileType, RotateCw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import type { DailyAggregate, FieldKey, ImportFile, PotentialIncident } from '@/types';
import { useImportSession } from '@/context/importSession';
import { useIncidentStore, OFFICERS } from '@/context/IncidentStore';
import { toast } from '@/context/uiStore';
import { Panel, EmptyState, Field, Spinner } from '@/components/common/Panel';
import { SeverityBadge, UrgencyBadge } from '@/components/common/Badges';
import { Drawer } from '@/components/common/Overlay';
import { AIAnalysisPanel, ComplianceTable, EvidenceList } from '@/components/incidents/AnalysisPanels';
import { useIncidentParam } from '@/components/incidents/IncidentDrawer';
import { ACCEPT } from '@/services/ingest/parse';
import { FIELD_LABEL, normaliseTable } from '@/services/ingest/normalise';
import { DEPARTMENTS } from '@/config/constants';
import { fmtBytes, fmtDateTime, isValidCoord } from '@/utils';
import { cn } from '@/lib/utils';

const KIND_ICON = { csv: FileSpreadsheet, excel: FileSpreadsheet, json: FileJson, pdf: FileText, docx: FileType, image: FileImage } as const;
const STATUS_TONE: Record<ImportFile['status'], string> = { Uploaded: '#a9bac4', Processing: '#3f86c9', Processed: '#1f8a5b', Failed: '#c0362c' };

export default function DataImport() {
  const { files, addFiles, process, remove, update, clear, buildBatch } = useImportSession();
  const importEnvironmentalData = useIncidentStore((s) => s.importEnvironmentalData);
  const potentials = useIncidentStore((s) => s.potentials);
  const imports = useIncidentStore((s) => s.imports);
  const [drag, setDrag] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<PotentialIncident | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processed = files.filter((f) => f.status === 'Processed');
  const busy = files.some((f) => f.status === 'Processing' || f.status === 'Uploaded');
  const active = files.find((f) => f.id === activeId) ?? processed[0];

  const confirmImport = () => {
    const batch = buildBatch();
    if (!batch) return;
    if (!batch.readings.length && !batch.documents.length && !batch.evidence.length) {
      toast('Nothing to import: no valid records, document findings or images.', 'error');
      return;
    }
    const found = importEnvironmentalData(batch);
    clear();
    setActiveId(null);
    toast(`Imported ${batch.readings.length} records from ${batch.fileNames.length} file(s). ${found.length} potential incident(s) identified.`, found.length ? 'success' : 'info');
  };

  const pending = potentials.filter((p) => p.status === 'pending');

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-[13px] text-ink-300 [font-family:var(--font-small)]">
        Upload monitoring datasets, inspection reports and photos. Files are parsed in your browser, reviewed here, and only imported when you confirm. The analysis is a rule-based preliminary assessment, not an AI model.
      </p>

      {/* 1. Upload */}
      <Panel title="1 · Upload files" description="CSV, Excel (.xlsx/.xls), JSON, PDF, Word (.docx) and images (PNG/JPG/WEBP). Multiple files allowed.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)); }}
          className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-[var(--line-strong)] bg-[var(--surface-sunken)]')}
        >
          <UploadCloud size={26} className="text-ink-400" aria-hidden />
          <p className="text-[14px] text-ink-200">Drag files here, or</p>
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Browse files</button>
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Choose files to import" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <p className="muted">Limits: CSV/Excel/JSON 20 MB · PDF 25 MB · DOCX 15 MB · images 10 MB. Legacy .doc is not supported.</p>
        </div>
        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {files.map((f) => {
              const Icon = KIND_ICON[f.kind];
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Icon size={18} className="shrink-0 text-ink-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-ink-100" title={f.name}>{f.name}</p>
                    <p className="muted">{(f.name.split(".").pop() ?? f.kind).toUpperCase()} · {fmtBytes(f.sizeBytes)} · {fmtDateTime(f.uploadedAt)}</p>
                    {f.status === 'Processing' && (
                      <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={f.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Processing ${f.name}`}>
                        <div className="h-full bg-azure transition-all" style={{ width: `${Math.max(5, f.progress)}%` }} />
                      </div>
                    )}
                    {f.error && <p role="alert" className="mt-0.5 text-[12.5px] text-[#b42318]">{f.error}</p>}
                  </div>
                  <span className="chip" style={{ color: STATUS_TONE[f.status], borderColor: `${STATUS_TONE[f.status]}55` }}>
                    {f.status === 'Processing' && <Spinner size={10} />}
                    {f.status}
                  </span>
                  <div className="flex gap-1">
                    {f.status === 'Processed' && <button className="btn btn-quiet !min-h-8" onClick={() => setActiveId(f.id)}>Review</button>}
                    {(f.status === 'Failed' || f.status === 'Processed') && f.kind && (
                      <button className="btn btn-quiet !min-h-8 !px-2" onClick={() => void process(f.id)} title="Retry processing" aria-label={`Retry ${f.name}`}><RotateCw size={14} /></button>
                    )}
                    <button className="btn btn-quiet !min-h-8 !px-2" onClick={() => remove(f.id)} title="Remove file" aria-label={`Remove ${f.name}`}><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* 2. Review */}
      {processed.length > 0 && active && (
        <Panel
          title="2 · Review extracted data"
          description="Check field mappings and validation before importing. Nothing is saved until you confirm."
          actions={
            <>
              <button className="btn btn-quiet" onClick={() => { clear(); setActiveId(null); toast('Import cancelled', 'info'); }}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={confirmImport}>
                <CheckCircle2 size={15} aria-hidden /> Confirm import ({processed.length} file{processed.length === 1 ? '' : 's'})
              </button>
            </>
          }
        >
          {processed.length > 1 && (
            <div className="tabs mb-4" role="tablist" aria-label="Files">
              {processed.map((f) => (
                <button key={f.id} role="tab" aria-selected={active.id === f.id} className="tab" onClick={() => setActiveId(f.id)}>{f.name}</button>
              ))}
            </div>
          )}
          <FileReview file={active} onChange={(patch) => update(active.id, patch)} />
        </Panel>
      )}

      {/* 3. Potential incidents */}
      <Panel title="3 · Potential incidents" description="Preliminary findings from imported data. Review each one before it becomes a shared incident.">
        {pending.length === 0 ? (
          <EmptyState title="No potential incidents awaiting review" body={imports.length ? 'Imported data did not meet the detection rules, or every finding has been reviewed.' : 'Import a dataset to run the analysis.'} />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="panel-title">{p.title}</p>
                    <SeverityBadge severity={p.analysis.severity} />
                    <UrgencyBadge urgency={p.analysis.urgency} />
                  </div>
                  <p className="muted mt-1">
                    {fmtDateTime(p.periodStart)} – {fmtDateTime(p.periodEnd)} · {p.pollutants.join(', ')} · confidence {Math.round(p.analysis.confidence * 100)}% · {isValidCoord(p.location.lat, p.location.lng) ? 'has coordinates' : 'no coordinates'}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-300">{p.analysis.compliance.filter((c) => c.assessment !== 'Within selected reference limit').map((c) => `${c.pollutant}: ${c.assessment.toLowerCase()}`).join(' · ') || 'No reference-limit concerns'}</p>
                </div>
                <button className="btn btn-primary" onClick={() => setReviewing(p)}>Review analysis</button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* History */}
      {imports.length > 0 && (
        <Panel title="Import history" description="Every confirmed import keeps its file names and record references">
          <table className="w-full text-[13px]">
            <thead className="text-left text-ink-400"><tr><th className="pb-2 font-normal">Imported</th><th className="pb-2 font-normal">Files</th><th className="pb-2 text-right font-normal">Records</th><th className="pb-2 text-right font-normal">Issues</th><th className="pb-2 text-right font-normal">Findings</th></tr></thead>
            <tbody>
              {imports.map((b) => {
                const pots = potentials.filter((p) => p.batchId === b.id);
                return (
                  <tr key={b.id} className="border-t border-[var(--line)] align-top">
                    <td className="num py-2 pr-3">{fmtDateTime(b.createdAt)}</td>
                    <td className="py-2 pr-3">{b.fileNames.join(', ')}</td>
                    <td className="num py-2 text-right">{b.readings.length}</td>
                    <td className="num py-2 text-right">{b.validation.invalidRecords} invalid · {b.validation.duplicateRecords} dup</td>
                    <td className="py-2 text-right">
                      {pots.length === 0 ? <span className="muted">none</span> : pots.map((p) => (
                        <span key={p.id} className="ml-1 inline-block">
                          {p.incidentId ? <IncidentLink id={p.incidentId} /> : <span className="chip">{p.status}</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <PotentialReview potential={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}

function IncidentLink({ id }: { id: string }) {
  const { open } = useIncidentParam();
  return <button className="num text-accent hover:underline" onClick={() => open(id)}>{id}</button>;
}

// ── Review of one processed file ─────────────────────────────────────────────

function FileReview({ file, onChange }: { file: ImportFile; onChange: (patch: Partial<ImportFile>) => void }) {
  if (file.tables) return <TableReview file={file} onChange={onChange} />;
  if (file.findings) return <DocumentReview file={file} onChange={onChange} />;
  if (file.previewUrl)
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <img src={file.previewUrl} alt={`Preview of ${file.name}`} className="max-h-72 w-full rounded-lg object-contain bg-ink-950" />
        <div className="space-y-3 text-[13.5px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={file.include !== false} onChange={(e) => onChange({ include: e.target.checked })} className="accent-[#087f8c]" />
            Attach this image as evidence to findings from this import
          </label>
          <p className="muted">OCR and image analysis are not available in this build, so no text or visual interpretation is extracted. An image alone does not prove a pollution violation.</p>
        </div>
      </div>
    );
  return null;
}

function TableReview({ file, onChange }: { file: ImportFile; onChange: (patch: Partial<ImportFile>) => void }) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const table = file.tables![Math.min(sheetIdx, file.tables!.length - 1)];
  const mapping = file.mapping ?? {};
  const result = useMemo(
    () => normaliseTable(table, Object.fromEntries(table.columns.map((c) => [c, mapping[c] ?? 'ignore'])), { batchId: 'preview', fileName: file.name, uploadedAt: file.uploadedAt, organisation: file.organisation }),
    [table, mapping, file.name, file.uploadedAt, file.organisation],
  );
  const v = result.validation;
  const errors = v.issues.filter((i) => i.level === 'error');
  const blocking = errors.filter((e) => !e.ref.includes('row') && !e.ref.includes('record'));

  return (
    <div className="space-y-5">
      {file.tables!.length > 1 && (
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-ink-400">Worksheet</span>
          <select className="input !w-auto" value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
            {file.tables!.map((t, i) => <option key={t.sheet} value={i}>{t.sheet} ({t.records.length} rows)</option>)}
          </select>
        </label>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Records', v.totalRecords],
          ['Valid', v.validRecords],
          ['With warnings', v.warningRecords],
          ['Invalid', v.invalidRecords],
          ['Duplicates', v.duplicateRecords],
          ['Extraction confidence', `${Math.round(v.confidence * 100)}%`],
        ].map(([k, val]) => (
          <div key={k as string}>
            <dt className="eyebrow">{k}</dt>
            <dd className="num text-[18px] font-bold">{val}</dd>
          </div>
        ))}
      </dl>
      {blocking.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-sev-critical/10 px-3 py-2 text-[13px] text-[#b42318]">
          <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> {blocking.map((b) => b.message).join(' ')}
        </p>
      )}

      <section>
        <h3 className="panel-title mb-2">Field mapping</h3>
        <p className="muted mb-3">Detected automatically from column names. Correct anything that is wrong; validation updates as you change it.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="text-left text-ink-400"><tr><th className="pb-2 font-normal">Column in file</th><th className="pb-2 font-normal">Maps to</th><th className="pb-2 font-normal">Sample values</th><th className="pb-2 text-right font-normal">Empty</th></tr></thead>
            <tbody>
              {table.columns.map((c) => {
                const empty = table.records.filter((r) => !r.raw[c]?.trim()).length;
                return (
                  <tr key={c} className="border-t border-[var(--line)]">
                    <td className="num py-1.5 pr-3">{c}</td>
                    <td className="py-1.5 pr-3">
                      <select aria-label={`Mapping for ${c}`} className="input !py-1 !text-[13px]" value={mapping[c] ?? 'ignore'} onChange={(e) => onChange({ mapping: { ...mapping, [c]: e.target.value as FieldKey } })}>
                        {(Object.keys(FIELD_LABEL) as FieldKey[]).map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[260px] truncate py-1.5 pr-3 text-ink-300">{table.records.slice(0, 3).map((r) => r.raw[c]).filter(Boolean).join(' · ')}</td>
                    <td className={cn('num py-1.5 text-right', empty ? 'text-sev-medium' : 'text-ink-400')}>{empty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <button className="flex items-center gap-2 text-[13.5px] text-ink-200" aria-expanded={showIssues} onClick={() => setShowIssues((x) => !x)}>
          <ChevronDown size={15} className={cn('transition-transform', showIssues && 'rotate-180')} aria-hidden />
          <AlertTriangle size={14} className="text-sev-medium" aria-hidden /> Validation issues ({v.issues.length})
          {Object.keys(v.missingByField).length > 0 && <span className="muted">· missing: {Object.entries(v.missingByField).map(([k, n]) => `${k} ${n}`).join(', ')}</span>}
        </button>
        {showIssues && (
          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-md bg-[var(--surface-sunken)] p-3 text-[12.5px]">
            {v.issues.slice(0, 200).map((i, k) => (
              <li key={k} className={i.level === 'error' ? 'text-[#b42318]' : 'text-ink-300'}>
                <span className="num text-ink-400">{i.ref}</span> · {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="panel-title mb-2">Normalised preview</h3>
        {result.readings.length === 0 ? (
          <p className="muted">No valid records with the current mapping.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead className="text-left text-ink-400"><tr><th className="pb-1.5 font-normal">Ref</th><th className="pb-1.5 font-normal">Station</th><th className="pb-1.5 font-normal">Timestamp</th><th className="pb-1.5 font-normal">Averaging</th><th className="pb-1.5 font-normal">Values</th><th className="pb-1.5 font-normal">Transformations</th></tr></thead>
              <tbody>
                {result.readings.slice(0, 8).map((r) => (
                  <tr key={r.id} className="border-t border-[var(--line)] align-top">
                    <td className="num py-1.5 pr-2 text-ink-400">{r.ref}</td>
                    <td className="py-1.5 pr-2">{r.station}</td>
                    <td className="num py-1.5 pr-2">{fmtDateTime(r.timestamp)}</td>
                    <td className="py-1.5 pr-2">{r.averagingPeriod}</td>
                    <td className="num py-1.5 pr-2">{Object.entries(r.values).map(([k, val]) => `${k} ${val}`).join(' · ')}</td>
                    <td className="py-1.5 text-ink-400">{[...new Set(r.transformations)].slice(0, 2).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted mt-2">Showing 8 of {result.readings.length} valid records.</p>
          </div>
        )}
      </section>
      {file.notes?.length ? <p className="muted">Parser notes: {file.notes.join(' ')}</p> : null}
    </div>
  );
}

function DocumentReview({ file, onChange }: { file: ImportFile; onChange: (patch: Partial<ImportFile>) => void }) {
  const groups = useMemo(() => {
    const g: Record<string, typeof file.findings> = {};
    file.findings!.forEach((f) => (g[f.type] ??= []).push(f));
    return g;
  }, [file.findings]);
  const [openText, setOpenText] = useState(false);
  const LABEL: Record<string, string> = { reading: 'Pollutant readings', observation: 'Observations', location: 'Locations', date: 'Dates', compliance_reference: 'Compliance references', recommendation: 'Recommendations', evidence_reference: 'Evidence references' };
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" checked={file.include !== false} onChange={(e) => onChange({ include: e.target.checked })} className="accent-[#087f8c]" />
        Include findings from this document in the import
      </label>
      <p className="muted">Extracted by keyword and pattern matching, not language understanding. Every item keeps its page or section reference. Readings without a stated averaging period cannot be compared with NAAQS limits.</p>
      {file.findings!.length === 0 && <p className="text-[13px] text-sev-medium">No recognisable readings, dates, observations or references were found.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(groups).map(([type, list]) => (
          <section key={type}>
            <h3 className="panel-title mb-1.5">{LABEL[type] ?? type} <span className="muted">({list!.length})</span></h3>
            <ul className="space-y-1 text-[13px]">
              {list!.slice(0, 8).map((f, i) => (
                <li key={i}>
                  <span className="num text-ink-400">[{f.ref}]</span>{' '}
                  {f.type === 'reading' ? <strong>{f.pollutant} {f.value} {f.unit ?? '(unit not stated)'} · {f.averagingPeriod ?? 'averaging not stated'}</strong> : f.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <button className="flex items-center gap-2 text-[13px] text-ink-300" aria-expanded={openText} onClick={() => setOpenText((x) => !x)}>
        <ChevronDown size={14} className={cn('transition-transform', openText && 'rotate-180')} aria-hidden /> Extracted text ({file.sections?.length ?? 0} sections)
      </button>
      {openText && (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md bg-[var(--surface-sunken)] p-3 text-[12.5px] [font-family:var(--font-report)]">
          {file.sections!.slice(0, 60).map((s, i) => <p key={i}><span className="num text-ink-400">[{s.ref}]</span> {s.text}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Potential incident review & approval ─────────────────────────────────────

function DailyChart({ daily }: { daily: DailyAggregate[] }) {
  if (!daily.length) return <p className="muted">No daily aggregates.</p>;
  return (
    <div className="h-56" role="img" aria-label="Daily PM2.5 and PM10 averages with NAAQS 24-hour limits">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daily.map((d) => ({ day: d.day.slice(5), 'PM2.5': d.pm25, PM10: d.pm10 }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#ffffff14" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: '#a9bac4', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#a9bac4', fontSize: 11 }} tickLine={false} axisLine={false} width={40} label={{ value: 'µg/m³', angle: -90, position: 'insideLeft', fill: '#75858f', fontSize: 11, dx: 10 }} />
          <Tooltip contentStyle={{ background: '#1C3334', border: '1px solid #ffffff22', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} µg/m³`]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={60} stroke="#f5b83d" strokeDasharray="4 4" label={{ value: 'PM2.5 24-h limit 60', fill: '#f5b83d', fontSize: 10, position: 'insideTopLeft' }} />
          <ReferenceLine y={100} stroke="#c0362c" strokeDasharray="4 4" label={{ value: 'PM10 24-h limit 100', fill: '#c0362c', fontSize: 10, position: 'insideTopRight' }} />
          <Area type="monotone" dataKey="PM2.5" stroke="#3f86c9" fill="#3f86c933" strokeWidth={2} />
          <Area type="monotone" dataKey="PM10" stroke="#c0784a" fill="#c0784a22" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PotentialReview({ potential, onClose }: { potential: PotentialIncident | null; onClose: () => void }) {
  const approveIncident = useIncidentStore((s) => s.approveIncident);
  const dismissPotential = useIncidentStore((s) => s.dismissPotential);
  const allocateIncident = useIncidentStore((s) => s.allocateIncident);
  const live = useIncidentStore((s) => s.potentials.find((p) => p.id === potential?.id));
  const { open } = useIncidentParam();
  const [tab, setTab] = useState<'summary' | 'analysis' | 'evidence' | 'compliance'>('summary');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [title, setTitle] = useState('');
  const [assignNow, setAssignNow] = useState(false);
  const [dept, setDept] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset local form when a different potential opens.
  const key = potential?.id;
  const [loadedKey, setLoadedKey] = useState<string | undefined>();
  if (potential && key !== loadedKey) {
    setLoadedKey(key);
    setLat(potential.location.lat?.toString() ?? '');
    setLng(potential.location.lng?.toString() ?? '');
    setTitle(potential.title);
    setDept(potential.suggestedDepartment);
    setOfficerId(potential.suggestedOfficerId);
    setDeadline(potential.suggestedDeadline);
    setTab('summary');
    setError('');
    setLastId(null);
    setAssignNow(false);
  }
  if (!potential) return null;
  const p = live ?? potential;

  const approve = () => {
    const la = lat.trim() ? Number(lat) : null;
    const ln = lng.trim() ? Number(lng) : null;
    if ((la != null || ln != null) && !isValidCoord(la, ln)) return setError('Coordinates must be valid latitude (−90 to 90) and longitude (−180 to 180), or both left blank.');
    const id = approveIncident(p.id, { title, lat: la, lng: ln });
    if (!id) return setError('This finding has already been reviewed.');
    if (assignNow && officerId) allocateIncident(id, { department: dept, officerId, priority: p.analysis.severity === 'Critical' ? 'P1' : p.analysis.severity === 'High' ? 'P2' : 'P3', deadline, assignedBy: 'Admin', instructions: p.nextSteps[0] });
    setLastId(id);
    toast(`Incident ${id} created${assignNow ? ' and assigned' : ''}`);
  };

  return (
    <Drawer open onClose={onClose} title={<span className="panel-title">{p.title}</span>}>
      <div className="tabs sticky top-0 z-10 bg-ink-900 px-4" role="tablist">
        {(['summary', 'analysis', 'evidence', 'compliance'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab capitalize" onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="space-y-5 p-5">
        <p className="rounded-md bg-sev-medium/10 px-3 py-2 text-[13px] text-[#8a5a00]">Preliminary assessment generated by in-browser rules from imported data. No AI model was used. Requires human verification.</p>

        {tab === 'summary' && (
          <>
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={p.analysis.severity} />
              <UrgencyBadge urgency={p.analysis.urgency} />
              <span className="chip">Confidence {Math.round(p.analysis.confidence * 100)}%</span>
              <span className="chip">{p.analysis.category}</span>
            </div>
            <p className="text-[14px] text-ink-200">{p.analysis.summary}</p>
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
              <div><dt className="eyebrow">Station</dt><dd>{p.station}</dd></div>
              <div><dt className="eyebrow">Period</dt><dd className="num">{fmtDateTime(p.periodStart)} – {fmtDateTime(p.periodEnd)}</dd></div>
              <div><dt className="eyebrow">Pollutants</dt><dd>{p.pollutants.join(', ')}</dd></div>
              <div><dt className="eyebrow">Records</dt><dd className="num">{p.readingIds.length}</dd></div>
              <div><dt className="eyebrow">Spikes</dt><dd className="num">{p.spikes.length}</dd></div>
              <div><dt className="eyebrow">Related complaints</dt><dd>{p.relatedComplaintIds.join(', ') || 'None nearby'}</dd></div>
            </dl>
            <DailyChart daily={p.daily} />
            <div className="grid gap-4 md:grid-cols-2">
              <section>
                <h3 className="panel-title mb-1.5">Missing information</h3>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-300">{p.missingInformation.map((m) => <li key={m}>{m}</li>)}</ul>
              </section>
              <section>
                <h3 className="panel-title mb-1.5">Recommended next steps</h3>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-300">{p.nextSteps.map((m) => <li key={m}>{m}</li>)}</ul>
              </section>
            </div>
          </>
        )}
        {tab === 'analysis' && <AIAnalysisPanel analysis={p.analysis} />}
        {tab === 'evidence' && <EvidenceList evidence={p.analysis.supportingEvidence} />}
        {tab === 'compliance' && <ComplianceTable rows={p.analysis.compliance} />}

        <section className="border-t border-[var(--line)] pt-5">
          <h3 className="section-title mb-3">Decision</h3>
          {p.status !== 'pending' ? (
            <div className="flex flex-wrap items-center gap-3 text-[14px]">
              <span className="chip">{p.status}</span>
              {p.incidentId && (
                <>
                  <button className="btn btn-primary" onClick={() => { onClose(); open(p.incidentId!); }}>Open incident {p.incidentId}</button>
                  <Link className="btn btn-ghost" to={`/admin/reports?for=${p.incidentId}`} onClick={onClose}>Generate report</Link>
                </>
              )}
              {lastId && <span className="muted">Now in the incident table and on the stakeholder map (if coordinates were given).</span>}
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Incident title" htmlFor="pot-title"><input id="pot-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Latitude" htmlFor="pot-lat" help="Needed for the GIS map"><input id="pot-lat" className="input num" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 28.6139" /></Field>
                <Field label="Longitude" htmlFor="pot-lng"><input id="pot-lng" className="input num" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. 77.2090" /></Field>
              </div>
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={assignNow} onChange={(e) => setAssignNow(e.target.checked)} className="accent-[#087f8c]" />
                Also assign now (suggested: {OFFICERS.find((o) => o.id === p.suggestedOfficerId)?.name}, {p.suggestedDepartment})
              </label>
              {assignNow && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Department" htmlFor="pot-dept"><select id="pot-dept" className="input" value={dept} onChange={(e) => setDept(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
                  <Field label="Officer" htmlFor="pot-off"><select id="pot-off" className="input" value={officerId} onChange={(e) => setOfficerId(e.target.value)}>{OFFICERS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                  <Field label="Deadline" htmlFor="pot-dl"><input id="pot-dl" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
                </div>
              )}
              {error && <p role="alert" className="text-[13px] text-[#b42318]">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={approve}><CheckCircle2 size={15} aria-hidden /> Approve & create incident</button>
                <button className="btn btn-ghost" onClick={() => { dismissPotential(p.id, 'Not an incident after review'); toast('Finding dismissed', 'info'); onClose(); }}>Dismiss finding</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
