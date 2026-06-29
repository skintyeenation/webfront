'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2 } from 'lucide-react';

// Worker upload control for a single step — posts the file to the website's me-upload proxy
// (which forwards to the api/ as the signed-in caller), then refreshes to show the new status.
export function StepUploader({
  assignmentId,
  stepId,
  hasUpload,
}: {
  assignmentId: string;
  stepId: string;
  hasUpload: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('assignmentId', assignmentId);
      fd.append('stepId', stepId);
      fd.append('file', file);
      const res = await fetch('/api/onboarding/me-upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <label
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-[#f2f7f8] ${
          busy ? 'opacity-60' : ''
        }`}
      >
        <input
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = '';
          }}
        />
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {hasUpload ? 'Replace upload' : 'Upload'}
      </label>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
