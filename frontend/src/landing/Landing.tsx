import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, CalendarDays, ClipboardCheck, FileText, HardHat, LayoutDashboard, Leaf, Map, Megaphone, ShieldCheck, UploadCloud, User } from 'lucide-react';
import { useIncidentStore } from '@/context/IncidentStore';
import { APP_NAME } from '@/content/content';
import { useReducedMotion } from '@/hooks/motion';
import { dailySeriesFromReadings } from '@/services/airQuality';
import { OPEN_STATUSES } from '@/config/constants';
import { cn } from '@/lib/utils';

// Hero footage: "City traffic near a factory at sunset" (Mixkit, free licence).
// Override with VITE_HERO_VIDEO_URL or by placing /public/videos/hero.mp4.
const HERO_VIDEO = import.meta.env.VITE_HERO_VIDEO_URL || 'https://assets.mixkit.co/videos/1651/1651-720.mp4';
const HERO_POSTER = 'https://assets.mixkit.co/videos/1651/1651-thumb-720-0.jpg';

const DASHBOARDS = [
  { key: 'citizen', icon: User, title: 'Citizen', path: '/citizen', line: 'Report pollution in English or Hindi with a map pin and photos, then follow every stage.', points: ['Guided complaint form', 'Location and evidence upload', 'Four-step progress with dates'] },
  { key: 'admin', icon: LayoutDashboard, title: 'Admin', path: '/admin', line: 'Assess, allocate, verify and report from one operations console.', points: ['Incident workspace and queues', 'Action & Management board', 'Data import, analysis, reports'] },
  { key: 'stakeholder', icon: Map, title: 'Stakeholder', path: '/stakeholder', line: 'See hotspots and departmental progress on a live map.', points: ['OpenStreetMap GIS view', 'Severity markers and hotspots', 'Department and area reporting'] },
  { key: 'field', icon: HardHat, title: 'Field Officer', path: '/field', line: 'Work assigned cases on site and submit evidence for verification.', points: ['Assigned cases and deadlines', 'Inspection notes, before/after media', 'Chronological case history'] },
] as const;

const WORKFLOW = [
  { title: 'Report', icon: Megaphone, text: 'A citizen describes the problem, drops a pin and attaches photos. A unique complaint ID is issued.' },
  { title: 'Assess', icon: ShieldCheck, text: 'Rule-based analysis suggests a category, severity and possible sources, using nearby imported monitoring data where it exists.' },
  { title: 'Allocate', icon: ClipboardCheck, text: 'An administrator assigns a department, officer, priority and deadline.' },
  { title: 'Investigate', icon: HardHat, text: 'The field officer inspects, records observations and submits action with before/after evidence.' },
  { title: 'Verify & report', icon: FileText, text: 'The administrator verifies or rejects the action, then generates a formal investigation report.' },
];

const FEATURES = [
  { icon: UploadCloud, title: 'Data import & analysis', text: 'CSV, Excel, JSON, PDF and Word with provenance and NAAQS screening.', to: '/admin/import' },
  { icon: Map, title: 'GIS monitoring', text: 'Incidents and hotspots on OpenStreetMap.', to: '/stakeholder' },
  { icon: ClipboardCheck, title: 'Action & Management', text: 'Assignments, deadlines and verification at a glance.', to: '/admin/actions' },
  { icon: CalendarDays, title: 'Recorded-day timeline', text: 'Every day something was recorded, nothing invented.', to: '/admin/timeline' },
  { icon: FileText, title: 'Incident reports', text: 'Versioned 11-section reports as PDF, JSON or CSV.', to: '/admin/reports' },
  { icon: BarChart3, title: 'Air-quality trends', text: 'Daily AQI, PM2.5 and PM10 from imported readings.', to: '/admin/analytics' },
];

