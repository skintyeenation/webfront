import { CUSTOM_BANNERS, type Banner } from '@/lib/banners';

// Custom banners (awareness / commemoration) — news-style cards shown on the home page
// between News and Notifications. Data lives in lib/banners.ts.
export function CustomBanners({ heading = 'Awareness & commemoration' }: { heading?: string }) {
  if (!CUSTOM_BANNERS.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">{heading}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CUSTOM_BANNERS.map((b) => (
          <BannerCard key={b.title} b={b} />
        ))}
      </div>
    </section>
  );
}

function BannerCard({ b }: { b: Banner }) {
  const inner = (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--line)] transition hover:border-primary">
      {b.image ? (
        <div className="h-44 w-full" style={b.bg ? { background: b.bg } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.image}
            alt={b.title}
            loading="lazy"
            className={`h-full w-full ${b.fit === 'contain' ? 'object-contain p-3' : 'object-cover object-center'}`}
          />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center bg-[#f2f7f8] text-6xl" aria-hidden>
          {b.icon ?? '◆'}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-ink">{b.title}</h3>
          {b.date && <span className="shrink-0 text-xs font-semibold text-accent">{b.date}</span>}
        </div>
        {b.subheading && <p className="text-sm font-semibold text-primary">{b.subheading}</p>}
        <p className="mt-1.5 text-sm text-ink/70">{b.description}</p>
        {b.href && (
          <span className="mt-3 inline-block text-sm font-semibold text-primary group-hover:underline">
            Read more ↗
          </span>
        )}
      </div>
    </article>
  );

  return b.href ? (
    <a href={b.href} target="_blank" rel="noopener noreferrer" className="group block h-full">
      {inner}
    </a>
  ) : (
    inner
  );
}
