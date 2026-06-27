'use client';

import { useCallback, useEffect, useState } from 'react';

// Full-viewport intro: a static satellite-hybrid snapshot of the Skin Tyee
// territory (/territory-snapshot.jpg) that slowly pans for a parallax feel. Not
// mouse-interactive; the glowing down-caret (or ↓/Esc) slides the intro up to
// reveal the page.
export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    if (dismissed) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [dismissed, dismiss]);

  return (
    <section className={`page-hero${dismissed ? ' page-hero--dismissed' : ''}`} aria-hidden={dismissed}>
      <div className="page-hero-inner">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/skintyee-logo.png" alt="Skin Tyee Nation" width={160} height={142} className="mb-5 mx-auto block h-32 w-auto drop-shadow-md md:h-44" />
            <h1 className="text-4xl font-bold text-white drop-shadow-md md:text-6xl">{title}</h1>
            {subtitle && <p className="mt-4 text-lg text-white/90 drop-shadow">{subtitle}</p>}
          </div>
          <address className="shrink-0 not-italic text-sm leading-relaxed text-white/90 drop-shadow md:text-right">
            <span className="block text-xs font-bold uppercase tracking-wide text-white/70">Contact</span>
            <span className="mt-2 block font-semibold text-white">Skin Tyee First Nation</span>
            <span className="block">General Delivery, Southbank, BC V0J 2P0</span>
            <span className="block">
              P: <a href="tel:+12502513085" className="underline hover:text-white">250-251-3085</a>
            </span>
            <span className="block">
              E: <a href="mailto:STFN_BandManager@outlook.com" className="underline hover:text-white">STFN_BandManager@outlook.com</a>
            </span>
          </address>
        </div>
      </div>
      <button type="button" className="page-hero-caret" onClick={dismiss} aria-label="Enter the site">
        <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </section>
  );
}