/** Tiny sparkline of real recorded daily AQI (no data → message). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="text-[12px] text-white/75">No monitoring data recorded yet</p>;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / Math.max(1, max - min)) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" role="img" aria-label={`Recorded daily AQI, ${values.length} days, latest ${values[values.length - 1]}`}>
      <polyline points={pts} fill="none" stroke="#9ff0d7" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const [active, setActive] = useState<(typeof DASHBOARDS)[number]['key']>('admin');
  const [step, setStep] = useState(0);
  const platformRef = useRef<HTMLElement>(null);

  const incidents = useIncidentStore((s) => s.incidents);
  const imports = useIncidentStore((s) => s.imports);
  const open = incidents.filter((i) => OPEN_STATUSES.includes(i.status)).length;
  const resolved = incidents.filter((i) => i.status === 'Verified Closed').length;
  const readings = imports.reduce((a, b) => a + b.readings.length, 0);
  const aqi = useMemo(() => dailySeriesFromReadings(imports.flatMap((b) => b.readings)).map((d) => d.aqi).filter((v): v is number => v != null).slice(-14), [imports]);
  const dash = DASHBOARDS.find((d) => d.key === active)!;

  return (
    <div className="min-h-dvh bg-ink-950 text-ink-100">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-[92vh] flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {!reduced && !videoFailed ? (
            <video className="h-full w-full object-cover" src={HERO_VIDEO} poster={HERO_POSTER} autoPlay muted loop playsInline preload="metadata" aria-hidden onError={() => setVideoFailed(true)} />
          ) : (
            <img className="h-full w-full object-cover" src={HERO_POSTER} alt="" aria-hidden onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          )}
          {/* Readability overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(6,40,46,0.82)_0%,rgba(6,40,46,0.55)_45%,rgba(6,40,46,0.25)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink-950 to-transparent" />
        </div>

        <header className="mx-auto flex w-full max-w-[1200px] items-center gap-4 px-5 py-5">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/30 backdrop-blur"><Leaf size={18} aria-hidden /></span>
            <span className="text-[18px] font-bold [font-family:var(--font-display)]">{APP_NAME}</span>
          </Link>
          <nav aria-label="Landing" className="ml-auto hidden items-center gap-6 text-[14px] text-white/85 [font-family:var(--font-nav)] md:flex">
            <a href="#platform" className="hover:text-white">Platform</a>
            <a href="#workflow" className="hover:text-white">Workflow</a>
            <a href="#features" className="hover:text-white">Features</a>
          </nav>
          <Link to="/admin" className="btn ml-auto bg-white text-accent-strong hover:bg-mint md:ml-0">Open app</Link>
        </header>

        <div className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-8 px-5 pb-16 pt-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
          <div className="glass max-w-[620px] p-7 sm:p-9">
            <p className="text-[12px] uppercase tracking-[0.14em] text-white/75 [font-family:var(--font-nav)]">Environmental Intelligence & Compliance</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.15] sm:text-[42px] [font-family:var(--font-display)]">
              See pollution, act on it, and prove it was resolved.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/85">
              One platform connecting citizens, administrators, stakeholders and field officers: complaints and monitoring data become assessed incidents, assigned actions, verified outcomes and formal reports.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="btn !min-h-11 bg-white !px-5 text-[14px] text-accent-strong hover:bg-mint" onClick={() => navigate('/citizen')}>
                Get Started <ArrowRight size={16} aria-hidden />
              </button>
              <button className="btn !min-h-11 border border-white/40 !px-5 text-[14px] text-white hover:bg-white/10" onClick={() => platformRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>
                Explore Platform
              </button>
            </div>
          </div>

          {/* Floating live panels (real store values only) */}
          <div className="hidden gap-4 lg:grid">
            <div className="glass ml-auto w-[300px] p-5">
              <p className="text-[12px] text-white/70 [font-family:var(--font-nav)]">Open incidents</p>
              <p className="num mt-1 text-[32px] font-bold">{open}</p>
              <p className="text-[12px] text-white/70">{resolved} resolved · {incidents.length} total recorded</p>
            </div>
            <div className="glass w-[300px] p-5">
              <p className="text-[12px] text-white/70 [font-family:var(--font-nav)]">Recorded daily AQI</p>
              <div className="mt-2"><Sparkline values={aqi} /></div>
              <p className="mt-1 text-[12px] text-white/70">{readings ? `${readings.toLocaleString('en-IN')} imported readings` : 'Import a monitoring dataset to see trends'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform previews ───────────────────────────────── */}
      <section id="platform" ref={platformRef} className="mx-auto max-w-[1200px] scroll-mt-6 px-5 py-16">
        <p className="eyebrow">The platform</p>
        <h2 className="mt-1 text-[28px] font-bold [font-family:var(--font-display)]">Four connected workspaces, one incident record</h2>
        <p className="mt-2 max-w-[60ch] text-[14.5px] text-ink-300">A status change in one workspace appears in all the others immediately.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div role="tablist" aria-label="Dashboards" className="flex gap-2 overflow-x-auto lg:flex-col">
            {DASHBOARDS.map((d) => (
              <button
                key={d.key}
                role="tab"
                aria-selected={active === d.key}
                onClick={() => setActive(d.key)}
                className={cn('flex shrink-0 items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors', active === d.key ? 'bg-white shadow-[var(--shadow-soft)] ring-1 ring-accent/25' : 'hover:bg-white/70')}
              >
                <d.icon size={18} className={active === d.key ? 'mt-0.5 text-accent' : 'mt-0.5 text-ink-400'} aria-hidden />
                <span>
                  <span className="block text-[14.5px] font-bold [font-family:var(--font-nav)]">{d.title}</span>
                  <span className="muted hidden lg:block">{d.line}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="glass-light relative overflow-hidden p-6">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <h3 className="text-[20px] font-bold [font-family:var(--font-display)]">{dash.title} workspace</h3>
                <p className="mt-2 text-[14px] text-ink-300">{dash.line}</p>
                <ul className="mt-4 space-y-1.5 text-[14px]">
                  {dash.points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />{p}</li>)}
                </ul>
                <Link to={dash.path} className="btn btn-primary mt-6">Open {dash.title} <ArrowRight size={15} aria-hidden /></Link>
              </div>
              <PreviewMock kind={active} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow ────────────────────────────────────────── */}
      <section id="workflow" className="border-y border-[var(--line)] bg-white">
        <div className="mx-auto max-w-[1200px] px-5 py-16">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-1 text-[28px] font-bold [font-family:var(--font-display)]">From complaint to verified resolution</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {WORKFLOW.map((w, i) => (
              <li key={w.title} className="relative">
                {i < WORKFLOW.length - 1 && <span aria-hidden className="absolute left-[calc(50%+22px)] top-[21px] hidden h-[3px] w-[calc(100%-44px)] md:block" style={{ background: i < step ? 'var(--color-accent)' : 'var(--color-ink-700)' }} />}
                <button onClick={() => setStep(i)} aria-pressed={step === i} className="flex w-full flex-col items-center text-center">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-full transition-colors', i < step ? 'bg-accent text-white' : i === step ? 'bg-white text-purple ring-[3px] ring-purple/60' : 'bg-ink-800 text-ink-400')}>
                    <w.icon size={18} aria-hidden />
                  </span>
                  <span className={cn('mt-2 text-[14px] font-bold [font-family:var(--font-nav)]', i === step ? 'text-purple' : 'text-ink-100')}>{i + 1}. {w.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-6 max-w-[62ch] text-center text-[15px] text-ink-300" aria-live="polite">{WORKFLOW[step].text}</p>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-[1200px] px-5 py-16">
        <p className="eyebrow">Capabilities</p>
        <h2 className="mt-1 text-[28px] font-bold [font-family:var(--font-display)]">Built for day-to-day environmental operations</h2>
        <div className="mt-8 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} to={f.to} className="group flex gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-white">
              <f.icon size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="flex items-center gap-1 text-[15px] font-bold [font-family:var(--font-nav)]">{f.title}<ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span>
                <span className="block text-[13.5px] text-ink-300">{f.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-6 text-[12.5px] text-ink-400">
          <span className="font-bold text-ink-200 [font-family:var(--font-display)]">{APP_NAME}</span>
          <span>Hackathon prototype · analysis is rule-based · no sample data is shown</span>
          <span className="ml-auto">Hero video: Mixkit (free licence)</span>
        </div>
      </footer>
    </div>
  );
}

/** Simplified schematic previews of each workspace (illustrative layout, no data). */
function PreviewMock({ kind }: { kind: string }) {
  const bar = (w: string, c = 'bg-ink-700') => <span className={cn('block h-2 rounded-full', c)} style={{ width: w }} />;
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-[var(--line)]" aria-hidden>
      <div className="mb-3 flex items-center gap-1.5">{['#d92d20', '#c98a00', '#1f9d55'].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.6 }} />)}</div>
      {kind === 'citizen' && (
        <div className="space-y-3">
          {bar('45%', 'bg-ink-600')}
          <div className="h-16 rounded-md bg-ink-800" />
          <div className="h-20 rounded-md bg-[#e6efe9]" />
          <div className="flex items-center gap-2">{[1, 2, 3, 4].map((n) => <span key={n} className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', n < 3 ? 'bg-accent text-white' : n === 3 ? 'text-purple ring-2 ring-purple/60' : 'bg-ink-800 text-ink-400')}>{n}</span>)}</div>
        </div>
      )}
      {kind === 'admin' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 rounded-md bg-ink-850 ring-1 ring-[var(--line)]" />)}</div>
          {[70, 85, 60, 78, 66].map((w, k) => <div key={k} className="flex items-center gap-2 border-t border-[var(--line)] pt-2">{bar(`${w}%`)}<span className="h-2 w-8 rounded-full bg-accent/50" /></div>)}
        </div>
      )}
      {kind === 'stakeholder' && (
        <div className="relative h-44 overflow-hidden rounded-md bg-[#e6efe9]">
          <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full"><path d="M0 70 Q50 40 100 60 T200 50" stroke="#cbd5d3" strokeWidth="3" fill="none" /><path d="M30 0 L60 120 M140 0 L120 120" stroke="#d8e2df" strokeWidth="4" /></svg>
          {[[30, 40, '#d92d20'], [60, 65, '#e0620b'], [75, 30, '#c98a00'], [45, 80, '#1f9d55']].map(([x, y, c], k) => <span key={k} className="absolute h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ left: `${x}%`, top: `${y}%`, background: c as string }} />)}
        </div>
      )}
      {kind === 'field' && (
        <div className="grid grid-cols-[1fr_1.6fr] gap-3">
          <div className="space-y-2">{[0, 1, 2].map((k) => <div key={k} className={cn('h-9 rounded-md', k === 0 ? 'bg-mint ring-1 ring-accent/30' : 'bg-ink-850')} />)}</div>
          <div className="space-y-2">{bar('60%', 'bg-ink-600')}<div className="h-12 rounded-md bg-ink-800" /><div className="grid grid-cols-2 gap-2"><div className="h-12 rounded-md bg-[#e6efe9]" /><div className="h-12 rounded-md bg-[#e6efe9]" /></div><span className="block h-6 w-24 rounded-md bg-accent/70" /></div>
        </div>
      )}
    </div>
  );
}
