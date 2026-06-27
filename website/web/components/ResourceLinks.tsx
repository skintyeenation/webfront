import { RESOURCE_LINKS } from '@/lib/constants';

// Reusable "Rights & Title" links section — rendered site-wide (in the footer)
// and droppable into any page. External links open in a new tab.
export function ResourceLinks() {
  return (
    <section className="border-t border-[var(--line)] bg-black/[0.03]">
      <div className="container py-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink/70">Rights &amp; Title</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {RESOURCE_LINKS.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {r.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
