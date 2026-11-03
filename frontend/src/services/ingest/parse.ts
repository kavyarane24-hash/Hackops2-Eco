// File detection, validation and raw extraction. No UI code here.
// Each parser returns tables (for structured data) or text sections (for
// documents) with page/sheet/row references preserved for provenance.
import type { DocumentFinding, ExtractedTable, ImportFileKind, MeasureKey } from '@/types';

export const ACCEPT =
  '.csv,.xlsx,.xls,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.json,text/csv,application/json,application/pdf,image/png,image/jpeg,image/webp';

const LIMITS_MB: Record<ImportFileKind, number> = { csv: 20, excel: 20, json: 20, pdf: 25, docx: 15, image: 10 };

export class IngestError extends Error {}

export function detectKind(file: File): ImportFileKind | 'legacy-doc' | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'legacy-doc';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  if (ext === 'json') return 'json';
  return null;
}

/** Type + size checks before reading. Throws IngestError with a user-facing message. */
export function validateFile(file: File): ImportFileKind {
  const kind = detectKind(file);
  if (kind === 'legacy-doc') throw new IngestError('Legacy Word .doc files cannot be read in the browser. Save the document as .docx and upload again.');
  if (!kind) throw new IngestError('Unsupported file type. Use CSV, Excel, PDF, DOCX, JSON or PNG/JPG/WEBP images.');
  if (file.size === 0) throw new IngestError('The file is empty.');
  if (file.size > LIMITS_MB[kind] * 1024 * 1024) throw new IngestError(`File is larger than the ${LIMITS_MB[kind]} MB limit for ${kind.toUpperCase()} files.`);
  return kind;
}

/** Reads a file with progress callbacks (0–100). */
export function readFile(file: File, as: 'text' | 'buffer' | 'dataurl', onProgress: (p: number) => void): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    r.onerror = () => reject(new IngestError('The file could not be read (it may be locked or corrupted).'));
    r.onload = () => {
      onProgress(100);
      resolve(r.result as string | ArrayBuffer);
    };
    if (as === 'text') r.readAsText(file);
    else if (as === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}

/** Magic-number check so renamed or corrupted files are rejected, not silently parsed. */
export function checkSignature(kind: ImportFileKind, buf: ArrayBuffer, name: string) {
  const b = new Uint8Array(buf.slice(0, 8));
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const isZip = hex.startsWith('504b0304');
  const isOle = hex.startsWith('d0cf11e0');
  const ok =
    kind === 'pdf' ? hex.startsWith('25504446') :
    kind === 'docx' ? isZip :
    kind === 'excel' ? (name.toLowerCase().endsWith('.xls') ? isOle || isZip : isZip) :
    kind === 'image' ? hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || (hex.startsWith('52494646')) :
    true;
  if (!ok) throw new IngestError(`The file content does not look like a valid ${kind.toUpperCase()} file. It may be corrupted or renamed.`);
}

// ── Structured formats ──────────────────────────────────────────────────────

export async function parseCsv(text: string): Promise<{ tables: ExtractedTable[]; notes: string[] }> {
  const Papa = (await import('papaparse')).default;
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  if (!res.meta.fields?.length) throw new IngestError('No header row found in the CSV.');
  if (!res.data.length) throw new IngestError('The CSV has a header but no data rows.');
  const notes = res.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  return {
    tables: [{ sheet: 'CSV', columns: res.meta.fields, records: res.data.map((raw, i) => ({ ref: `row ${i + 2}`, raw })) }],
    notes,
  };
}

export async function parseExcel(buf: ArrayBuffer): Promise<{ tables: ExtractedTable[]; notes: string[] }> {
  const XLSX = await import('xlsx');
  let wb;
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  } catch {
    throw new IngestError('The workbook could not be opened. It may be corrupted or password-protected.');
  }
  const tables: ExtractedTable[] = [];
  const notes: string[] = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: false, dateNF: 'yyyy-mm-dd hh:mm', blankrows: false });
    // Header = first row with at least 2 non-empty cells.
    const hIdx = rows.findIndex((r) => (r as unknown[]).filter((c) => String(c ?? '').trim()).length >= 2);
    if (hIdx < 0) {
      notes.push(`Sheet "${sheet}" has no tabular data and was skipped.`);
      continue;
    }
    const columns = (rows[hIdx] as unknown[]).map((c, i) => String(c ?? '').trim() || `Column ${i + 1}`);
    const records = rows.slice(hIdx + 1).map((r, i) => ({
      ref: `${sheet} · row ${hIdx + i + 2}`,
      raw: Object.fromEntries(columns.map((c, ci) => [c, String((r as unknown[])[ci] ?? '').trim()])),
    })).filter((rec) => Object.values(rec.raw).some(Boolean));
    if (records.length) tables.push({ sheet, columns, records });
  }
  if (!tables.length) throw new IngestError('No worksheet contains tabular data.');
  return { tables, notes };
}

