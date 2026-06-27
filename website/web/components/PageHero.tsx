'use client';

import { useCallback, useEffect, useState } from 'react';

// Full-viewport parallax intro (northern-BC lakeside). On load it covers the
// screen; scrolling/swiping down or clicking the glowing down-caret slides it up
// to reveal the page. Drop a photo at web/public/hero-lakeside.jpg (scenic
// sky→water gradient is the fallback).
export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    if (dismissed) return;
    document.body.style.overflow = 'hidden'; // hold the page while the intro is up
    const onWheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > 8) dismiss(); };
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      if (Math.abs((e.touches[0]?.clientY ?? 0) - startY) > 24) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) dismiss();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = ''; // restore on dismiss / unmount
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [dismissed, dismiss]);

  return (
    <section className={`page-hero${dismissed ? ' page-hero--dismissed' : ''}`} aria-hidden={dismissed}>
      <div className="page-hero-inner">
        <h1 className="text-4xl font-bold text-white drop-shadow-md md:text-6xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-lg text-white/90 drop-shadow">{subtitle}</p>}
      </div>
      <button type="button" className="page-hero-caret" onClick={dismiss} aria-label="Enter the site">
        <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </section>
  );
}
