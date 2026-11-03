// Working state for files being uploaded and reviewed. Not persisted: a
// session ends with Confirm Import (which writes an ImportBatch to the shared
// store) or Cancel. Original File objects are kept here so Retry works.
import { create } from 'zustand';
import type { ImportBatch, ImportFile, MediaFile } from '@/types';
import { IngestError, checkSignature, extractFindings, parseCsv, parseDocx, parseExcel, parseJson, parsePdf, readFile, validateFile } from '@/services/ingest/parse';
import { autoMap, mergeValidation, normaliseTable, readingsFromFindings } from '@/services/ingest/normalise';
import { parseTimestamp } from '@/services/ingest/normalise';
import { uid } from '@/utils';

const originals = new Map<string, File>();

interface ImportSessionState {
  files: ImportFile[];
  addFiles: (files: File[]) => void;
  process: (id: string) => Promise<void>;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<ImportFile>) => void;
  clear: () => void;
  buildBatch: () => ImportBatch | null;
}

export const useImportSession = create<ImportSessionState>()((set, get) => ({
  files: [],

  addFiles: (list) => {
    const added: ImportFile[] = list.map((f) => {
      const id = uid('file');
      originals.set(id, f);
      let kind: ImportFile['kind'] = 'csv';
      let error: string | undefined;
      try {
        kind = validateFile(f);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unsupported file';
      }
      return { id, name: f.name, kind, mimeType: f.type || 'unknown', sizeBytes: f.size, uploadedAt: new Date().toISOString(), status: error ? 'Failed' : 'Uploaded', progress: 0, error };
    });
    set((s) => ({ files: [...s.files, ...added] }));
    added.filter((f) => f.status === 'Uploaded').forEach((f) => void get().process(f.id));
  },

  update: (id, patch) => set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

  process: async (id) => {
    const file = originals.get(id);
    const meta = get().files.find((f) => f.id === id);
    if (!file || !meta) return;
    const up = (patch: Partial<ImportFile>) => get().update(id, patch);
    up({ status: 'Processing', progress: 0, error: undefined, tables: undefined, sections: undefined, findings: undefined, notes: undefined });
    try {
      const kind = validateFile(file);
      const progress = (p: number) => up({ progress: Math.round(p * 0.5) });
      if (kind === 'csv' || kind === 'json') {
        const text = (await readFile(file, 'text', progress)) as string;
        const res = kind === 'csv' ? await parseCsv(text) : parseJson(text);
        const mapping = autoMap(res.tables[0].columns);
        up({ tables: res.tables, notes: res.notes, mapping, organisation: 'organisation' in res ? (res.organisation as string | undefined) : undefined });
      } else if (kind === 'excel') {
        const buf = (await readFile(file, 'buffer', progress)) as ArrayBuffer;
        checkSignature(kind, buf, file.name);
        const res = await parseExcel(buf);
        up({ tables: res.tables, notes: res.notes, mapping: autoMap(res.tables[0].columns) });
      } else if (kind === 'pdf' || kind === 'docx') {
        const buf = (await readFile(file, 'buffer', progress)) as ArrayBuffer;
        checkSignature(kind, buf, file.name);
        const sections = kind === 'pdf' ? await parsePdf(buf, (p) => up({ progress: 50 + Math.round(p * 0.45) })) : await parseDocx(buf);
        up({ sections, findings: extractFindings(sections), include: true });
      } else {
        const buf = (await readFile(file, 'buffer', progress)) as ArrayBuffer;
        checkSignature(kind, buf, file.name);
        const url = (await readFile(file, 'dataurl', () => {})) as string;
        up({ previewUrl: url, include: true, notes: ['Image preview only. OCR / image analysis is not available in this build; the image can be attached as evidence.'] });
      }
      up({ status: 'Processed', progress: 100 });
    } catch (e) {
      up({ status: 'Failed', progress: 100, error: e instanceof IngestError ? e.message : `Processing failed: ${(e as Error)?.message ?? 'unknown error'}` });
    }
  },

  remove: (id) => {
    originals.delete(id);
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
  },

  clear: () => {
    get().files.forEach((f) => originals.delete(f.id));
    set({ files: [] });
  },

  buildBatch: () => {
    const ready = get().files.filter((f) => f.status === 'Processed');
    if (!ready.length) return null;
    const batchId = uid('batch');
    const createdAt = new Date().toISOString();
    const readings: ImportBatch['readings'] = [];
    const validations = [];
    const documents: ImportBatch['documents'] = [];
    const evidence: MediaFile[] = [];
    for (const f of ready) {
      const ctx = { batchId, fileName: f.name, uploadedAt: f.uploadedAt, organisation: f.organisation };
      for (const t of f.tables ?? []) {
        const res = normaliseTable(t, f.mapping ?? autoMap(t.columns), ctx);
        readings.push(...res.readings);
        validations.push(res.validation);
      }
      if (f.findings && f.include !== false) {
        documents.push({ fileName: f.name, findings: f.findings });
        const firstDate = f.findings.find((x) => x.type === 'date');
        const ts = (firstDate && parseTimestamp(firstDate.text)?.iso) || f.uploadedAt;
        const station = f.findings.find((x) => x.type === 'location')?.text ?? f.name.replace(/\.\w+$/, '');
        readings.push(...readingsFromFindings(f.findings, { ...ctx, station: `${station} (document)`, timestamp: ts }));
      }
      if (f.kind === 'image' && f.previewUrl && f.include !== false) {
        evidence.push({ id: uid('media'), name: f.name, kind: 'image', mimeType: f.mimeType, sizeBytes: f.sizeBytes, url: f.previewUrl, uploadedAt: f.uploadedAt, phase: 'complaint' });
      }
    }
    return {
      id: batchId,
      createdAt,
      fileNames: ready.map((f) => f.name),
      readings,
      documents,
      evidence,
      validation: mergeValidation(validations),
      sourceOrganisation: ready.find((f) => f.organisation)?.organisation,
    };
  },
}));
