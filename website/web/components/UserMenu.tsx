'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, ClipboardCheck } from 'lucide-react';
import { OnboardingStatusBadge } from './onboarding/OnboardingStatusBadge';
import type { OnboardingOverall } from '@/lib/onboarding';

// Desktop account menu — avatar + name button opening a dropdown with the signed-in identity,
// the user's onboarding status, and a Sign out action. Closes on outside-click / Escape.
export function UserMenu({
  name,
  email,
  onboardingUrl = '/onboarding',
  onboardingStatus,
}: {
  name?: string;
  email?: string;
  onboardingUrl?: string;
  onboardingStatus?: OnboardingOverall;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = name ?? email ?? 'Account';
  const initial = (name ?? email ?? '?').trim()[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-[#f2f7f8]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
          {initial}
        </span>
        <span className="hidden max-w-[9rem] truncate text-ink/80 lg:inline">{label}</span>
        <ChevronDown size={16} className={`text-ink/50 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-lg"
        >
          <div className="border-b border-[var(--line)] px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name ?? 'Signed in'}</p>
            {email && <p className="truncate text-xs text-ink/60">{email}</p>}
          </div>

          {/* Onboarding — your own status. (When approved, this is where it lives; the main
              nav item is hidden.) */}
          <Link
            href={onboardingUrl}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 text-sm text-ink/80 hover:bg-[#f2f7f8]"
          >
            <span className="flex items-center gap-2.5">
              <ClipboardCheck size={16} aria-hidden="true" /> Onboarding
            </span>
            {onboardingStatus && <OnboardingStatusBadge status={onboardingStatus} />}
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-ink/80 hover:bg-[#f2f7f8]"
          >
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
