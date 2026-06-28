import { fundingByArea, programSlug } from '@skintyee/models';
import { ProgramSubmissionGate } from './ProgramSubmissionGate';

// Per-program funding submission portal (Phase 1b, website-first). Server component:
// computes the program options for this area (so the full funding dataset is NOT shipped
// to the client) and hands them to a client gate that checks the Entra session per-user.
// Uploads are filed into the program's <area>/<slug>/ folder (repo / SharePoint mirror —
// docs/funding/PLAN.md §5). Renders nothing for areas with no funding programs.
export function ProgramSubmissionSection({ area, areaName }: { area: string; areaName: string }) {
  const programs = fundingByArea(area);
  if (!programs.length) return null;
  const options = programs.map((p) => ({ slug: programSlug(p), name: p.name, acronym: p.acronym }));

  return (
    <section className="mt-10 rounded-2xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-bold text-ink">Submit a funding application</h2>
      <p className="mt-1 text-sm text-ink/70">
        Members and staff can submit a completed PAW application and supporting documents for a{' '}
        {areaName} program. Submissions are filed securely for Skin Tyee staff review.
      </p>
      <ProgramSubmissionGate area={area} options={options} />
    </section>
  );
}
