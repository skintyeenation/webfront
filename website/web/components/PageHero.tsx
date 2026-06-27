'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Leaflet needs the browser — load the territory map client-only.
const TerritoryMap = dynamic(() => import('./TerritoryMap').then((m) => m.TerritoryMap), { ssr: false });

// Full-viewport interactive intro: a terrain map of the Skin Tyee territory (so
// you immediately see the land + nation). Pan/zoom the map; the glowing
// down-caret (or ↓/Esc) slides the intro up to reveal the page. Scroll/swipe are
// left to the map, so dismissal is the caret/keys only.
export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    if (dismissed) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowDown', 'PageDown'].includes(e.key)) dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [dismissed, dismiss]);

  return (
    <section className={`page-hero${dismissed ? ' page-hero--dismissed' : ''}`} aria-hidden={dismissed}>
      <div className="page-hero-map">
        <TerritoryMap />
      </div>
      <div className="page-hero-overlay">
        <div className="page-hero-inner">
          <h1 className="text-4xl font-bold text-white drop-shadow-md md:text-6xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-2xl text-lg text-white/90 drop-shadow">{subtitle}</p>}
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
