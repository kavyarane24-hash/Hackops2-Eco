// Incident investigation report: one structured model rendered two ways
// (HTML preview in ReportDocument.tsx, and a paginated PDF here). All content
// comes from the frozen report snapshot; nothing is invented.
import type { IncidentReport } from '@/types';
import { NAAQS } from '@/config/constants';
import { APP_FULL_NAME } from '@/content/content';
import { downloadBlob, fmtDate, fmtDateTime } from '@/utils';

export type Block =
  | { kind: 'kv'; rows: [string, string][] }
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { kind: 'chart'; points: { label: string; pm25?: number; pm10?: number }[]; caption: string }
  | { kind: 'images'; items: { url: string; caption: string }[] };

export interface ReportSection {
  num: number;
  title: string;
  blocks: Block[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));

export function buildReportModel(r: IncidentReport): ReportSection[] {
  const i = r.snapshot.incident;
  const a = i.analysis;
  const c = i.complaint;
  const pot = r.snapshot.potential;
  const readings = r.snapshot.readings;
  const coords = c.location.lat != null && c.location.lng != null ? `${c.location.lat.toFixed(5)}, ${c.location.lng.toFixed(5)}` : 'Not available';
  const period = pot ? `${fmtDateTime(pot.periodStart)} to ${fmtDateTime(pot.periodEnd)}` : fmtDateTime(c.timestamp);
  const lastVerification = i.verifications[i.verifications.length - 1];

  const s: ReportSection[] = [];

  s.push({
    num: 1,
    title: 'Report Information',
    blocks: [
      {
        kind: 'kv',
        rows: [
          ['Report ID', r.id],
          ['Incident ID', i.id],
          ['Version', `v${r.version} (${r.status})`],
          ['Generated', `${fmtDateTime(r.generatedAt)} by ${r.generatedBy}`],
          ['Reporting source', i.source === 'data_import' ? 'Environmental data import' : 'Citizen complaint portal'],
          ['Department', i.assignment?.department ?? 'Not yet assigned'],
          ['Incident status at generation', r.incidentStatusAtGeneration],
          ['Data sources', r.dataSources.join('; ')],
        ],
      },
      ...(i.isDemo ? [{ kind: 'note' as const, text: 'This incident is part of the seeded demonstration data set. Its readings, locations and evidence are simulated.' }] : []),
    ],
  });

  s.push({
    num: 2,
    title: 'Executive Summary',
    blocks: [
      { kind: 'para', text: a?.summary ?? c.originalText },
      {
        kind: 'kv',
        rows: [
          ['Location / affected area', c.location.address || 'Not stated'],
          ['Observation period', period],
          ['Main environmental concern', a ? `${a.category} (${a.severity} severity)` : 'Pending assessment'],
          ['Current status', i.status],
        ],
      },
    ],
  });

  s.push({
    num: 3,
    title: 'Incident Details',
    blocks: [
      {
        kind: 'kv',
        rows: [
          ['Category', dash(a?.category)],
          ['Severity', dash(a?.severity)],
          ['Urgency', dash(a?.urgency)],
          ['Location', c.location.address || '—'],
          ['Coordinates', coords + (c.location.simulated ? ' (simulated demo coordinates)' : '')],
          ['Reported', fmtDateTime(c.timestamp)],
        ],
      },
      ...(i.source !== 'data_import'
        ? [
            { kind: 'para' as const, text: `Citizen complaint (${c.language === 'hi' ? 'Hindi, original text preserved' : 'English'}): “${c.language === 'hi' ? c.originalText : c.originalText}”` },
            ...(c.translatedText ? [{ kind: 'para' as const, text: `Translation: ${c.translatedText}` }] : []),
          ]
        : [{ kind: 'para' as const, text: `No citizen complaint is attached. The incident was created from imported monitoring data${pot?.relatedComplaintIds.length ? `; related complaints nearby: ${pot.relatedComplaintIds.join(', ')}` : ''}.` }]),
      ...(readings.length ? [{ kind: 'para' as const, text: `${readings.length} monitoring record(s) from ${[...new Set(readings.map((x) => x.fileName))].join(', ')} are linked to this incident.` }] : []),
    ],
  });

  const env: Block[] = [];
  if (a) {
    const ctx = a.environmentalContext;
    env.push({
      kind: 'kv',
      rows: [
        ['Station / source', ctx.stationName],
        ['AQI (peak / daily)', `${ctx.aqi} (${ctx.aqiCategory})${ctx.simulated ? ' (simulated)' : ''}`],
        ['PM2.5 (highest 24-h)', `${ctx.pm25_24h} µg/m³`],
        ['PM10 (highest 24-h)', `${ctx.pm10_24h} µg/m³`],
      ],
    });
  }
  if (r.snapshot.daily.length) {
    env.push({ kind: 'chart', points: r.snapshot.daily.map((d) => ({ label: d.day.slice(5), pm25: d.pm25, pm10: d.pm10 })), caption: `Figure 1. Daily PM2.5 and PM10 averages (µg/m³) from imported data with NAAQS 24-hour limits (PM2.5 ${NAAQS.limits[0].limit}, PM10 ${NAAQS.limits[2].limit}). Days with fewer than 16 hourly values are partial and not valid 24-h averages.` });
    env.push({
      kind: 'table',
      head: ['Day', 'PM2.5 (µg/m³)', 'PM10 (µg/m³)', 'AQI (max/derived)', 'Values'],
      rows: r.snapshot.daily.map((d) => [d.day, dash(d.pm25), dash(d.pm10), dash(d.aqiMax), String(d.hours)]),
      caption: 'Table 1. Daily aggregates. Averaging: 24 hours where at least 16 hourly values exist.',
    });
  }
  if (pot?.spikes.length) {
    env.push({ kind: 'table', head: ['Time', 'Pollutant', 'Value', 'Baseline', 'Source reference'], rows: pot.spikes.slice(0, 12).map((x) => [fmtDateTime(x.timestamp), x.pollutant, String(x.value), `~${x.baseline}`, x.ref]), caption: 'Table 2. Identified short-term spikes (value ≥ 1.8× the median of the preceding 24 values).' });
  }
  if (a?.trendEstimate) env.push({ kind: 'note', text: `Trend: ${a.trendEstimate.direction}. ${a.trendEstimate.method}. ${a.trendEstimate.disclaimer}` });
  if (!env.length) env.push({ kind: 'para', text: 'No environmental measurements are linked to this incident.' });
  s.push({ num: 4, title: 'Environmental Data Analysis', blocks: env });

  s.push({
    num: 5,
    title: 'Potential Source Analysis',
    blocks: a
      ? [
          { kind: 'table', head: ['Possible source (hypothesis)', 'Confidence', 'Contrary evidence', 'Verification required'], rows: a.possibleSources.map((h) => [h.source, pct(h.confidence), h.contraryEvidence.join('; ') || 'None recorded', h.verificationRequired.join('; ')]) },
          { kind: 'list', items: a.contradictoryEvidence.length ? a.contradictoryEvidence : ['No contradictory evidence recorded.'] },
          { kind: 'note', text: 'Confidence expresses how strongly the available evidence supports each hypothesis. It is not the share of pollution contributed by a source. No source is identified as responsible until confirmed by inspection.' },
        ]
      : [{ kind: 'para', text: 'No source analysis available.' }],
  });

  s.push({
    num: 6,
    title: 'Regulatory and Compliance Assessment',
    blocks: a?.compliance.length
      ? [
          { kind: 'table', head: ['Pollutant', 'Observed', 'Limit', 'Unit', 'Averaging', 'Result'], rows: a.compliance.map((x) => [x.pollutant, `${x.observedValue} (${x.observedAveragingPeriod})`, Number.isFinite(x.standardLimit) ? String(x.standardLimit) : '—', x.unit, x.averagingPeriod, x.assessment]), caption: `Standard: ${a.compliance[0].standardName}. Source: ${a.compliance[0].reference}.` },
          { kind: 'list', items: [...new Set(a.compliance.map((x) => x.note))] },
          { kind: 'note', text: 'This is a screening comparison, not a statutory determination. No legal notice is implied.' },
        ]
      : [{ kind: 'para', text: 'Insufficient data for assessment.' }],
  });

  const evidenceRows = (a?.supportingEvidence ?? []).map((e) => [e.type.replace('_', ' '), e.title, e.source, fmtDateTime(e.timestamp), e.simulated ? 'Simulated' : e.reliability ?? '—']);
  const images = [
    ...c.evidenceFiles.filter((m) => m.kind === 'image').map((m) => ({ url: m.url, caption: `${m.name} · ${i.source === 'data_import' ? 'attached at import' : 'citizen upload'} · ${fmtDateTime(m.uploadedAt)}` })),
    ...i.fieldUpdates.flatMap((u) => [...u.beforeMedia, ...u.afterMedia].filter((m) => m.kind === 'image').map((m) => ({ url: m.url, caption: `${m.phase === 'after' ? 'After action' : m.phase === 'before' ? 'Before action' : 'Field'}: ${m.name} · ${u.officerName} · ${fmtDateTime(u.timestamp)}` }))),
  ];
  const videos = [...c.evidenceFiles, ...i.fieldUpdates.flatMap((u) => [...u.beforeMedia, ...u.afterMedia])].filter((m) => m.kind === 'video');
  const docExcerpts = r.snapshot.documents.flatMap((d) => d.findings.filter((f) => f.type !== 'date').slice(0, 12).map((f) => [d.fileName, f.ref, f.type.replace('_', ' '), f.text]));
  s.push({
    num: 7,
    title: 'Evidence and Documentation',
    blocks: [
      evidenceRows.length ? { kind: 'table', head: ['Type', 'Evidence', 'Source / file', 'Timestamp', 'Reliability'], rows: evidenceRows } : { kind: 'para', text: 'No evidence items recorded.' },
      ...(images.length ? [{ kind: 'images' as const, items: images.slice(0, 8) }] : []),
      ...(videos.length ? [{ kind: 'list' as const, items: videos.map((v) => `Video: ${v.name} (${fmtDateTime(v.uploadedAt)}), held in the application, not embedded in this document.`) }] : []),
      ...(docExcerpts.length ? [{ kind: 'table' as const, head: ['File', 'Page / section', 'Finding', 'Excerpt'], rows: docExcerpts, caption: 'Document excerpts found by pattern matching; confirm against originals.' }] : []),
      ...(readings.length ? [{ kind: 'table' as const, head: ['File', 'Reference', 'Station', 'Timestamp', 'Values'], rows: readings.slice(0, 15).map((x) => [x.fileName, x.ref, x.station, fmtDateTime(x.timestamp), Object.entries(x.values).map(([k, v]) => `${k} ${v} ${x.units[k as keyof typeof x.units] ?? ''}`).join(', ')]), caption: `Sample of linked monitoring records (${Math.min(15, readings.length)} of ${readings.length}). Full records are in the CSV export.` }] : []),
    ],
  });

  s.push({
    num: 8,
    title: 'Recommended Actions',
    blocks: [
      { kind: 'list', items: a?.recommendations ?? ['Assess the complaint and schedule an inspection.'] },
      {
        kind: 'kv',
        rows: [
          ['Responsible department', i.assignment?.department ?? pot?.suggestedDepartment ?? 'To be assigned'],
          ['Officer', i.assignment?.officerName ?? 'To be assigned'],
          ['Follow-up deadline', i.assignment ? fmtDate(i.assignment.deadline) : pot ? `${fmtDate(pot.suggestedDeadline)} (suggested)` : '—'],
          ['Additional evidence required', (pot?.missingInformation ?? ['Site inspection record']).join('; ')],
        ],
      },
    ],
  });

  s.push({
    num: 9,
    title: 'Investigation History',
    blocks: [
      ...(i.assignment ? [{ kind: 'kv' as const, rows: [['Assigned to', `${i.assignment.officerName} (${i.assignment.department})`], ['Assigned', `${fmtDateTime(i.assignment.assignedAt)} by ${i.assignment.assignedBy}`], ['Priority / deadline', `${i.assignment.priority} · ${fmtDate(i.assignment.deadline)}`], ['Instructions', i.assignment.instructions ?? '—']] as [string, string][] }] : [{ kind: 'para' as const, text: 'Not yet assigned.' }]),
      ...(i.fieldUpdates.length ? [{ kind: 'table' as const, head: ['Time', 'Officer', 'Type', 'Inspection notes', 'Observations', 'Action taken'], rows: i.fieldUpdates.map((u) => [fmtDateTime(u.timestamp), u.officerName, u.type === 'action_submission' ? 'Action submitted' : 'Inspection', u.inspectionNotes || '—', u.observations || '—', u.actionTaken || '—']) }] : []),
      ...(i.verifications.length ? [{ kind: 'table' as const, head: ['Time', 'Decision', 'By', 'Note'], rows: i.verifications.map((v) => [fmtDateTime(v.at), v.decision.replace('_', ' '), v.by, v.note]) }] : []),
      { kind: 'table', head: ['Time', 'Status', 'Actor', 'Note'], rows: i.history.map((h) => [fmtDateTime(h.timestamp), h.status, `${h.actor} (${h.role})`, h.note ?? '']), caption: 'Status changes.' },
    ],
  });

  s.push({
    num: 10,
    title: 'AI Analysis and Limitations',
    blocks: [
      { kind: 'kv', rows: [['Engine', a ? (a.generatedBy === 'backend-ai' ? 'Backend AI service' : 'In-browser rule-based assessment (mock). No AI model was used.') : '—'], ['Classification confidence', a ? pct(a.confidence) : '—'], ['Generated', a ? fmtDateTime(a.generatedAt) : '—']] },
      { kind: 'list', items: [...(pot?.missingInformation ?? []), ...(a?.engineNote ? [a.engineNote] : []), 'All findings are preliminary and require human verification before any regulatory action.', ...(readings.some((x) => x.extractionStatus === 'warning') ? [`${readings.filter((x) => x.extractionStatus === 'warning').length} linked record(s) had data-quality warnings during import.`] : [])] },
    ],
  });

  s.push({
    num: 11,
    title: 'Final Assessment',
    blocks: [
      {
        kind: 'kv',
        rows: [
          ['Current status', i.status],
          ['Verification outcome', lastVerification ? `${lastVerification.decision.replace('_', ' ')} (${fmtDateTime(lastVerification.at)}, ${lastVerification.by})` : 'Not yet verified'],
          ['Final observations', lastVerification?.note ?? (i.fieldUpdates[i.fieldUpdates.length - 1]?.actionTaken || 'None recorded')],
          ['Pending actions', i.status === 'Verified Closed' ? 'None' : i.status === 'Verification Pending' ? 'Administrator verification of submitted action' : i.assignment ? 'Field investigation and action submission' : 'Allocation to department and officer'],
          ['Closure', i.closedAt ? fmtDateTime(i.closedAt) : 'Open'],
        ],
      },
    ],
  });

  return s;
}

