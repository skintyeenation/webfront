'use client';
import { useState } from 'react';

type Opt = { slug: string; name: string; acronym?: string };

// Client form for the per-program funding submission portal (Phase 1b). Posts a
// completed PAW + supporting documents to /api/program-submission, which files them
// into the program's <area>/<slug>/ folder (repo / SharePoint mirror).
export function ProgramSubmissionForm({
  area,
  options,
  userEmail,
}: {
  area: string;
  options: Opt[];
  userEmail?: string;
}) {
  const [selected, setSelected] = useState(options[0]?.slug ?? '');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const opt = options.find((o) => o.slug === selected);
    if (!opt) return;
    if (!files || !files.length) {
      setStatus('error');
      setMessage('Attach at least one document.');
      return;
    }
    setStatus('sending');
    setMessage('');
    const fd = new FormData();
    fd.set('area', area);
    fd.set('programName', opt.name);
    if (opt.acronym) fd.set('acronym', opt.acronym);
    fd.set('notes', notes);
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      const res = await fetch('/api/program-submission', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed.');
      setStatus('done');
      setMessage('Received. Skin Tyee staff will review your submission.');
      setNotes('');
      setFiles(null);
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
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 text-sm">
      <label className="block">
        <span className="font-semibold text-ink/70">Program / application</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
        >
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.acronym ? `${o.acronym} — ${o.name}` : o.name}
            </option>
          ))}
        </select>
      </label>

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
          disabled={status === 'sending'}
          className="rounded-lg bg-primary px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {status === 'sending' ? 'Submitting…' : 'Submit application'}
        </button>
        {userEmail && <span className="text-xs text-ink/50">Submitting as {userEmail}</span>}
      </div>
    </form>
  );
}
