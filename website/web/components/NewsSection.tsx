import Link from 'next/link';
import { getPostsByCategory, stripHtml } from '@/lib/wp';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import { NewsSlider, type NewsArticle } from './NewsSlider';

// News section — content comes from the WordPress 'news' category (REST). A
// mini-hero slider rotates the first 10 articles (primary); two more render as
// sub-article cards. Images are stable placeholders (Picsum by slug) until the
// posts carry featured media.
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/600`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const catColor = (c: string) => NOTIFICATION_COLORS[c] ?? '#5C6BC0';

export async function NewsSection() {
  const posts = await getPostsByCategory('news', 12);
  if (!posts.length) return null;

  const articles: NewsArticle[] = posts.map((p) => ({
    title: stripHtml(p.title.rendered),
    excerpt: stripHtml(p.excerpt.rendered),
    date: p.date,
    category: 'News',
    image: pic(p.slug),
    href: `/posts/${p.slug}`,
  }));
  const primary = articles.slice(0, 10);
  const subs = articles.slice(10, 12);

  return (
    <section>
      <h2 className="text-xl font-bold">News</h2>
      <p className="mt-1 text-ink/70">Latest from the Nation.</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Primary — mini-hero slider rotating 10 articles */}
        <div className="lg:col-span-2">
          <NewsSlider articles={primary} />
        </div>

        {/* Two sub articles */}
        <div className="grid gap-5 lg:grid-rows-2">
          {subs.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group grid grid-cols-[38%_1fr] overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt="" className="h-full min-h-[110px] w-full object-cover" />
              <div className="p-4">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: catColor(a.category) }}>
                  {a.category}
                </span>
                <h3 className="mt-1 font-semibold leading-snug text-ink group-hover:text-primary">{a.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink/60">{a.excerpt}</p>
                <span className="mt-1 block text-xs text-ink/45">{fmt(a.date)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
