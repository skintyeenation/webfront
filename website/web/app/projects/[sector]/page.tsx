import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MAJOR_PROJECT_SECTORS } from '@/lib/constants';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';
import { ProjectReferralCta } from '@/components/ProjectReferralCta';

export const revalidate = 60;

export function generateStaticParams() {
  return MAJOR_PROJECT_SECTORS.map((s) => ({ sector: s.slug }));
}

export async function generateMetadata({ params }: { params: { sector: string } }): Promise<Metadata> {
  const s = MAJOR_PROJECT_SECTORS.find((x) => x.slug === params.sector);
  return { title: s ? s.name : 'Projects' };
}

// Major-project sector page — all projects filed under this sector.
export default async function SectorPage({ params }: { params: { sector: string } }) {
  const sector = MAJOR_PROJECT_SECTORS.find((s) => s.slug === params.sector);
  if (!sector) notFound();

  const posts = await getPostsByCategory(params.sector, 100);
  return (
    <>
      <h1 className="text-2xl font-bold">{sector.name}</h1>
      <p className="mt-1 text-ink/70">Projects in {sector.name}.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">Projects will be posted here.</p>
        )}
      </div>
      <ProjectReferralCta />
    </>
  );
}
