import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSession, onboardingUrl } from '@/lib/session';
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
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
          <Link href="/" className="brand flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/skintyee-logo.png" alt="" width={30} height={30} className="rounded" />
            <span>
              <span className="text-primary">Skin</span> <span className="text-[#0a5ba0]">Tyee</span>
              <span className="hidden text-[#5b5b5b] sm:inline"> First Nation</span>
            </span>
          </Link>
          <HeaderNav signedIn={!!session} authEnabled={authEnabled} onboardingUrl={onboardingUrl()} />
          </div>
        </header>
        <main className="container">{children}</main>
        <ResourceLinks />
        <SiteFooter />
      </body>
    </html>
  );
}
