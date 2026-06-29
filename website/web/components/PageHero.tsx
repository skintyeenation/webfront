'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Phone, Mail } from 'lucide-react';

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
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="max-w-2xl text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/skintyee-logo.png"
              alt="Skin Tyee Nation"
              width={160}
              height={142}
              className="mb-6 mx-auto block h-24 w-auto md:mb-12 md:mt-6 md:h-44 2xl:mt-0"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.85)) drop-shadow(0 0 5px rgba(0,0,0,0.6))' }}
            />
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-white/80 md:text-base">Welcome to</p>
            <h1 className="text-[1.6rem] font-bold text-white drop-shadow-md md:text-[3.19rem]">{title}</h1>
            {subtitle && <p className="mt-6 text-base text-white/90 drop-shadow md:mt-10 md:text-lg">{subtitle}</p>}
            <button
              type="button"
              onClick={dismiss}
              className="mt-8 inline-flex items-center rounded-full border-2 border-white/70 bg-white/10 px-8 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Let&apos;s go
            </button>
          </div>
          {/* Two rows, two columns — address on the left, contact (phone/email) on the right. */}
          <address className="not-italic text-sm leading-relaxed text-white/90 drop-shadow">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-left">
              <span className="font-semibold text-white">Skin Tyee First Nation</span>
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} aria-hidden="true" />
                <a href="tel:+12502513085" className="underline hover:text-white">250-251-3085</a>
              </span>
              <span>P.O. Box 131, Southbank, BC V0J 2P0</span>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={14} aria-hidden="true" />
                <a href="mailto:STFN_BandManager@outlook.com" className="underline hover:text-white">STFN_BandManager@outlook.com</a>
              </span>
            </div>
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
