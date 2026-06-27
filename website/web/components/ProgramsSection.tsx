import { PROGRAM_AREAS } from '@/lib/constants';
import { ProgramCard } from '@/components/cards';

// Home "Programs" section — the same grey-gradient program cards (with icons) as
// the /programs page.
export function ProgramsSection() {
  return (
    <section>
      <h2 className="text-xl font-bold">Programs</h2>
      <p className="mt-1 text-ink/70">Band programs and services.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROGRAM_AREAS.map((p) => <ProgramCard key={p.slug} p={p} />)}
      </div>
    </section>
  );
}
