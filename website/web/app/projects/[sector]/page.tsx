import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MAJOR_PROJECT_SECTORS } from '@/lib/constants';
import { NewsSection } from '@/components/NewsSection';
import { projectImage } from '@/lib/projectImages';
import { ProjectReferralCta } from '@/components/ProjectReferralCta';

export const revalidate = 60;

export function generateStaticParams() {
  return MAJOR_PROJECT_SECTORS.map((s) => ({ sector: s.slug }));
}

export async function generateMetadata({ params }: { params: { sector: string } }): Promise<Metadata> {
  const s = MAJOR_PROJECT_SECTORS.find((x) => x.slug === params.sector);
  return { title: s ? s.name : 'Projects' };
}

// Major-project sector page — projects filed under this sector, presented as a
// homepage-style news slider filtered to this sector.
export default async function SectorPage({ params }: { params: { sector: string } }) {
  const sector = MAJOR_PROJECT_SECTORS.find((s) => s.slug === params.sector);
  if (!sector) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold">{sector.name}</h1>
      <p className="mt-1 text-ink/70">Projects and updates in {sector.name}.</p>

      <div className="mt-6">
        <NewsSection
          category={params.sector}
          heading={`${sector.name} projects`}
          subtitle={`Latest in ${sector.name}.`}
          categoryLabel={sector.name}
          imageFor={projectImage}
          moreHref=""
        />
      </div>

      <ProjectReferralCta />
    </>
  );
}
