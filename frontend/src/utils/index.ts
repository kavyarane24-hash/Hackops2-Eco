import type { MediaFile } from '@/types';

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** Human-friendly complaint id: ENV-YYMMDD-XXXX */
export function complaintId(date = new Date()) {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ENV-${y}${m}${d}-${rand}`;
}

/** Local-calendar YYYY-MM-DD, `offsetDays` from today (toISOString would use UTC). */
export function localDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function daysUntil(iso?: string) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Deterministic PRNG so simulated series stay stable across renders. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // mirrors backend MAX_IMAGE_SIZE_BYTES
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Downscale an image to a compact data URL so it can be persisted in localStorage. */
async function imageToDataUrl(file: File, maxSide = 960): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image'));
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export interface FileReadResult {
  media: MediaFile[];
  errors: string[];
}

export async function filesToMedia(files: File[], phase: MediaFile['phase']): Promise<FileReadResult> {
  const media: MediaFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      errors.push(`${file.name}: only images or videos are accepted.`);
      continue;
    }
    if (isImage && !IMAGE_TYPES.includes(file.type)) {
      errors.push(`${file.name}: use JPEG, PNG or WEBP images.`);
      continue;
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}: images must be 10 MB or smaller.`);
      continue;
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      errors.push(`${file.name}: videos must be 50 MB or smaller.`);
      continue;
    }
    try {
      const url = isImage ? await imageToDataUrl(file) : URL.createObjectURL(file);
      media.push({
        id: uid('media'),
        name: file.name,
        kind: isImage ? 'image' : 'video',
        mimeType: file.type,
        sizeBytes: file.size,
        url,
        sessionOnly: isVideo,
        phase,
        uploadedAt: new Date().toISOString(),
      });
    } catch {
      errors.push(`${file.name}: could not be read.`);
    }
  }
  return { media, errors };
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
