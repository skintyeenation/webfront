import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PROGRAM_AREAS } from '@/lib/constants';
import { allDeadlines, fundingByArea } from '@skintyee/models';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';
import { ProgramsByArea } from '@/components/ProgramsByArea';
import { ProgramSubmissionSection } from '@/components/ProgramSubmissionSection';
import { FundingCalendar } from '@/components/FundingCalendar';
import { FundingTabs } from '@/components/FundingTabs';
import { ProposalWritersCta } from '@/components/ProposalWritersCta';
import { NeedAssistanceCta } from '@/components/NeedAssistanceCta';

export const revalidate = 60;

export function generateStaticParams() {
  return PROGRAM_AREAS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const prog = PROGRAM_AREAS.find((p) => p.slug === params.slug);
  return { title: prog ? prog.name : 'Program' };
}

// Program category sub-page — posts filed under this program, plus the same funding tabs as
// the hub (programs / apply / calendar) scoped to this area, using the shared components.
export default async function ProgramPage({ params }: { params: { slug: string } }) {
  const prog = PROGRAM_AREAS.find((p) => p.slug === params.slug);
  if (!prog) notFound();

  const posts = await getPostsByCategory(params.slug, 50);
  const hasFunding = fundingByArea(params.slug).length > 0;
  const deadlines = allDeadlines().filter((d) => d.area === params.slug);

  return (
    <>
      <h1 className="text-2xl font-bold">{prog.name}</h1>
      <p className="mt-1 text-ink/70">{prog.desc}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">Updates for {prog.name} will be posted here.</p>
        )}
      </div>

      {hasFunding && (
        <FundingTabs
          tabs={[
            { id: 'programs', label: 'Programs', content: <ProgramsByArea area={params.slug} /> },
            {
              id: 'apply',
              label: 'Apply',
              content: <ProgramSubmissionSection area={params.slug} areaName={prog.name} />,
            },
            ...(deadlines.length
              ? [
                  {
                    id: 'calendar',
                    label: 'Calendar',
                    content: (
                      <FundingCalendar deadlines={deadlines} areas={[{ slug: prog.slug, name: prog.name }]} />
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <NeedAssistanceCta />
      <ProposalWritersCta />
    </>
  );
}
