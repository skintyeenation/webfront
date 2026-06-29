import { RESOURCE_LINKS } from '@/lib/constants';

// "Rights & Title" — a full-bleed COLOURED band (like the Major Projects band),
// rendered site-wide above the footer. External links open in a new tab.
export function ResourceLinks() {
  return (
    <section className="rt-band">
      <div className="mx-auto max-w-[1140px] px-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white/80">Aboriginal Rights &amp; Title</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {RESOURCE_LINKS.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/95 px-3 py-2 text-ink shadow-sm transition hover:bg-white"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.logo} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
                </span>
                <span className="text-sm font-semibold">
                  {r.label} <span className="text-ink/40">↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