export const REPORT_DISCLAIMER =
  'Prepared from application records for investigation support. Source attributions are hypotheses; compliance comparisons are screening results, not statutory determinations. Simulated or demonstration data is labelled where present.';

// ── PDF ─────────────────────────────────────────────────────────────────────

/** jsPDF core fonts are Latin-1: map common symbols and strip the rest. */
const t = (s: string) => s.replace(/µ/g, 'u').replace(/³/g, '3').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/×/g, 'x').replace(/≥/g, '>=').replace(/[^\x20-\x7E -ÿ]/g, '');

export async function downloadReportPdf(r: IncidentReport) {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = at.default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = M;
  const navy: [number, number, number] = [19, 50, 74];

  const ensure = (h: number) => {
    if (y + h > H - 18) {
      doc.addPage();
      y = M + 4;
    }
  };

  // Title block
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Environmental Incident Investigation Report', M, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(t(`${APP_FULL_NAME}  |  ${r.id}  |  ${r.status}`), M, 21);
  doc.text(t(`Generated ${fmtDateTime(r.generatedAt)}`), M, 26);
  doc.setTextColor(30);
  y = 38;

  for (const sec of buildReportModel(r)) {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...navy);
    doc.text(t(`${sec.num}. ${sec.title}`), M, y);
    doc.setDrawColor(200, 210, 216);
    doc.line(M, y + 1.5, W - M, y + 1.5);
    y += 6;
    doc.setTextColor(30);
    for (const b of sec.blocks) {
      if (b.kind === 'para' || b.kind === 'note') {
        doc.setFont('times', b.kind === 'note' ? 'italic' : 'normal');
        doc.setFontSize(b.kind === 'note' ? 9.5 : 10.5);
        const lines = doc.splitTextToSize(t(b.text), W - 2 * M);
        ensure(lines.length * 4.6 + 2);
        doc.text(lines, M, y);
        y += lines.length * 4.6 + 2.5;
      } else if (b.kind === 'list') {
        doc.setFont('times', 'normal');
        doc.setFontSize(10.5);
        for (const it of b.items) {
          const lines = doc.splitTextToSize(t(it), W - 2 * M - 5);
          ensure(lines.length * 4.6 + 1);
          doc.text('•', M + 1, y);
          doc.text(lines, M + 5, y);
          y += lines.length * 4.6 + 1;
        }
        y += 1.5;
      } else if (b.kind === 'kv' || b.kind === 'table') {
        const head = b.kind === 'kv' ? undefined : [b.head.map(t)];
        const body = b.kind === 'kv' ? b.rows.map(([k, v]) => [t(k), t(v)]) : b.rows.map((row) => row.map(t));
        autoTable(doc, {
          startY: y,
          head,
          body,
          margin: { left: M, right: M, bottom: 20 },
          theme: b.kind === 'kv' ? 'plain' : 'grid',
          styles: { font: 'times', fontSize: 9, cellPadding: 1.6, overflow: 'linebreak' },
          headStyles: { font: 'helvetica', fillColor: [233, 238, 241], textColor: navy, fontStyle: 'bold' },
          columnStyles: b.kind === 'kv' ? { 0: { font: 'helvetica', fontStyle: 'bold', cellWidth: 52, textColor: [75, 90, 102] } } : {},
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
        if (b.kind === 'table' && b.caption) {
          doc.setFont('times', 'italic');
          doc.setFontSize(8.5);
          const lines = doc.splitTextToSize(t(b.caption), W - 2 * M);
          ensure(lines.length * 3.8);
          doc.text(lines, M, y + 2);
          y += lines.length * 3.8 + 2;
        }
        y += 2;
      } else if (b.kind === 'chart') {
        const ch = 58;
        ensure(ch + 14);
        drawChart(doc, b.points, M, y, W - 2 * M, ch);
        y += ch + 3;
        doc.setFont('times', 'italic');
        doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(t(b.caption), W - 2 * M);
        doc.text(lines, M, y);
        y += lines.length * 3.8 + 3;
      } else if (b.kind === 'images') {
        const size = (W - 2 * M - 9) / 4;
        for (let k = 0; k < b.items.length; k += 4) {
          ensure(size * 0.75 + 12);
          b.items.slice(k, k + 4).forEach((img, j) => {
            const x = M + j * (size + 3);
            try {
              if (img.url.startsWith('data:image/jpeg') || img.url.startsWith('data:image/png')) doc.addImage(img.url, img.url.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, size, size * 0.75);
              else {
                doc.setDrawColor(190);
                doc.rect(x, y, size, size * 0.75);
                doc.setFontSize(7);
                doc.text('Image not embeddable', x + 2, y + 6);
              }
            } catch {
              doc.rect(x, y, size, size * 0.75);
            }
            doc.setFont('times', 'italic');
            doc.setFontSize(7);
            doc.text(doc.splitTextToSize(t(img.caption), size), x, y + size * 0.75 + 3);
          });
          y += size * 0.75 + 11;
        }
      }
    }
    y += 3;
  }

  // Disclaimer
  ensure(16);
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text(doc.splitTextToSize(t(REPORT_DISCLAIMER), W - 2 * M), M, y);

  // Header/footer with page numbers on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    if (p > 1) doc.text(t(`${r.id}  |  Incident ${r.incidentId}`), M, 9);
    doc.text(t(`Page ${p} of ${pages}`), W - M, H - 8, { align: 'right' });
    doc.text(t(`Source: ${NAAQS.reference.slice(0, 70)}`), M, H - 8);
  }
  doc.save(`${r.id}.pdf`);
}

