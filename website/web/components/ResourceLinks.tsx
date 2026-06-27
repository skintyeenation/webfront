import { RESOURCE_LINKS } from '@/lib/constants';

// "Rights & Title" — a full-bleed COLOURED band (like the Major Projects band),
// rendered site-wide above the footer. External links open in a new tab.
export function ResourceLinks() {
  return (
    <section className="rt-band">
      <div className="mx-auto max-w-[1140px] px-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white/80">Rights &amp; Title</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {RESOURCE_LINKS.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">
                {r.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
