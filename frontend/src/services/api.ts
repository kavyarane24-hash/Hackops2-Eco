// Central API abstraction. Mock mode runs entirely in the browser; real mode
// calls the team's Express backend and falls back to mock per call if an
// endpoint is missing (501/404) or the server is unreachable.
//
// Backend endpoints that exist today (backend/routes):
//   GET  /api/health
//   POST /api/intelligence/upload-image      multipart field "image"
//   POST /api/intelligence/analyze-complaint 501 until the backend implements it
// Not yet on the backend (frontend uses its local store): complaints CRUD,
// allocation, field updates, verification, reports.
import type { AIAnalysisOutput, ComplaintInput, EnvironmentalReading } from '@/types';
import { mockAnalyze } from './ai';

export const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type BackendState = 'mock' | 'online' | 'offline' | 'checking';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  if (!API_BASE_URL) throw new ApiError('VITE_API_BASE_URL is not set');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Backend unreachable');
  } finally {
    clearTimeout(t);
  }
}

export async function checkBackend(): Promise<BackendState> {
  if (!USE_REAL_API) return 'mock';
  try {
    await request('/api/health', undefined, 4000);
    return 'online';
  } catch {
    return 'offline';
  }
}

/** Stores an image on the backend (validation + private storage only). */
export async function uploadImage(dataUrl: string, name: string): Promise<string | undefined> {
  if (!USE_REAL_API) return undefined;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const form = new FormData();
    form.append('image', blob, name.replace(/\.\w+$/, '') + '.jpg');
    const res = await request<{ fileInfo: { storedAs: string } }>('/api/intelligence/upload-image', {
      method: 'POST',
      body: form,
    });
    return res.fileInfo?.storedAs;
  } catch {
    return undefined; // non-fatal: the local preview is still kept
  }
}

/**
 * Analyse a complaint. Tries the backend Intelligence Engine first in real
 * mode; any failure falls back to the in-browser rule engine so the demo keeps
 * working. The result always says which engine produced it.
 */
export async function analyzeComplaint(c: ComplaintInput, readings: EnvironmentalReading[] = []): Promise<AIAnalysisOutput> {
  if (USE_REAL_API) {
    try {
      const res = await request<{ analysis: AIAnalysisOutput }>('/api/intelligence/analyze-complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          text: c.originalText,
          language: c.language,
          location: c.location,
          timestamp: c.timestamp,
          media: c.evidenceFiles.map((m) => ({ name: m.name, kind: m.kind, backendRef: m.backendRef })),
        }),
      }, 15000);
      if (res.analysis) return { ...res.analysis, generatedBy: 'backend-ai' };
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'unknown error';
      const fallback = mockAnalyze(c, readings);
      return { ...fallback, engineNote: `Backend analysis unavailable (${reason}); used the in-browser rule engine.` };
    }
  }
  // Small delay so the "analysing" state is visible in the demo.
  await new Promise((r) => setTimeout(r, 900));
  return mockAnalyze(c, readings);
}
