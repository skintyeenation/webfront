'use client';
import { useEffect, useState } from 'react';
import type { FundingProgram } from '@skintyee/models';
import { programSlug } from '@skintyee/models';
import { formUrlFor } from '@/lib/funding-forms';
import dynamic from 'next/dynamic';
import { PROGRAM_GUIDE } from '@/lib/constants';
import { ProgramTitle, ProgramDetail } from './ProgramDetail';

// react-pdf touches browser-only APIs — load the viewer client-side only.
const PdfViewerModal = dynamic(() => import('./PdfViewerModal').then((m) => m.PdfViewerModal), {
  ssr: false,
});

// `area` makes each option self-routing (the funding hub spans every area); `group` is the
// area display name used to group the dropdown when options come from more than one area;
// `program` is the full record so the form can show its details inline once selected.
export type SubmissionOption = { area: string; group?: string; program: FundingProgram };

const label = (o: SubmissionOption) =>
  o.program.acronym ? `${o.program.acronym} — ${o.program.name}` : o.program.name;

// Client form for the funding submission portal (Phase 1b). Reused on each program page
// (one area) and the funding hub (all areas). Posts a completed PAW + supporting documents
// to /api/program-submission, which files them into the selected program's <area>/<slug>/
// folder (repo / SharePoint mirror).
export function ProgramSubmissionForm({
  options,
  userEmail,
}: {
  options: SubmissionOption[];
  userEmail?: string;
}) {
  const [selected, setSelected] = useState(0);
  const [kind, setKind] = useState<'paw' | 'dci'>('paw');
  const [project, setProject] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);
  // Pre-generated submission GUID (shown as a preview + sent so the stored id matches).
  // Generated on the client to avoid an SSR/hydration mismatch.
  const [sid, setSid] = useState('');
  useEffect(() => {
    setSid(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '');
  }, []);
  const whoSlug = (userEmail || 'member').split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const titleSlug =
    (project || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
    'untitled';
  const uid = sid ? `${titleSlug}_${whoSlug}_${sid.slice(0, 8)}` : '';

  // Preselect the program + kind from a `#apply=<kind>:<area>/<slug>` deep-link (the cards'
  // "Upload PAW" button and the calendar's "Apply" links). `<kind>:` is optional (defaults paw).
  useEffect(() => {
    const sync = () => {
      const m = window.location.hash.match(/^#apply=(?:(paw|dci):)?([^/]+)\/(.+)$/);
      if (!m) return;
      const [, k, area, slug] = m;
      if (k === 'paw' || k === 'dci') setKind(k);
      const i = options.findIndex((o) => o.area === area && programSlug(o.program) === slug);
      if (i >= 0) setSelected(i);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [options]);

  const grouped = options.some((o) => o.group);
  const [showReview, setShowReview] = useState(false);

  // Submit button → validate, then open the review modal (no POST yet).
  function review(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'paw' && !project.trim()) {
      setStatus('error');
      setMessage('Enter the application title (the PAW’s “Application title”).');
      return;
    }
    if (!files || !files.length) {
      setStatus('error');
      setMessage('Attach at least one document.');
      return;
    }
    setStatus('idle');
    setMessage('');
    setShowReview(true);
  }

  // Confirmed in the modal → actually POST.
  async function doSubmit() {
    const opt = options[selected];
    if (!opt || !files || !files.length) return;
    setStatus('sending');
    setMessage('');
    const fd = new FormData();
    fd.set('area', opt.area);
    fd.set('programName', opt.program.name);
    if (opt.program.acronym) fd.set('acronym', opt.program.acronym);
    fd.set('kind', kind);
    if (project.trim()) fd.set('project', project.trim());
    if (sid) fd.set('id', sid);
    fd.set('notes', notes);
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      const res = await fetch('/api/program-submission', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed.');
      setShowReview(false);
      setSubmittedId(data.id || '');
      setStatus('done');
      setMessage('Received. Skin Tyee staff will review your submission.');
      setProject('');
      setNotes('');
      setFiles(null);
      setSid(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Submission failed.');
    }
  }

  if (status === 'done') {
    return (
      <div className="mt-4 rounded-lg bg-[#e8f3ec] p-4 text-sm text-ink/80">
        <p className="font-semibold text-primary">Submission received</p>
        <p className="mt-1">{message}</p>
        {submittedId && (
          <p className="mt-1 text-xs text-ink/55">
            Reference ID: <span className="font-mono">{submittedId}</span>
          </p>
        )}
      </div>
    );
  }

  const selectedOpt = options[selected];

  return (
    <>
    <form onSubmit={review} className="mt-4 space-y-3 text-sm">
      <label className="block">
        <span className="font-semibold text-ink/70">Program / application</span>
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
        >
          {grouped
            ? Object.entries(
                options.reduce<Record<string, number[]>>((acc, o, i) => {
                  const g = o.group || 'Other';
                  (acc[g] ||= []).push(i);
                  return acc;
                }, {}),
              ).map(([group, idxs]) => (
                <optgroup key={group} label={group}>
                  {idxs.map((i) => (
                    <option key={i} value={i}>
                      {label(options[i])}
                    </option>
                  ))}
                </optgroup>
              ))
            : options.map((o, i) => (
                <option key={i} value={i}>
                  {label(o)}
                </option>
              ))}
        </select>
      </label>

      <div>
        <span className="block font-semibold text-ink/70">Submission type</span>
        <div className="mt-1 inline-flex rounded-lg border border-[var(--line)] p-0.5">
          {(
            [
              { k: 'paw', label: 'Application (PAW)' },
              { k: 'dci', label: 'Report (DCI)' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setKind(opt.k)}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                kind === opt.k ? 'bg-primary text-white' : 'text-ink/60 hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="mt-1 block text-xs text-ink/50">
          {kind === 'paw'
            ? 'Submitting a funding application (PAW) — a proposal / work plan to request funding.'
            : 'Submitting a report (DCI) — the data collection instrument due back to ISC.'}
        </span>
      </div>

      <label className="block">
        <span className="font-semibold text-ink/70">
          {kind === 'paw' ? 'Application title' : 'Report title / period'}
          {kind === 'paw' && <span className="text-red-600"> *</span>}
        </span>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
          placeholder={
            kind === 'paw'
              ? 'The “Application title” from your PAW (e.g. the project name)'
              : 'e.g. 2024-25 year-end report'
          }
        />
        {sid && (
          <span className="mt-1 block text-xs text-ink/40">
            ID: <span className="font-mono">{sid}</span> · UID: <span className="font-mono">{uid}</span>
          </span>
        )}
      </label>

      {/* View / download the blank template(s) for the selected PAW from our form library. */}
      {kind === 'paw' &&
        selectedOpt &&
        (() => {
          const templates = (selectedOpt.program.paw ?? [])
            .map((x) => ({ name: x.name, url: formUrlFor(x.no) }))
            .filter((t): t is { name: string; url: string } => !!t.url);
          return (
            <div className="rounded-lg border border-primary/30 bg-[#f2f7f8] p-4">
              <p className="font-semibold text-ink">Need the blank form? View or download the PAW template</p>
              {templates.length ? (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {templates.map((t, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-ink/80">{t.name}</span>
                        <button
                          type="button"
                          onClick={() => setViewer({ url: t.url, title: t.name })}
                          className="font-semibold text-primary hover:underline"
                        >
                          👁 View
                        </button>
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          ↓ Download
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink/50">Fill it out, then attach it below.</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink/60">
                  No blank template is on file for this program yet — see the{' '}
                  <a
                    href={PROGRAM_GUIDE.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Program Guide
                  </a>{' '}
                  or contact Skin Tyee staff.
                </p>
              )}
            </div>
          );
        })()}

      {/* Details of the selected program, inline (same content as the accordion cards). */}
      {options[selected] && (
        <div className="rounded-lg border border-[var(--line)] bg-[#fbfcfc] p-4">
          <ProgramTitle p={options[selected].program} as="h4" />
          <p className="mt-1.5 text-sm text-ink/75">{options[selected].program.summary}</p>
          <ProgramDetail p={options[selected].program} />
        </div>
      )}

      <label className="block">
        <span className="font-semibold text-ink/70">Documents</span>
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="mt-1 block w-full text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white"
        />
        <span className="mt-1 block text-xs text-ink/50">
          Your completed PAW form + any supporting documents (PDF, Word, images).
        </span>
      </label>

      <label className="block">
        <span className="font-semibold text-ink/70">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
          placeholder="Anything Skin Tyee staff should know about this submission."
        />
      </label>

      {status === 'error' && <p className="text-sm font-semibold text-red-600">{message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-semibold text-white transition hover:opacity-90"
        >
          Review &amp; submit
        </button>
        {userEmail && <span className="text-xs text-ink/50">Submitting as {userEmail}</span>}
      </div>
    </form>

    {showReview && selectedOpt && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        onClick={() => status !== 'sending' && setShowReview(false)}
      >
        <div
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold text-ink">Review your submission</h3>
          <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            You are submitting {kind === 'paw' ? 'a funding application (PAW)' : 'a report (DCI)'} for{' '}
            {label(selectedOpt)}.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-ink/55">Program</dt>
              <dd className="text-ink">{label(selectedOpt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-ink/55">Type</dt>
              <dd className="text-ink">{kind === 'paw' ? 'Application (PAW)' : 'Report (DCI)'}</dd>
            </div>
            {project.trim() && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-ink/55">
                  {kind === 'paw' ? 'Title' : 'Report'}
                </dt>
                <dd className="text-ink">{project.trim()}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-ink/55">Documents</dt>
              <dd className="text-ink">
                <ul className="list-disc pl-4">
                  {files && Array.from(files).map((f, i) => <li key={i}>{f.name}</li>)}
                </ul>
              </dd>
            </div>
            {notes && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-ink/55">Notes</dt>
                <dd className="whitespace-pre-wrap text-ink/80">{notes}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-ink/55">Filed to</dt>
              <dd className="font-mono text-xs text-ink/55">
                {selectedOpt.area}/…/submissions/{kind}/
              </dd>
            </div>
          </dl>

          {!files?.length && (
            <p className="mt-3 text-sm font-semibold text-red-600">
              Attach at least one document before submitting.
            </p>
          )}
          {status === 'error' && <p className="mt-3 text-sm font-semibold text-red-600">{message}</p>}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowReview(false)}
              disabled={status === 'sending'}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-[#f2f7f8] disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={doSubmit}
              disabled={status === 'sending' || !files?.length}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {status === 'sending' ? 'Submitting…' : 'Confirm & submit'}
            </button>
          </div>
        </div>
      </div>
    )}

    {viewer && <PdfViewerModal url={viewer.url} title={viewer.title} onClose={() => setViewer(null)} />}
    </>
  );
}
