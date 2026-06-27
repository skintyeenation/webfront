import type { Metadata } from 'next';
import { PROGRAM_AREAS } from '@/lib/constants';
import { ProgramCard } from '@/components/cards';
import { ProposalWritersCta } from '@/components/ProposalWritersCta';

export const metadata: Metadata = { title: 'Programs' };

// Master page — lists the program categories. Each links to /programs/<slug>,
// which shows the posts filed under that category.
export default function ProgramsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Programs</h1>
      <p className="mt-1 text-ink/70">Band programs and services.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {PROGRAM_AREAS.map((p) => <ProgramCard key={p.slug} p={p} />)}
      </div>
      <ProposalWritersCta />
    </>
  );
}
