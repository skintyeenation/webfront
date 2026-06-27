import type { Metadata } from 'next';
import Link from 'next/link';
import { MAJOR_PROJECT_SECTORS } from '@/lib/constants';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';
import { ProjectReferralCta } from '@/components/ProjectReferralCta';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Major Projects' };

const SHOWN = 3; // completed projects shown per sector before "View more"

// Major Projects — lists every sector (same categories as the home band), each
// with its (dummy, completed) projects + a "View more" link to the full sector.
export default async function ProjectsPage() {
  const sectors = await Promise.all(
    MAJOR_PROJECT_SECTORS.map(async (s) => ({ ...s, posts: await getPostsByCategory(s.slug, 50) })),
  );

  return (
    <>
      <h1 className="text-2xl font-bold">Major Projects</h1>
      <p className="mt-1 max-w-2xl text-ink/70">
        Capital projects and community investments across our territory, by sector — oil &amp; gas,
        minerals &amp; mining, housing &amp; economic development, forestry &amp; conservation, and
        telecommunications.
      </p>

      <div className="mt-8 space-y-10">
        {sectors.map((s) => (
          <section key={s.slug}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-bold">{s.name}</h2>
              {s.posts.length > SHOWN && (
                <Link href={`/projects/${s.slug}`} className="shrink-0 text-sm font-semibold text-primary hover:underline">
                  View more →
                </Link>
              )}
            </div>
            {s.posts.length ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {s.posts.slice(0, SHOWN).map((p) => (
                  <PostTeaser key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-ink/50">No completed projects in this area yet.</p>
            )}
          </section>
        ))}
      </div>

      <ProjectReferralCta />
    </>
  );
}
