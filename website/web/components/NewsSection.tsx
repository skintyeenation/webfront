import Link from 'next/link';
import { getPostsByCategory, stripHtml } from '@/lib/wp';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import { NewsSlider, type NewsArticle } from './NewsSlider';

// News section — content comes from the WordPress 'news' category (REST). A
// full-width mini-hero slider rotates the first 10 articles; two more render as
// static cards below it. Images are curated per article (topical), with a
// Picsum fallback by slug.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&h=600&fit=crop&q=70`;
// Verified topical photos (reused from elsewhere on the site). The rest fall
// back to a stable Picsum image until vetted.
const IMAGES: Record<string, string> = {
  'new-housing-units-southbank': U('1728344430621-f6b58ef4a108'), // modular home
  'annual-salmon-harvest': U('1616459943793-f4fca51b6647'), // salmon run
  'forestry-partnership-agreement': U('1634672652995-ee7525bce595'), // lumber mill
  'broadband-expansion': U('1744679596626-1699b156942f'), // cell tower
};
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/600`;
const imageFor = (slug: string) => IMAGES[slug] ?? pic(slug);

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const catColor = (c: string) => NOTIFICATION_COLORS[c] ?? '#5C6BC0';

export async function NewsSection() {
  const posts = await getPostsByCategory('news', 13);
  if (!posts.length) return null;

  const articles: NewsArticle[] = posts.map((p) => ({
    title: stripHtml(p.title.rendered),
    excerpt: stripHtml(p.excerpt.rendered),
    date: p.date,
    category: 'News',
    image: imageFor(p.slug),
    href: `/posts/${p.slug}`,
  }));
  const primary = articles.slice(0, 10);
  const cards = articles.slice(10, 13);

  return (
    <section>
      <h2 className="text-xl font-bold">News</h2>
      <p className="mt-1 text-ink/70">Latest from the Nation.</p>

      {/* Primary — full-width mini-hero slider rotating 10 articles */}
      <div className="mt-5">
        <NewsSlider articles={primary} />
      </div>

      {/* Two static news cards below the slider */}
      {cards.length > 0 && (
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {cards.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt="" className="h-44 w-full object-cover" />
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
      )}
    </section>
  );
}
