import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import { getOnboardingState } from '@/lib/onboarding-store';
import { ONBOARDING_STATUS_META } from '@/lib/onboarding';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { OnboardingStatusBadge } from '@/components/onboarding/OnboardingStatusBadge';
import { SignInButton } from '@/components/SignInButton';

export const metadata: Metadata = { title: 'Onboarding' };
export const dynamic = 'force-dynamic'; // per-user view — never cache

// Staff / contractor onboarding — mirrors the @skintyee/app documents-&-onboarding flow, but
// driven from the website. You upload your documents and see your own status. Approval is set
// out-of-band (no WordPress approval); when approved we show it and the nav item moves under
// the user menu.
export default async function OnboardingPage() {
  const session = await getSession();
  const email = session?.user?.email;

  if (!email) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="mt-2 text-ink/70">
          Sign in with your Microsoft account to access your onboarding documents and status.
        </p>
        <div className="mt-4">
          <SignInButton signedIn={false} />
        </div>
      </div>
    );
  }

  const state = await getOnboardingState(email);
  const meta = ONBOARDING_STATUS_META[state.status];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Onboarding</h1>
      <p className="mt-1 text-ink/70">Upload your onboarding documents and track your status.</p>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[#f8fbfc] p-4">
        <OnboardingStatusBadge status={state.status} />
        <p className="text-sm text-ink/70">{meta.description}</p>
      </div>

      {state.approved ? (
        <div className="mt-6 rounded-xl border border-success/40 bg-success/5 p-6">
          <p className="font-semibold text-success">Your onboarding is approved.</p>
          <p className="mt-1 text-sm text-ink/70">No further action needed — your documents are on file.</p>
        </div>
      ) : (
        <div className="mt-6">
          <OnboardingChecklist initialUploaded={state.uploaded} approved={state.approved} />
        </div>
      )}
    </div>
  );
}
