import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSession, onboardingUrl } from '@/lib/session';
import { ResourceLinks } from '@/components/ResourceLinks';

export const metadata: Metadata = {
  title: {
    default: 'Skin Tyee First Nation',
    template: '%s · Skin Tyee First Nation',
  },
  description: 'Skin Tyee First Nation — community news, events, programs, and governance.',
};

const NAV = [
  { href: '/projects', label: 'Projects' },
  { href: '/programs', label: 'Programs' },
  { href: '/governance', label: 'Governance' },
  { href: '/funding', label: 'Funding' },
  { href: '/jobs', label: 'Jobs' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/skintyee-logo.png" alt="" width={30} height={30} className="rounded" />
            Skin Tyee First Nation
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-ink/70 hover:text-primary">{n.label}</Link>
            ))}
            {session && (
              <Link href={onboardingUrl()} className="font-semibold text-accent">Onboarding</Link>
            )}
          </nav>
        </header>
        <main className="container">{children}</main>
        <ResourceLinks />
        <footer className="site-footer">© {new Date().getFullYear()} Skin Tyee First Nation</footer>
      </body>
    </html>
  );
}
