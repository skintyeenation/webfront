import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import {
  assignmentsFor,
  inProgressAssignments,
  isOnboardingAdmin,
  ONBOARDING_APP_URL,
} from '@/lib/onboarding';
import { OnboardingAdminList } from '@/components/onboarding/OnboardingAdminList';
import { OnboardingAssignmentView } from '@/components/onboarding/OnboardingAssignmentView';
import { SignInButton } from '@/components/SignInButton';

export const metadata: Metadata = { title: 'Onboarding' };
export const dynamic = 'force-dynamic'; // per-user view — never cache

// Onboarding surface — mirrors the @skintyee/app flow. System admins see the cross-person
// in-progress list; an assigned person sees their own steps. Completion happens in the app.
export default async function OnboardingPage() {
  const session = await getSession();
  const email = session?.user?.email;

  if (!email) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="mt-2 text-ink/70">
          Sign in with your Microsoft account to view your onboarding status.
        </p>
        <div className="mt-4">
          <SignInButton signedIn={false} />
        </div>
      </div>
    );
  }

  const admin = isOnboardingAdmin(email);
  const mine = assignmentsFor(email);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="mt-1 text-ink/70">
          {admin
            ? 'Track onboardings across the band. Design flows and approve steps in the app.'
            : 'Track your onboarding steps. Uploads and signing happen in the app.'}
        </p>
      </div>

      {admin && <OnboardingAdminList assignments={inProgressAssignments()} />}

      {mine.length > 0 && (
        <div className="space-y-4">
          {admin && <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Your onboarding</h2>}
          {mine.map((a) => (
            <OnboardingAssignmentView key={a.id} assignment={a} />
          ))}
        </div>
      )}

      {!admin && mine.length === 0 && (
        <div className="rounded-xl border border-[var(--line)] bg-[#f8fbfc] p-6">
          <p className="font-medium text-ink">No onboarding assigned.</p>
          <p className="mt-1 text-sm text-ink/70">
            You don&apos;t have an onboarding flow assigned yet. If you&apos;re expecting one, contact the band
            office or open the{' '}
            <a href={ONBOARDING_APP_URL} className="font-medium text-primary hover:underline">
              app
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
