'use client';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { ProgramSubmissionForm, type SubmissionOption } from './ProgramSubmissionForm';

type Session = { user?: { email?: string | null } } | null;

// Client-side Entra sign-in gate for the submission portal. Checks the session per-user
// (so the parent page can stay statically cached / ISR) and shows either the sign-in
// prompt or the upload form. The /api/program-submission route re-enforces auth server-side,
// so this gate is UX, not the security boundary.
export function ProgramSubmissionGate({ options }: { options: SubmissionOption[] }) {
  const [session, setSession] = useState<Session | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((s) => active && setSession(s && Object.keys(s).length ? s : null))
      .catch(() => active && setSession(null));
    return () => {
      active = false;
    };
  }, []);

  if (session === undefined) {
    return <p className="mt-4 text-sm text-ink/50">Loading…</p>;
  }

  if (session?.user) {
    return <ProgramSubmissionForm options={options} userEmail={session.user.email ?? undefined} />;
  }

  return (
    <div className="mt-4 rounded-lg bg-[#f2f7f8] p-4 text-sm text-ink/70">
      <p>Sign in with your Skin Tyee account to submit an application.</p>
      <button
        onClick={() => signIn('microsoft-entra-id')}
        className="mt-3 rounded-lg bg-primary px-4 py-2 font-semibold text-white transition hover:opacity-90"
      >
        Sign in to submit
      </button>
    </div>
  );
}