function drawChart(doc: import('jspdf').jsPDF, pts: { label: string; pm25?: number; pm10?: number }[], x: number, y: number, w: number, h: number) {
  const pad = { l: 12, b: 8, t: 4, r: 4 };
  const max = Math.max(110, ...pts.flatMap((p) => [p.pm25 ?? 0, p.pm10 ?? 0])) * 1.1;
  const cw = w - pad.l - pad.r, chh = h - pad.t - pad.b;
  const px = (i: number) => x + pad.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw);
  const py = (v: number) => y + pad.t + chh - (v / max) * chh;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.rect(x + pad.l, y + pad.t, cw, chh);
  doc.setFontSize(7);
  doc.setTextColor(100);
  for (let k = 0; k <= 4; k++) {
    const v = (max / 4) * k;
    doc.text(String(Math.round(v)), x + pad.l - 1.5, py(v) + 1, { align: 'right' });
  }
  pts.forEach((p, i) => doc.text(p.label, px(i), y + h - 2, { align: 'center' }));
  const limit = (v: number, rgb: [number, number, number], label: string) => {
    doc.setDrawColor(...rgb);
    doc.setLineDashPattern([1.5, 1.2], 0);
    doc.line(x + pad.l, py(v), x + pad.l + cw, py(v));
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...rgb);
    doc.text(label, x + pad.l + cw - 1, py(v) - 1, { align: 'right' });
  };
  limit(60, [200, 120, 30], 'PM2.5 24-h limit 60');
  limit(100, [190, 50, 50], 'PM10 24-h limit 100');
  const line = (key: 'pm25' | 'pm10', rgb: [number, number, number]) => {
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.6);
    const ps = pts.map((p, i) => (p[key] != null ? [px(i), py(p[key]!)] : null)).filter(Boolean) as number[][];
    ps.slice(1).forEach((q, k) => doc.line(ps[k][0], ps[k][1], q[0], q[1]));
    ps.forEach(([a, b]) => doc.circle(a, b, 0.7, 'F'));
  };
  doc.setFillColor(35, 122, 205);
  line('pm25', [35, 122, 205]);
  doc.setFillColor(135, 78, 43);
  line('pm10', [135, 78, 43]);
  doc.setLineWidth(0.2);
  doc.setFontSize(7.5);
  doc.setTextColor(35, 122, 205);
  doc.text('PM2.5', x + pad.l + 2, y + pad.t + 4);
  doc.setTextColor(135, 78, 43);
  doc.text('PM10', x + pad.l + 14, y + pad.t + 4);
  doc.text('ug/m3', x + 1, y + pad.t + 2);
  doc.setTextColor(30);
}

