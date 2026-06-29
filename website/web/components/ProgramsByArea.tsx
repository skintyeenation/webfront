import Link from 'next/link';
import { fundingByArea } from '@skintyee/models';
import { PROGRAM_AREAS } from '@/lib/constants';
import { FundingPrograms, FundingScaleLegend } from './FundingPrograms';

// Programs-by-area browser. Reusable: pass an `area` slug for a single area (a funding
// subpage) or omit it for every area (the funding hub, where each area is a collapsible
// accordion with a "More on X" link). Renders nothing when there are no funding programs.
export function ProgramsByArea({ area }: { area?: string }) {
  if (area) {
    const progs = fundingByArea(area);
    if (!progs.length) return null;
    return (
      <div>
        <FundingScaleLegend />
        <FundingPrograms programs={progs} showIntro={false} heading="Funding programs" />
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
