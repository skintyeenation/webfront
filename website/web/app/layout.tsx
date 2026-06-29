import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSession, onboardingUrl } from '@/lib/session';
import { onboardingSummary } from '@/lib/onboarding-data';
import { FEATURES } from '@/lib/featureFlags';
import { AccessGate } from '@/components/AccessGate';
import { ResourceLinks } from '@/components/ResourceLinks';
import { SiteFooter } from '@/components/SiteFooter';
import { HeaderNav } from '@/components/HeaderNav';

export const metadata: Metadata = {
  title: {
    default: 'Skin Tyee First Nation',
    template: '%s · Skin Tyee First Nation',
  },
  description: 'Skin Tyee First Nation — community news, events, programs, and governance.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Only offer sign-in once Entra is actually configured — otherwise the OAuth
  // redirect lands on NextAuth's unstyled error page.
  const authEnabled = !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  // Pre-launch gate (band publicity policy / BCR). When on and not signed in,
  // the whole site is replaced by the access "password block".
  if (FEATURES.accessGate.enabled && !session) {
    return (
      <html lang="en">
        <body>
          <AccessGate />
        </body>
      </html>
    );
  }
  // The signed-in user's onboarding drives the nav + user-menu section: admins always keep the
  // item (it's their console); a worker's item hides once their onboarding is complete. Read
  // live from the api/ (degrades gracefully when signed out or the api is unreachable).
  const email = session?.user?.email;
  const { admin: onboardingAdmin, status: onboardingStatus } = email
    ? await onboardingSummary(email)
    : { admin: false, status: undefined };
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
          <Link href="/" className="brand relative z-50 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/skintyee-logo.png" alt="" width={30} height={30} className="rounded" />
            <span className="flex flex-col leading-none">
              <span>
                <span className="text-primary">Skin</span> <span className="text-[#0a5ba0]">Tyee</span>
              </span>
              <span className="mt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b5b5b]">First Nation</span>
            </span>
          </Link>
          <HeaderNav signedIn={!!session} authEnabled={authEnabled} onboardingUrl={onboardingUrl()} onboardingStatus={onboardingStatus} onboardingAdmin={onboardingAdmin} user={session?.user} />
          </div>
        </header>
        <main className="container">{children}</main>
        <ResourceLinks />
        <SiteFooter />
      </body>
    </html>
  );
}
