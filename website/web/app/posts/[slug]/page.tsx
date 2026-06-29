import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug, getPostExtras, stripHtml } from '@/lib/wp';
import { projectImageLarge } from '@/lib/projectImages';
import { MAJOR_PROJECT_SECTORS } from '@/lib/constants';
import { publicApi, safe } from '@/lib/api';
import { NotificationItem } from '@/components/cards';

// No generateStaticParams: the root layout reads the session (cookies), so a statically
// prerendered page hits "static→dynamic at runtime, reason: headers" and 500s. Render
// on-demand with ISR (revalidate) instead — same pattern as the working home page.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  return { title: post ? stripHtml(post.title.rendered) : 'Not found' };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  const [{ category, related }, notifications] = await Promise.all([
    getPostExtras(params.slug, 3),
    safe(publicApi.notifications.list(), []),
  ]);

  // Breadcrumb / back-link target depends on where the post lives: a major-project sector,
  // or general news.
  const sector = category ? MAJOR_PROJECT_SECTORS.find((s) => s.slug === category.slug) : undefined;
  const back = sector
    ? { label: sector.name, href: `/projects/${sector.slug}`, parent: { label: 'Projects', href: '/projects' } }
    : { label: 'News', href: '/news', parent: null as { label: string; href: string } | null };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0">
        {/* breadcrumbs */}
        <nav className="text-sm text-ink/50">
          <Link href="/" className="hover:text-primary">
            Home
          </Link>
          {back.parent && (
            <>
              <span className="px-1.5">/</span>
              <Link href={back.parent.href} className="hover:text-primary">
                {back.parent.label}
              </Link>
            </>
          )}
          <span className="px-1.5">/</span>
          <Link href={back.href} className="hover:text-primary">
            {back.label}
          </Link>
        </nav>

        <header className="mt-3">
          <h1
            className="text-3xl font-bold leading-tight text-ink"
            dangerouslySetInnerHTML={{ __html: post.title.rendered }}
          />
          <time dateTime={post.date} className="mt-2 block text-sm text-ink/50">
            {fmtDate(post.date)}
          </time>
        </header>

        <div className="prose prose-lg mt-6 max-w-none prose-headings:text-ink prose-a:text-primary prose-img:rounded-lg">
          {/* Leading image — floats left on desktop so the copy wraps around it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={projectImageLarge(params.slug)}
            alt=""
            className="mb-4 w-full rounded-lg md:float-left md:mb-3 md:mr-6 md:w-2/5"
          />
          <div dangerouslySetInnerHTML={{ __html: post.content.rendered }} />

          {/* Placeholder copy — lets us see paragraph spacing / line-break rendering. */}
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
            labore et dolore magna aliqua. Ut enim ad minim veniam.
          </p>
          <p>
            Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute
            irure dolor in reprehenderit in voluptate velit esse.
          </p>
        </div>

        {/* Related posts — 3-up swipe scroller (sits above the site-wide Rights & Title band). */}
        {related.length > 0 && (
          <section className="clear-both mt-12">
            <h2 className="text-lg font-bold">Related</h2>
            <div className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/posts/${r.slug}`}
                  className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md sm:w-[calc((100%-2rem)/3)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={projectImageLarge(r.slug)} alt="" className="h-36 w-full object-cover" />
                  <div className="p-3">
                    <h3 className="font-semibold leading-snug text-ink group-hover:text-primary">
                      {stripHtml(r.title.rendered)}
                    </h3>
                    <span className="mt-1 block text-xs text-ink/45">{fmtDate(r.date)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link href={back.href} className="mt-8 inline-block text-sm font-semibold text-primary hover:underline">
          ← Back to {back.label}
        </Link>
      </article>

      {/* Right sidebar — notifications, like the home page. */}
      <aside>
        <section>
          <h2 className="mb-2 text-lg font-bold">Notifications</h2>
          {notifications.length ? (
            notifications.map((n) => <NotificationItem key={n._id} n={n} />)
          ) : (
            <p className="text-ink/60">No current notices.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
