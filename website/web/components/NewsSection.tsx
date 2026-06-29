import Link from 'next/link';
import { getPostsByCategory, stripHtml } from '@/lib/wp';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import { NewsSlider, type NewsArticle } from './NewsSlider';

// News section — content comes from the WordPress 'news' category (REST). A
// full-width mini-hero slider rotates the first 10 articles; two more render as
// static cards below it. Images are curated per article (topical), with a
// Picsum fallback by slug.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&h=600&fit=crop&q=70`;
// Curated, visually-verified topical photo per article (slug -> Unsplash id).
const IMAGES: Record<string, string> = {
  'band-council-election-results': U('1517048676732-d65bc937f952'), // meeting
  'new-housing-units-southbank': U('1728344430621-f6b58ef4a108'), // modular home
  'annual-salmon-harvest': U('1616459943793-f4fca51b6647'), // salmon run
  'water-system-upgrade-milestone': U('1533077162801-86490c593afb'), // water treatment plant
  'youth-culture-camp': U('1606092195730-5d7b9af1efc5'), // kids outdoors
  'health-centre-wellness-programs': U('1631507623121-eaaba8d4e7dc'), // medical clinic
  'wildfire-preparedness-meeting': U('1615092296061-e2ccfeb2f3d6'), // wildfire
  'forestry-partnership-agreement': U('1634672652995-ee7525bce595'), // lumber mill
  'elders-gathering-language': U('1530244534845-4a0c319f41e3'), // powwow regalia
  'broadband-expansion': U('1744679596626-1699b156942f'), // cell tower
  'community-garden-volunteers': U('1515150144380-bca9f1650ed9'), // watering the garden
  'road-maintenance-southbank': U('1503708928676-1cb796a0891e'), // road construction
  'language-nest-program': U('1554721299-e0b8aa7666ce'), // children reading
};
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/600`;
const imageFor = (slug: string) => IMAGES[slug] ?? pic(slug);

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const catColor = (c: string) => NOTIFICATION_COLORS[c] ?? '#5C6BC0';

export async function NewsSection({
  category = 'news',
  heading = 'News',
  subtitle = 'Latest from the Nation.',
  categoryLabel = 'News',
  imageFor: imageForProp = imageFor,
  moreHref = '/news',
}: {
  category?: string;
  heading?: string;
  subtitle?: string;
  categoryLabel?: string;
  imageFor?: (slug: string) => string;
  moreHref?: string;
} = {}) {
  const posts = await getPostsByCategory(category, 13);
  if (!posts.length) return null;

  const articles: NewsArticle[] = posts.map((p) => ({
    title: stripHtml(p.title.rendered),
    excerpt: stripHtml(p.excerpt.rendered),
    date: p.date,
    category: categoryLabel,
    image: imageForProp(p.slug),
    href: `/posts/${p.slug}`,
  }));
  const primary = articles.slice(0, 10);
  // Overflow cards on the homepage (11–13); on a smaller set (e.g. a sector with 3 posts)
  // show all of them as cards under the carousel so the "items underneath" still render.
  const cards = articles.length > 10 ? articles.slice(10) : articles;

  return (
    <section>
      <h2 className="text-xl font-bold">{heading}</h2>
      <p className="mt-1 text-ink/70">{subtitle}</p>

      {/* Primary — full-width mini-hero slider rotating 10 articles */}
      <div className="mt-5">
        <NewsSlider articles={primary} />
      </div>

      {/* Sub-news cards — 3-up on desktop, side-to-side swipe scroll on mobile
          (matches the Major Projects scroller). */}
      {cards.length > 0 && (
        <div className="mt-5 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group w-[82%] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md sm:w-[calc((100%-2.5rem)/3)]"
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

      {moreHref && (
        <Link href={moreHref} className="mt-5 inline-block font-semibold text-primary hover:underline">
          More news →
        </Link>
      )}
    </section>
  );
}
