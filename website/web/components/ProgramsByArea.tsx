import Link from 'next/link';
import { fundingByArea } from '@skintyee/models';
import { PROGRAM_AREAS } from '@/lib/constants';
import { submissionStatus } from '@/lib/submissions';
import { FundingPrograms, FundingScaleLegend } from './FundingPrograms';

// Programs-by-area browser. Reusable: pass an `area` slug for a single area (a funding
// subpage) or omit it for every area (the funding hub, where each area is a collapsible
// accordion with a roll-up submission badge + "More on X" link). Reads the submission store
// so each area header and each program card shows whether something's been submitted.
export async function ProgramsByArea({ area }: { area?: string }) {
  const status = await submissionStatus();

  if (area) {
    const progs = fundingByArea(area);
    if (!progs.length) return null;
    return (
      <div>
        <FundingScaleLegend />
        <FundingPrograms
          programs={progs}
          showIntro={false}
          heading="Funding programs"
          programStatus={status[area]?.programs}
        />
      </div>
    );
  }

  const areas = PROGRAM_AREAS.filter((a) => fundingByArea(a.slug).length > 0);
  if (!areas.length) return null;
  return (
    <div>
      <FundingScaleLegend />
      {areas.map((a) => (
        <FundingPrograms
          key={a.slug}
          programs={fundingByArea(a.slug)}
          showIntro={false}
          heading={a.name}
          collapsible
          areaStatus={status[a.slug]?.total}
          programStatus={status[a.slug]?.programs}
          footer={
            <Link href={`/programs/${a.slug}`} className="text-sm font-semibold text-primary hover:underline">
              More on {a.name} →
            </Link>
          }
        />
      ))}
    </div>
  );
}
