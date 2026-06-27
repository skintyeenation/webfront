'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignInButton } from './SignInButton';

const NAV = [
  { href: '/projects', label: 'Projects' },
  { href: '/programs', label: 'Programs' },
  { href: '/governance', label: 'Governance' },
  { href: '/funding', label: 'Funding' },
  { href: '/jobs', label: 'Jobs' },
];

// Responsive header nav: a horizontal row on md+, a hamburger-toggled dropdown
// on mobile (replaces the flex-wrap rows).
export function HeaderNav({
  signedIn,
  authEnabled,
  onboardingUrl,
}: {
  signedIn: boolean;
  authEnabled: boolean;
  onboardingUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const links = (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={close} className="text-ink/70 hover:text-primary">
          {n.label}
        </Link>
      ))}
      {signedIn && (
        <Link href={onboardingUrl} onClick={close} className="font-semibold text-accent">
          Onboarding
        </Link>
      )}
      {(authEnabled || signedIn) && <SignInButton signedIn={signedIn} />}
    </>
  );

  return (
    <>
      <nav className="hidden items-center gap-4 text-sm md:flex">{links}</nav>

      <button
        type="button"
        className="-mr-1 inline-flex items-center justify-center rounded p-2 text-ink md:hidden"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M6 18 18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full flex flex-col gap-3 border-b border-[var(--line)] bg-white p-5 text-base shadow-lg md:hidden">
          {links}
        </nav>
      )}
    </>
  );
}
