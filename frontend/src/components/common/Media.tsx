import { useRef, useState } from 'react';
import { Film, Trash2, Upload, VideoOff } from 'lucide-react';
import type { MediaFile } from '@/types';
import { filesToMedia, fmtBytes } from '@/utils';
import { Modal } from './Overlay';
import { Spinner } from './Panel';
import { cn } from '@/lib/utils';

/** Drag-and-drop / click uploader with validation and previews. */
export function MediaUploader({
  id,
  value,
  onChange,
  phase,
  label = 'Add photos or videos',
  help,
}: {
  id: string;
  value: MediaFile[];
  onChange: (m: MediaFile[]) => void;
  phase: MediaFile['phase'];
  label?: string;
  help?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const res = await filesToMedia(Array.from(files), phase);
    setErrors(res.errors);
    onChange([...value, ...res.media]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
          drag ? 'border-accent bg-accent-soft' : 'border-[var(--line-strong)] bg-ink-950/40',
        )}
       
      >
        <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-ghost" disabled={busy} aria-describedby={help ? `${id}-help` : undefined}>
          {busy ? <Spinner size={14} /> : <Upload size={15} aria-hidden />}
          {label}
        </button>
        <p className="text-xs text-ink-400">or drag files here</p>
        {help && <p id={`${id}-help`} className="text-xs text-ink-500">{help}</p>}
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/*"
          multiple
          className="sr-only"
          onChange={(e) => void add(e.target.files)}
        />
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-0.5 text-xs text-[#fca5a5]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {value.length > 0 && <MediaGrid media={value} onRemove={(mid) => onChange(value.filter((m) => m.id !== mid))} className="mt-3" />}
    </div>
  );
}

export function MediaGrid({ media, onRemove, className }: { media: MediaFile[]; onRemove?: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState<MediaFile | null>(null);
  if (!media.length) return null;
  return (
    <>
      <ul className={cn('grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2', className)}>
        {media.map((m) => (
          <li key={m.id} className="group relative overflow-hidden rounded-lg border border-[var(--line)] bg-ink-950">
            <button
              type="button"
              onClick={() => setOpen(m)}
              className="block aspect-[4/3] w-full"
             
              aria-label={`Open ${m.name}`}
            >
              <MediaThumb m={m} />
            </button>
            <div className="flex items-center justify-between gap-1 px-2 py-1">
              <span className="truncate text-[11px] text-ink-300" title={m.name}>{m.name}</span>
              {m.phase && m.phase !== 'complaint' && (
                <span className="num text-[10px] uppercase text-accent">{m.phase}</span>
              )}
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                className="absolute right-1 top-1 rounded-md bg-ink-950/80 p-1 text-ink-200 hover:text-sev-critical"
                aria-label={`Remove ${m.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg bg-ink-950">
              {open.kind === 'image' ? (
                <img src={open.url} alt={open.name} className="max-h-[60vh] w-full object-contain" />
              ) : (
                <VideoPlayer m={open} />
              )}
            </div>
            <p className="num text-xs text-ink-400">
              {open.mimeType} · {fmtBytes(open.sizeBytes)} · {new Date(open.uploadedAt).toLocaleString('en-IN')}
              {open.backendRef && ` · stored on backend as ${open.backendRef}`}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

function MediaThumb({ m }: { m: MediaFile }) {
  if (m.kind === 'image') return <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink-850 text-ink-300">
      <Film size={22} aria-hidden />
      <span className="text-[10px] uppercase tracking-wider">Video</span>
    </div>
  );
}

function VideoPlayer({ m }: { m: MediaFile }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-ink-400">
        <VideoOff size={24} aria-hidden />
        <p className="text-sm">This video was attached in an earlier session and is no longer available in this browser.</p>
      </div>
    );
  return <video src={m.url} controls className="max-h-[60vh] w-full" onError={() => setFailed(true)} />;
}
