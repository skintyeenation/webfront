import { fundingByArea } from '@skintyee/models';
import { PROGRAM_AREAS } from '@/lib/constants';
import { ProgramSubmissionGate } from './ProgramSubmissionGate';
import type { SubmissionOption } from './ProgramSubmissionForm';

// Funding submission portal (Phase 1b, website-first). Reusable: pass an `area` for a single
// program area (a program page), or omit it for ALL areas (the funding hub) — options are then
// grouped by area and each carries its own area so uploads still land in the right
// <area>/<slug>/ folder (repo / SharePoint mirror — docs/funding/PLAN.md §5). Server component:
// builds the options server-side so the full funding dataset isn't shipped to the client, then
// hands them to a client gate that checks the Entra session per-user. Renders nothing if empty.
export function ProgramSubmissionSection({ area, areaName }: { area?: string; areaName?: string }) {
  const areas = area ? PROGRAM_AREAS.filter((a) => a.slug === area) : PROGRAM_AREAS;
  const allAreas = !area;

  const options: SubmissionOption[] = areas.flatMap((a) =>
    fundingByArea(a.slug).map((p) => ({
      area: a.slug,
      group: allAreas ? a.name : undefined, // group the dropdown by area only on the hub
      program: p,
    })),
  );
  if (!options.length) return null;

  return (
    <section className="mt-10 rounded-2xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-bold text-ink">Submit to a program</h2>
      <p className="mt-1 text-sm text-ink/70">
        Members and staff can submit a funding <strong>application (PAW)</strong> or a{' '}
        <strong>report (DCI)</strong> with supporting documents for{' '}
        {allAreas ? 'any Skin Tyee funding program' : `a ${areaName} program`}. Submissions are filed
        securely for Skin Tyee staff review.
      </p>
      <ProgramSubmissionGate options={options} />
    </section>
  );
}
