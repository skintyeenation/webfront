import Link from 'next/link';

// Shown only to signed-in users (plan §5). Points at the onboarding flow —
// a SharePoint document library / contractor onboarding URL later.
export function OnboardingCta({ url }: { url: string }) {
  return (
    <Link href={url} className="block rounded-lg border border-success bg-success/10 p-5 transition hover:bg-success/20">
      <h3 className="font-semibold text-ink">Staff &amp; contractor onboarding</h3>
      <p className="mt-1 text-sm text-ink/70">Complete your onboarding steps and documents →</p>
    </Link>
  );
}
