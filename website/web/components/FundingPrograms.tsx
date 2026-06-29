import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FundingProgram } from '@skintyee/models';
import { programSlug } from '@skintyee/models';
import { relativeTime, type SubmissionStat } from '@/lib/submissions';
import { ProgramTitle, ProgramDetail, isDisqualified } from './ProgramDetail';

// Renders the ISC funding programs for a program area: title, summary, submission status,
// the shared ProgramDetail, and an "Upload PAW" deep-link into the Apply tab. When
// `collapsible`, the whole area collapses to its heading (native <details>) with a roll-up
// submission badge; `footer` renders below the cards.
export function FundingPrograms({
  programs,
  heading = 'Funding programs',
  showIntro = true,
  collapsible = false,
  footer,
  areaStatus,
  programStatus,
}: {
  programs: FundingProgram[];
  heading?: string;
  showIntro?: boolean;
  collapsible?: boolean;
  footer?: ReactNode;
  areaStatus?: SubmissionStat;
  programStatus?: Record<string, SubmissionStat>;
}) {
  if (!programs.length) return null;

  const body = (
    <>
      {showIntro && (
        <p className="mt-1 text-sm text-ink/60">
          Federal (Indigenous Services Canada) funding for this area. <strong>PAW</strong> = how you apply;{' '}
          <strong>DCI</strong> = the report you owe.
        </p>
      )}
      <div className="mt-4 space-y-5">
        {programs.map((p) => (
          // Inside an area accordion (hub) the area is the collapse level, so cards render
          // open — otherwise expanding an area would just reveal a second layer of collapsed
          // cards (no details, no forms). On a program page each card collapses on its own.
          <FundingCard key={p.name} p={p} collapsible={!collapsible} status={programStatus?.[programSlug(p)]} />
        ))}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  if (collapsible) {
    return (
      <details className="group mt-6 border-t border-[var(--line)] pt-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">{heading}</h2>
            <SubmissionBadge s={areaStatus} />
          </span>
          <ChevronDown
            aria-hidden
            size={24}
            className="shrink-0 text-ink/50 transition-transform group-open:rotate-180"
          />
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">{heading}</h2>
      {body}
    </section>
  );
}

// Submission status pill — green when there's at least one filed submission, grey otherwise.
function SubmissionBadge({ s }: { s?: SubmissionStat }) {
  if (s?.count) {
    const rel = relativeTime(s.latest);
    return (
      <span
        title={`${s.count} submission${s.count > 1 ? 's' : ''}${rel ? ` · latest ${rel}` : ''}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f3ec] px-2 py-0.5 text-xs font-semibold text-[#1d7a4d]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#1d7a4d]" />
        Submitted{rel ? ` ${rel}` : ''}
        {s.count > 1 ? ` (${s.count})` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/45">
      <span className="h-1.5 w-1.5 rounded-full bg-ink/25" />
      No submissions yet
    </span>
  );
}

// Compact legend for the funding-size scale — rendered once per page near the programs.
export function FundingScaleLegend() {
  return (
    <p className="mt-3 rounded-lg bg-[#f2f7f8] px-3 py-2 text-xs text-ink/60">
      <span className="font-semibold text-ink/75">Funding scale</span>{' '}
      <span className="font-mono">
        <span className="font-bold text-primary">$</span>
        <span className="text-ink/20">$$$</span>
      </span>{' '}
      smaller / targeted →{' '}
      <span className="font-mono font-bold text-primary">$$$$</span> major. A rough size indicator,{' '}
      <strong>not an actual amount</strong> — real figures come from the funding agreement, FNIIP, and the
      Nation&apos;s Sage 300 books.
    </p>
  );
}

function FundingCard({
  p,
  collapsible = true,
  status,
}: {
  p: FundingProgram;
  collapsible?: boolean;
  status?: SubmissionStat;
}) {
  const disqualified = isDisqualified(p);
  const shell = `rounded-xl border border-[var(--line)] p-5${disqualified ? ' bg-[#fafbfb] opacity-70' : ''}`;
  const summaryText = `mt-1.5 text-sm ${disqualified ? 'text-ink/50' : 'text-ink/75'}`;

  // Deep-link into the Apply tab with this program preselected (works on the hub and on the
  // program subpage — both have an Apply tab listening for this hash). Omitted when the
  // Nation's size disqualifies the program.
  const applyHref = disqualified ? undefined : `#apply=paw:${p.area}/${programSlug(p)}`;

  if (!collapsible) {
    return (
      <article className={shell}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <ProgramTitle p={p} />
          <SubmissionBadge s={status} />
        </div>
        <p className={summaryText}>{p.summary}</p>
        <ProgramDetail p={p} applyHref={applyHref} />
      </article>
    );
  }

  return (
    <details className={`group ${shell}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ProgramTitle p={p} />
            <SubmissionBadge s={status} />
          </div>
          <p className={summaryText}>{p.summary}</p>
        </div>
        <ChevronDown
          aria-hidden
          size={20}
          className="mt-0.5 shrink-0 text-ink/50 transition-transform group-open:rotate-180"
        />
      </summary>
      <ProgramDetail p={p} applyHref={applyHref} />
    </details>
  );
}
