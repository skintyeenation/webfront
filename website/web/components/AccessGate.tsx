import { signIn } from '@/auth';
import { RequestAccessForm } from './RequestAccessForm';

// Pre-launch "password block" — shown in place of the whole site when the
// accessGate feature flag is on and the visitor isn't signed in. Gated on the
// Band Council (BCR) approval before public release. Sign-in uses Entra
// (enforcement wired in Phase B); the request form lets others ask for access.
export function AccessGate() {
  const authEnabled = !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#00343f] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/skintyee-logo.png" alt="Skin Tyee First Nation" width={64} height={64} className="mx-auto rounded" />
        <h1 className="mt-4 text-xl font-bold text-ink">Skin Tyee First Nation</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Preview — not yet public</p>
        <p className="mt-4 text-sm text-ink/70">
          This website is in development and is awaiting{' '}
          <strong>Band Council Resolution (BCR)</strong> approval before public release. Sign in
          with your Skin Tyee account to preview it.
        </p>

        {authEnabled ? (
          <form
            action={async () => {
              'use server';
              await signIn('microsoft-entra-id');
            }}
          >
            <button
              type="submit"
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              Sign in with your Skin Tyee account
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-lg bg-[#f2f7f8] px-4 py-2.5 text-sm text-ink/60">
            Sign-in is being configured.
          </p>
        )}

        <div className="mt-6 border-t border-[var(--line)] pt-6">
          <RequestAccessForm />
        </div>
      </div>
    </div>
  );
}
