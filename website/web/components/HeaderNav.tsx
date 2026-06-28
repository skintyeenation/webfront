'use client';

import { useState, useEffect } from 'react';
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
  const [headerH, setHeaderH] = useState(0);
  const close = () => setOpen(false);

  // Measure the real header so the open menu starts exactly below it — the
  // header's own bottom border is the separator, keeping open/closed identical.
  useEffect(() => {
    const el = document.querySelector('.site-header') as HTMLElement | null;
    if (el) setHeaderH(el.getBoundingClientRect().height);
  }, [open]);

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
        <nav
          style={{ top: headerH }}
          className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-6 overflow-y-auto bg-white px-6 py-8 text-xl md:hidden"
        >
          {links}
        </nav>
      )}
    </>
  );
}
