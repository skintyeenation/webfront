'use client';

import { useState } from 'react';
import { Check, Upload, Loader2 } from 'lucide-react';
import {
  ONBOARDING_DOCUMENTS,
  REQUIRED_DOC_KEYS,
  computeOnboardingStatus,
} from '@/lib/onboarding';
import { OnboardingStatusBadge } from './OnboardingStatusBadge';

// Reusable onboarding checklist — renders the document list with per-document upload, posts
// to /api/onboarding-document, and re-derives the user's status as documents come in.
export function OnboardingChecklist({
  initialUploaded,
  approved,
}: {
  initialUploaded: string[];
  approved: boolean;
}) {
  const [uploaded, setUploaded] = useState<string[]>(initialUploaded);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = computeOnboardingStatus(uploaded, approved);
  const doneRequired = REQUIRED_DOC_KEYS.filter((k) => uploaded.includes(k)).length;

  async function onUpload(docKey: string, file: File) {
    setBusy(docKey);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('docKey', docKey);
      fd.append('file', file);
      const res = await fetch('/api/onboarding-document', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      setUploaded((u) => (u.includes(docKey) ? u : [...u, docKey]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/70">
          {doneRequired} of {REQUIRED_DOC_KEYS.length} required documents uploaded
        </p>
        <OnboardingStatusBadge status={status} />
      </div>

      <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
        {ONBOARDING_DOCUMENTS.map((d) => {
          const done = uploaded.includes(d.key);
          return (
            <li key={d.key} className="flex items-center gap-3 p-4">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  done ? 'bg-success/20 text-success' : 'bg-ink/5 text-ink/40'
                }`}
                aria-hidden="true"
              >
                {done ? <Check size={16} /> : <Upload size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {d.label}{' '}
                  {d.required ? (
                    <span className="text-accent" title="Required">
                      *
                    </span>
                  ) : (
                    <span className="text-xs text-ink/40">(optional)</span>
                  )}
                </p>
                <p className="text-sm text-ink/60">{d.description}</p>
              </div>
              <label
                className={`shrink-0 cursor-pointer rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-semibold transition hover:bg-[#f2f7f8] ${
                  busy === d.key ? 'opacity-60' : ''
                }`}
              >
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  disabled={busy === d.key}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(d.key, f);
                    e.target.value = '';
                  }}
                />
                <span className="inline-flex items-center gap-1.5 text-primary">
                  {busy === d.key ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {done ? 'Replace' : 'Upload'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {status === 'submitted' && (
        <p className="mt-3 text-sm font-medium text-primary">
          All required documents submitted — your onboarding is awaiting review.
        </p>
      )}
    </div>
  );
}
