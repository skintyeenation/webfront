import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FundingProgram } from '@skintyee/models';
import { ProgramTitle, ProgramDetail, isDisqualified } from './ProgramDetail';

// Renders the ISC funding programs for a program area: title, summary, and the shared
// ProgramDetail (eligibility, requirements, PAW/DCI tables, contacts, guide link). When
// `collapsible`, the whole area collapses to its heading (native <details>) — used on the
// funding hub to keep the long list of areas scannable; `footer` renders below the cards.
export function FundingPrograms({
  programs,
  heading = 'Funding programs',
  showIntro = true,
  collapsible = false,
  footer,
}: {
  programs: FundingProgram[];
  heading?: string;
  showIntro?: boolean;
  collapsible?: boolean;
  footer?: ReactNode;
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
          <FundingCard key={p.name} p={p} collapsible={!collapsible} />
        ))}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  if (collapsible) {
    return (
      <details className="group mt-6 border-t border-[var(--line)] pt-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="text-xl font-bold">{heading}</h2>
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

function FundingCard({ p, collapsible = true }: { p: FundingProgram; collapsible?: boolean }) {
  const disqualified = isDisqualified(p);
  const shell = `rounded-xl border border-[var(--line)] p-5${disqualified ? ' bg-[#fafbfb] opacity-70' : ''}`;
  const summaryText = `mt-1.5 text-sm ${disqualified ? 'text-ink/50' : 'text-ink/75'}`;

  if (!collapsible) {
    return (
      <article className={shell}>
        <ProgramTitle p={p} />
        <p className={summaryText}>{p.summary}</p>
        <ProgramDetail p={p} />
      </article>
    );
  }

  return (
    <details className={`group ${shell}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <ProgramTitle p={p} />
          <p className={summaryText}>{p.summary}</p>
        </div>
        <ChevronDown
          aria-hidden
          size={20}
          className="mt-0.5 shrink-0 text-ink/50 transition-transform group-open:rotate-180"
        />
      </summary>
      <ProgramDetail p={p} />
    </details>
  );
}