export function parseJson(text: string): { tables: ExtractedTable[]; notes: string[]; organisation?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new IngestError(`Invalid JSON: ${(e as Error).message}`);
  }
  const obj = data as Record<string, unknown>;
  const list = Array.isArray(data) ? data : Array.isArray(obj?.records) ? obj.records : Array.isArray(obj?.data) ? obj.data : Array.isArray(obj?.readings) ? obj.readings : null;
  if (!list) throw new IngestError('JSON must be an array of records, or an object with a "records", "data" or "readings" array.');
  const objs = (list as unknown[]).filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
  if (!objs.length) throw new IngestError('The JSON array contains no record objects.');
  const notes: string[] = [];
  if (objs.length < (list as unknown[]).length) notes.push(`${(list as unknown[]).length - objs.length} non-object entries were skipped.`);
  const columns = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return {
    tables: [{ sheet: 'JSON', columns, records: objs.map((o, i) => ({ ref: `record ${i + 1}`, raw: Object.fromEntries(columns.map((c) => [c, o[c] == null ? '' : typeof o[c] === 'object' ? JSON.stringify(o[c]) : String(o[c])])) })) }],
    notes,
    organisation: typeof obj?.source === 'string' ? obj.source : typeof obj?.organisation === 'string' ? obj.organisation : undefined,
  };
}

// ── Documents ───────────────────────────────────────────────────────────────

export async function parsePdf(buf: ArrayBuffer, onProgress: (p: number) => void): Promise<{ ref: string; text: string }[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch {
    throw new IngestError('The PDF could not be opened. It may be corrupted or password-protected.');
  }
  const sections: { ref: string; text: string }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').replace(/[ \t]+/g, ' ').trim();
    if (text) sections.push({ ref: `page ${p}`, text });
    onProgress(Math.round((p / doc.numPages) * 100));
  }
  if (!sections.length) throw new IngestError('No selectable text found. The PDF may be a scanned image; OCR is not available in this build.');
  return sections;
}

export async function parseDocx(buf: ArrayBuffer): Promise<{ ref: string; text: string }[]> {
  const mammoth = await import('mammoth');
  let raw: string;
  try {
    raw = (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  } catch {
    throw new IngestError('The Word document could not be read. It may be corrupted.');
  }
  const paras = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) throw new IngestError('The document contains no text.');
  // Group paragraphs under the most recent heading-like line (short, no full stop).
  const sections: { ref: string; text: string }[] = [];
  let heading = 'Start of document';
  paras.forEach((p, i) => {
    if (p.length < 70 && !/[.:;]$/.test(p) && /^[A-Z0-9]/.test(p)) heading = p;
    sections.push({ ref: `§ ${heading} · para ${i + 1}`, text: p });
  });
  return sections;
}

const POLLUTANT_RE = /\b(PM\s?2\.5|PM\s?10|NO2|NO₂|SO2|SO₂|CO|O3|O₃|AQI)\b[^0-9\n]{0,30}?(\d+(?:\.\d+)?)\s*(µg\/m3|µg\/m³|ug\/m3|ug\/m³|μg\/m3|μg\/m³|mg\/m3|mg\/m³)?/gi;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi;

function measureKey(raw: string): MeasureKey {
  const x = raw.toUpperCase().replace(/\s/g, '').replace('₂', '2').replace('₃', '3');
  return (x === 'PM2.5' ? 'PM2.5' : x === 'PM10' ? 'PM10' : x) as MeasureKey;
}

/**
 * Pattern-based extraction from document text. This is keyword/regex matching,
 * not language understanding; every finding keeps its page/section reference.
 */
export function extractFindings(sections: { ref: string; text: string }[]): DocumentFinding[] {
  const out: DocumentFinding[] = [];
  for (const s of sections) {
    const sentences = s.text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3);
    for (const sent of sentences) {
      const lower = sent.toLowerCase();
      const avg = /24[\s-]?h(ou)?r|daily average|24-hour/.test(lower) ? '24 hours' : /8[\s-]?h(ou)?r/.test(lower) ? '8 hours' : /hourly|1[\s-]?h(ou)?r/.test(lower) ? '1 hour' : undefined;
      for (const m of sent.matchAll(POLLUTANT_RE)) {
        out.push({ ref: s.ref, type: 'reading', text: sent.slice(0, 240), pollutant: measureKey(m[1]), value: Number(m[2]), unit: m[3]?.replace('ug', 'µg').replace('μ', 'µ'), averagingPeriod: avg });
      }
      for (const m of sent.matchAll(DATE_RE)) out.push({ ref: s.ref, type: 'date', text: m[1] });
      if (/\b(observed|noticed|found|visible|smoke|burning|emission|plume|odou?r|dust)\b/.test(lower)) out.push({ ref: s.ref, type: 'observation', text: sent.slice(0, 240) });
      if (/\b(naaqs|cpcb|air act|consent to operate|cto|e\.?p\.? act|spcb|dpcc|standard)\b/.test(lower)) out.push({ ref: s.ref, type: 'compliance_reference', text: sent.slice(0, 240) });
      if (/\b(recommend|should|must|directed|advised|action required)\b/.test(lower)) out.push({ ref: s.ref, type: 'recommendation', text: sent.slice(0, 240) });
      if (/\b(photo|photograph|annexure|exhibit|figure|attachment)\b/.test(lower)) out.push({ ref: s.ref, type: 'evidence_reference', text: sent.slice(0, 200) });
      const loc = sent.match(/\b(?:at|near|location[:\s]|site[:\s])\s*([A-Z][\w'-]+(?:[\s,]+[A-Z][\w'-]+){0,4})/);
      if (loc) out.push({ ref: s.ref, type: 'location', text: loc[1] });
      const coord = sent.match(/(\d{1,2}\.\d{3,})\s*[°]?\s*N?[,\s]+(\d{2,3}\.\d{3,})\s*[°]?\s*E?/);
      if (coord) out.push({ ref: s.ref, type: 'location', text: `${coord[1]}, ${coord[2]}` });
    }
  }
  // De-duplicate identical findings within the same section.
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.ref}|${f.type}|${f.text}|${f.value ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
