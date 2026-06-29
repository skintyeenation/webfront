'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Tabbed funding layout. Each tab's content is rendered (server components passed in as
// ReactNode) and toggled with `hidden` so it stays in the DOM / SSR output. Used on the
// funding hub (and subpages) to give the programs accordion, apply form, and calendar each
// their own tab. Honors a `#<tabId>...` URL hash (e.g. the cards' `#apply=<area>/<slug>`
// deep-link) by switching to that tab.
export function FundingTabs({
  tabs,
  initial,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  useEffect(() => {
    const ids = new Set(tabs.map((t) => t.id));
    const sync = () => {
      const id = window.location.hash.replace(/^#/, '').split('=')[0];
      if (id && ids.has(id)) setActive(id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [tabs]);

  return (
    <div className="mt-8">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-ink/55 hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} className="pt-5">
          {t.content}
        </div>
      ))}
    </div>
  );
}
