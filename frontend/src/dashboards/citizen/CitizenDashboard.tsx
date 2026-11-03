import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, Languages, Send } from 'lucide-react';
import type { Language, MediaFile } from '@/types';
import { useIncidentStore } from '@/context/IncidentStore';
import { toast, useUI } from '@/context/uiStore';
import { citizenCopy } from '@/content/content';
import { Panel, Field, Spinner } from '@/components/common/Panel';
import { MediaUploader } from '@/components/common/Media';
import { LocationPicker } from '@/components/maps/LocationPicker';
import { LiveEnvironmentalCard } from '@/components/common/LiveEnvironmentalCard';
import { useLenis, useReveal } from '@/hooks/motion';
import { isValidCoord } from '@/utils';
import { cn } from '@/lib/utils';


export default function CitizenDashboard() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  useLenis(true);

  const { citizenLang, setCitizenLang } = useUI();
  const t = citizenCopy(citizenLang);
  const submitComplaint = useIncidentStore((s) => s.submitComplaint);

  const [text, setText] = useState('');
  const [language, setLanguage] = useState<Language>(citizenLang);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (text.trim().length < 15) e.text = t.errText;
    if (!isValidCoord(lat, lng)) e.location = t.errLocation;
    if (address.trim().length < 3) e.address = t.errAddress;
    setErrors(e);
    if (Object.keys(e).length) document.getElementById(e.text ? 'c-text' : e.address ? 'c-address' : 'c-location')?.focus();
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const id = await submitComplaint({
        originalText: text.trim(),
        language,
        translationNote: language === 'hi' ? 'Original Hindi text preserved. English translation will be added by the backend AI service when available.' : undefined,
        location: { address: address.trim(), lat, lng },
        evidenceFiles: media,
        reporterName: name.trim() || undefined,
        reporterContact: contact.trim() || undefined,
      });
      setSubmittedId(id);
      toast(`${t.successTitle}: ${id}`);
      setText('');
      setMedia([]);
      setAddress('');
      setLat(null);
      setLng(null);
    } catch {
      toast('Could not submit the complaint. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div ref={scope} className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
      <div className="space-y-5">
        <div className="reveal flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Citizen portal</p>
            <h1 className="page-title" lang={citizenLang}>{t.title}</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-300" lang={citizenLang}>{t.subtitle}</p>
          </div>
          <div role="group" aria-label="Interface language" className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] p-0.5">
            <Languages size={14} className="ml-2 text-ink-400" aria-hidden />
            {(['en', 'hi'] as Language[]).map((l) => (
              <button
                key={l}
                aria-pressed={citizenLang === l}
                onClick={() => {
                  setCitizenLang(l);
                  setLanguage(l);
                }}
                className={cn('rounded-md px-3 py-1 text-xs font-medium', citizenLang === l ? 'bg-accent text-ink-950' : 'text-ink-300 hover:text-ink-100')}
              >
                {l === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
        </div>

        {submittedId && (
          <div className="reveal panel-solid flex flex-wrap items-center gap-3 border-sev-low/40 px-4 py-3" role="status">
            <CheckCircle2 className="text-sev-low" size={22} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" lang={citizenLang}>{t.successTitle}</p>
              <p className="text-xs text-ink-300" lang={citizenLang}>{t.successBody}</p>
            </div>
            <span className="num rounded-md border border-accent/40 bg-accent-soft px-2.5 py-1 text-sm font-semibold text-accent">{submittedId}</span>
            <button
              className="btn btn-ghost !min-h-8 !px-2"
              aria-label="Copy complaint ID"
              onClick={() => {
                navigator.clipboard?.writeText(submittedId).then(() => toast('Complaint ID copied', 'info'), () => {});
              }}
            >
              <Copy size={14} />
            </button>
            <Link className="btn btn-ghost !min-h-8" to={`/citizen/complaints?incident=${submittedId}`}>
              {t.track}
            </Link>
          </div>
        )}

        <Panel
          title={<span lang={citizenLang}>{t.title}</span>}
        >
          <form onSubmit={onSubmit} noValidate className="space-y-4" lang={citizenLang}>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label={t.description} htmlFor="c-text" help={t.descriptionHelp} error={errors.text} required>
                <textarea
                  id="c-text"
                  rows={4}
                  className="input"
                  value={text}
                  lang={language}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => errors.text && text.trim().length >= 15 && setErrors((x) => ({ ...x, text: '' }))}
                  placeholder={t.descriptionPlaceholder}
                  aria-invalid={!!errors.text}
                  aria-describedby={errors.text ? 'c-text-error' : 'c-text-help'}
                />
              </Field>
              <Field label={t.language} htmlFor="c-lang">
                <select id="c-lang" className="input sm:w-36" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </select>
              </Field>
            </div>

            <div>
              <p className="field-label">
                {t.location} <span className="text-sev-critical" aria-hidden>*</span>
              </p>
              <p className="mb-2 text-xs text-ink-400">{t.locationHelp}</p>
              <div id="c-location" tabIndex={-1} className="outline-none">
                <LocationPicker
                  lat={lat}
                  lng={lng}
                  onChange={(a, b) => {
                    setLat(a);
                    setLng(b);
                    setErrors((x) => ({ ...x, location: '' }));
                  }}
                  useMyLocationLabel={t.useMyLocation}
                  invalid={!!errors.location}
                />
              </div>
              {isValidCoord(lat, lng) && (
                <div className="mt-3">
                  <LiveEnvironmentalCard
                    lat={lat}
                    lon={lng}
                    locationName={address || 'Selected complaint coordinates'}
                    compact
                  />
                </div>
              )}
              {errors.location && <p role="alert" className="mt-1 text-xs text-[#b42318]">{errors.location}</p>}
            </div>

            <Field label={t.address} htmlFor="c-address" error={errors.address} required>
              <input id="c-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t.addressPlaceholder} aria-invalid={!!errors.address} autoComplete="street-address" />
            </Field>

            <div>
              <p className="field-label">{t.evidence}</p>
              <MediaUploader id="c-media" value={media} onChange={setMedia} phase="complaint" help={t.evidenceHelp} label={t.evidence.replace(/\s*\(.*\)/, '')} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.name} htmlFor="c-name">
                <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label={t.contact} htmlFor="c-contact">
                <input id="c-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="tel" />
              </Field>
            </div>

            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={submitting}>
              {submitting ? <Spinner size={14} /> : <Send size={15} aria-hidden />}
              {submitting ? t.submitting : t.submit}
            </button>
          </form>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="How your report is handled" eyebrow="Process">
          <ol className="space-y-2 text-sm text-ink-300">
            {['AI assesses category, severity and likely sources', 'An administrator assigns the responsible department and officer', 'A field officer inspects and takes action', 'The administrator verifies the action and closes the case'].map((s, idx) => (
              <li key={s} className="flex gap-3">
                <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 text-[10px] text-accent">{idx + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