export function exportReportJson(r: IncidentReport) {
  downloadBlob(JSON.stringify({ report: { id: r.id, incidentId: r.incidentId, version: r.version, status: r.status, generatedAt: r.generatedAt, dataSources: r.dataSources }, sections: buildReportModel(r).map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.kind === 'images' ? { kind: 'images', items: b.items.map((x) => ({ caption: x.caption })) } : b)) })) }, null, 2), `${r.id}.json`, 'application/json');
}

export function exportReportReadingsCsv(r: IncidentReport) {
  const rows = r.snapshot.readings;
  const keys = ['AQI', 'PM2.5', 'PM10', 'NO2', 'SO2', 'CO', 'O3'] as const;
  const head = ['reading_id', 'file', 'reference', 'station', 'timestamp', 'averaging', ...keys.flatMap((k) => [k, `${k}_unit`]), 'status', 'transformations'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((x) => [x.id, x.fileName, x.ref, x.station, x.timestamp, x.averagingPeriod, ...keys.flatMap((k) => [x.values[k], x.units[k]]), x.extractionStatus, x.transformations.join('; ')].map(esc).join(','));
  downloadBlob('﻿' + [head.join(','), ...body].join('\n'), `${r.id}-records.csv`, 'text/csv;charset=utf-8');
}
