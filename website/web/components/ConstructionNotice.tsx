'use client';

import { useEffect, useState } from 'react';
import { Construction } from 'lucide-react';

// Under-construction / test-data disclaimer. Shows once per session right after
// the intro hero is dismissed (listens for the 'skintyee:hero-dismissed' event
// PageHero fires when the down-caret / key is used).
const KEY = 'skintyee:construction-notice-seen';

export function ConstructionNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const open = () => {
      try {
        if (sessionStorage.getItem(KEY)) return;
      } catch {
        /* ignore */
      }
      setShow(true);
    };
    window.addEventListener('skintyee:hero-dismissed', open);
    return () => window.removeEventListener('skintyee:hero-dismissed', open);
  }, []);

  const close = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cn-title"
      onClick={close}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Construction size={22} aria-hidden="true" />
          </span>
          <h2 id="cn-title" className="text-lg font-bold text-ink">
            Site under construction
          </h2>
        </div>
        <p className="mt-4 text-ink/75">
          This website is a work in progress. Everything shown — news, events, programs, resorts,
          listings, contact details, and figures — is <strong className="text-ink">sample / test data</strong> for
          demonstration only and does not represent real information.
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white transition hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
