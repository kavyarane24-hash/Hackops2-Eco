// Client-side report generation (CSV + PDF). The backend reports module is a
// placeholder today, so reports are built from the shared store in the browser.
import type { Incident } from '@/types';
import { downloadBlob, fmtDate, fmtDateTime } from '@/utils';
import { APP_FULL_NAME } from '@/content/content';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function incidentsToCsv(incidents: Incident[]) {
  const header = [
    'Incident ID', 'Reported', 'Status', 'Category', 'Severity', 'Urgency', 'AI confidence',
    'Address', 'Latitude', 'Longitude', 'Department', 'Officer', 'Priority', 'Deadline',
    'Field updates', 'Closed', 'Demo data',
  ];
  const rows = incidents.map((i) => [
    i.id, i.complaint.timestamp, i.status, i.analysis?.category, i.analysis?.severity, i.analysis?.urgency,
    i.analysis ? Math.round(i.analysis.confidence * 100) + '%' : '',
    i.complaint.location.address, i.complaint.location.lat, i.complaint.location.lng,
    i.assignment?.department, i.assignment?.officerName, i.assignment?.priority, i.assignment?.deadline,
    i.fieldUpdates.length, i.closedAt ?? '', i.isDemo ? 'yes' : 'no',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(incidents: Incident[], name = 'incidents') {
  downloadBlob('﻿' + incidentsToCsv(incidents), `${name}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
}

async function pdfKit() {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable: autoTable.default };
}

/** jsPDF's built-in fonts are Latin-1; strip characters it cannot draw. */
const safe = (s: string | undefined) => (s ?? '').replace(/[^\x20-\x7E -ÿ]/g, '').replace(/µ/g, 'u');

export async function downloadSummaryPdf(incidents: Incident[]) {
  const { jsPDF, autoTable } = await pdfKit();
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(15);
  doc.text('Air Pollution Incident Summary', 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`${APP_FULL_NAME} - generated ${new Date().toLocaleString('en-IN')}`, 14, 22);
  doc.text('Contains simulated demonstration data. Source hypotheses are unverified unless closed by an officer.', 14, 27);
  const open = incidents.filter((i) => i.status !== 'Verified Closed').length;
  const critical = incidents.filter((i) => i.analysis?.severity === 'Critical').length;
  doc.setTextColor(30);
  doc.text(`Total: ${incidents.length}   Open: ${open}   Closed: ${incidents.length - open}   Critical: ${critical}`, 14, 34);
  autoTable(doc, {
    startY: 38,
    head: [['ID', 'Reported', 'Status', 'Category', 'Severity', 'Department', 'Officer', 'Deadline']],
    body: incidents.map((i) => [
      i.id, fmtDateTime(i.complaint.timestamp), i.status, safe(i.analysis?.category), i.analysis?.severity ?? '',
      safe(i.assignment?.department) || '-', safe(i.assignment?.officerName) || '-', i.assignment ? fmtDate(i.assignment.deadline) : '-',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [21, 29, 40] },
  });
  doc.save(`incident-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function downloadIncidentPdf(i: Incident) {
  const { jsPDF, autoTable } = await pdfKit();
  const doc = new jsPDF();
  const a = i.analysis;
  doc.setFontSize(15);
  doc.text(`Incident report ${i.id}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`${APP_FULL_NAME} - ${new Date().toLocaleString('en-IN')}${i.isDemo ? ' - DEMO INCIDENT (simulated)' : ''}`, 14, 22);
  doc.setTextColor(30);
  autoTable(doc, {
    startY: 28,
    theme: 'plain',
    styles: { fontSize: 9 },
    body: [
      ['Status', i.status],
      ['Reported', fmtDateTime(i.complaint.timestamp)],
      ['Location', `${safe(i.complaint.location.address)} (${i.complaint.location.lat ?? '-'}, ${i.complaint.location.lng ?? '-'})`],
      ['Complaint', i.complaint.language === 'hi' ? '[Hindi original preserved in system]' : safe(i.complaint.originalText)],
      ['Category / severity', a ? `${a.category} / ${a.severity} / urgency ${a.urgency}` : 'Pending'],
      ['AI confidence', a ? `${Math.round(a.confidence * 100)}% (classification, ${a.generatedBy})` : '-'],
      ['Assignment', i.assignment ? `${safe(i.assignment.department)} - ${safe(i.assignment.officerName)} - ${i.assignment.priority} - due ${fmtDate(i.assignment.deadline)}` : 'Not assigned'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
  });
  if (a) {
    autoTable(doc, {
      head: [['Possible source (hypothesis)', 'Confidence', 'Verification required']],
      body: a.possibleSources.map((s) => [safe(s.source), `${Math.round(s.confidence * 100)}%`, safe(s.verificationRequired.join('; '))]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [21, 29, 40] },
    });
    autoTable(doc, {
      head: [['Pollutant', 'Observed', 'Limit', 'Averaging', 'Result']],
      body: a.compliance.map((c) => [c.pollutant, `${c.observedValue} ug/m3`, `${c.standardLimit} ug/m3`, c.averagingPeriod, c.exceeded ? `Above (${c.exceedanceFactor}x)` : 'Within']),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [21, 29, 40] },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(doc.splitTextToSize(safe(a.compliance[0]?.note), 180), 14, y);
  }
  autoTable(doc, {
    head: [['Time', 'Status', 'By', 'Note']],
    body: i.history.map((h) => [fmtDateTime(h.timestamp), h.status, safe(h.actor), safe(h.note)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [21, 29, 40] },
  });
  doc.save(`${i.id}-report.pdf`);
}
