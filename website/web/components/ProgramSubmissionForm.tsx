'use client';
import { useState } from 'react';
import type { FundingProgram } from '@skintyee/models';
import { ProgramTitle, ProgramDetail } from './ProgramDetail';

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
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const grouped = options.some((o) => o.group);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const opt = options[selected];
    if (!opt) return;
    if (!files || !files.length) {
      setStatus('error');
      setMessage('Attach at least one document.');
      return;
    }
    setStatus('sending');
    setMessage('');
    const fd = new FormData();
    fd.set('area', opt.area);
    fd.set('programName', opt.program.name);
    if (opt.program.acronym) fd.set('acronym', opt.program.acronym);
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
