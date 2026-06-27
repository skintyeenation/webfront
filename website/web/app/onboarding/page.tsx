import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Onboarding' };

// Placeholder for the staff/contractor onboarding flow (the home CTA + nav link
// target). Wires to a SharePoint document library + onboarding steps later
// (plan §5 / docs/features/documents-and-onboarding.md).
export default function OnboardingPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Onboarding</h1>
      <p className="mt-2 max-w-2xl text-ink/70">
        Staff and contractor onboarding will be hosted here — onboarding steps and a
        document library (SharePoint). Sign in with your Microsoft account to access
        your assigned onboarding flow.
      </p>
    </>
  );
}
