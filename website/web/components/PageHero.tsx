'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

// Full-viewport intro: a static satellite-hybrid snapshot of the Skin Tyee
// territory (/territory-snapshot.jpg) that slowly pans for a parallax feel. Not
// mouse-interactive; the glowing down-caret (or ↓/Esc) slides the intro up to
// reveal the page.
export function PageHero({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useCallback(() => {
    setDismissed(true);
    // Let the under-construction notice know the intro was dismissed.
    window.dispatchEvent(new Event('skintyee:hero-dismissed'));
  }, []);

  useEffect(() => {
    if (dismissed) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) dismiss();
    };
    // Scrolling down (wheel) or swiping up (touch) snaps the page into place.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) dismiss();
    };
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY - (e.touches[0]?.clientY ?? 0) > 40) dismiss();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [dismissed, dismiss]);

  return (
    <section className={`page-hero${dismissed ? ' page-hero--dismissed' : ''}`} aria-hidden={dismissed}>
      <div className="page-hero-inner">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/skintyee-logo.png"
              alt="Skin Tyee Nation"
              width={160}
              height={142}
              className="mb-12 mx-auto block h-32 w-auto md:h-44"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.85)) drop-shadow(0 0 5px rgba(0,0,0,0.6))' }}
            />
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-white/80 md:text-base">Welcome to</p>
            <h1 className="text-3xl font-bold text-white drop-shadow-md md:text-6xl">{title}</h1>
            {subtitle && <p className="mt-10 text-base text-white/90 drop-shadow md:text-lg">{subtitle}</p>}
            <button
              type="button"
              onClick={dismiss}
              className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-white/70 bg-white/10 px-7 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Let&apos;s go
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>
          <address className="shrink-0 not-italic text-sm leading-relaxed text-white/90 drop-shadow md:text-right">
            <span className="block text-xs font-bold uppercase tracking-wide text-white/70">Contact</span>
            <span className="mt-2 block font-semibold text-white">Skin Tyee First Nation</span>
            <span className="block">P.O. Box 131, Southbank, BC V0J 2P0</span>
            <span className="block">
              📞 <a href="tel:+12502513085" className="underline hover:text-white">250-251-3085</a>
            </span>
            <span className="block">
              ✉️ <a href="mailto:STFN_BandManager@outlook.com" className="underline hover:text-white">STFN_BandManager@outlook.com</a>
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
