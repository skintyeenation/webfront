'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, LayoutGrid, Landmark, Coins, Briefcase, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { SignInButton } from './SignInButton';

const NAV: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/projects', label: 'Projects', Icon: Building2 },
  { href: '/programs', label: 'Programs', Icon: LayoutGrid },
  { href: '/governance', label: 'Governance', Icon: Landmark },
  { href: '/funding', label: 'Funding', Icon: Coins },
  { href: '/jobs', label: 'Jobs', Icon: Briefcase },
];

// Responsive header nav: horizontal row on md+, a full-height hamburger menu on
// mobile. Labels carry icons.
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
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} onClick={close} className="flex items-center gap-2 text-ink/70 hover:text-primary">
          <Icon size={18} aria-hidden="true" /> {label}
        </Link>
      ))}
      {signedIn && (
        <Link href={onboardingUrl} onClick={close} className="flex items-center gap-2 font-semibold text-accent">
          <ClipboardCheck size={18} aria-hidden="true" /> Onboarding
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
        className="relative z-50 -mr-1 inline-flex items-center justify-center rounded p-2 text-ink md:hidden"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M6 18 18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      {open && (
        <nav className="fixed inset-0 z-40 flex flex-col bg-white md:hidden">
          {/* header-height zone with the same bottom border as the site header */}
          <div className="h-[74px] shrink-0 border-b border-[var(--line)]" />
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-8 text-xl">{links}</div>
        </nav>
      )}
    </>
  );
}
