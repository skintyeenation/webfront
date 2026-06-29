import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FundingProgram, PawItem, DciItem } from '@skintyee/models';
import { fundingForNation, SKIN_TYEE_PROFILE } from '@skintyee/models';
import { PROGRAM_GUIDE } from '@/lib/constants';
import { formUrlFor } from '@/lib/funding-forms';
import { Acronym } from './Acronym';

// Renders the ISC funding programs for a program area: plain summary, eligibility,
// requirements, Application (PAW) + Reporting (DCI) deadline tables, contact cards,
// and a deep-link into the Program Guide. When `collapsible`, the whole area collapses
// to its heading (native <details>) — used on the funding hub to keep the long list of
// areas scannable; `footer` renders below the cards (e.g. a "More on X" link).
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

const SCALE_LABEL = ['', 'smaller / targeted', 'moderate', 'substantial', 'major'];

// Restaurant-style funding-size badge ($–$$$$). Relative magnitude only, not a real amount.
function ScaleBadge({ scale }: { scale?: 1 | 2 | 3 | 4 }) {
  if (!scale) return null;
  return (
    <span
      title={`Funding scale: ${'$'.repeat(scale)} of $$$$ (${SCALE_LABEL[scale]}) — a rough size indicator, not an actual amount`}
      aria-label={`Funding scale ${scale} of 4 (${SCALE_LABEL[scale]})`}
      className="ml-2 whitespace-nowrap font-mono text-sm tracking-tight"
    >
      <span className="font-bold text-primary">{'$'.repeat(scale)}</span>
      <span className="text-ink/20">{'$'.repeat(4 - scale)}</span>
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

function FundingCard({ p, collapsible = true }: { p: FundingProgram; collapsible?: boolean }) {
  const href = p.pdfPage ? `${PROGRAM_GUIDE.href}#page=${p.pdfPage}` : PROGRAM_GUIDE.href;

  // Resolve this program against the Nation's size. null = not size-sensitive (show normally);
  // eligible:false = disqualified at our size → grey the card out; eligible+amount = size-adjusted figure.
  const nation = fundingForNation(p, SKIN_TYEE_PROFILE);
  const disqualified = !!nation && !nation.eligible;

  const title = (
    <h3 className={`font-bold ${disqualified ? 'text-ink/50' : 'text-ink'}`}>
      {p.name}
      {p.acronym && (
        <span className={`ml-2 text-sm font-semibold ${disqualified ? 'text-ink/40' : 'text-accent'}`}>
          <Acronym>{p.acronym}</Acronym>
        </span>
      )}
      <ScaleBadge scale={p.scale} />
      {disqualified && (
        <span className="ml-2 inline-block rounded-full bg-ink/10 px-2 py-0.5 align-middle text-xs font-semibold text-ink/55">
          Not available at current size
        </span>
      )}
      {nation?.eligible && nation.tier && (
        <span className="ml-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-semibold text-primary">
          {nation.tier}
        </span>
      )}
    </h3>
  );

  // Funding figures: a size-resolved verdict (when the program is size-sensitive) takes
  // precedence over the static floor/limit range.
  const fundingBlock = nation ? (
    nation.eligible ? (
      <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm">
        <span className="font-semibold text-primary">
          For {SKIN_TYEE_PROFILE.name} (~{SKIN_TYEE_PROFILE.totalMembers} members):{' '}
        </span>
        <span className="font-semibold text-ink">
          {nation.tier ? `${nation.tier} — ` : ''}
          {nation.amount}
        </span>{' '}
        <span className="text-ink/55">({nation.basis})</span>
      </div>
    ) : (
      <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-[#f7f8f8] px-3 py-2 text-sm text-ink/60">
        <span className="font-semibold text-ink/70">
          Not available at {SKIN_TYEE_PROFILE.name}&apos;s current size.{' '}
        </span>
        {nation.basis}
      </div>
    )
  ) : (
    (p.floor || p.limit) && (
      <div className="mt-3 flex flex-wrap gap-2">
        {p.floor && (
          <span className="rounded-lg bg-[#f2f7f8] px-3 py-1.5 text-sm">
            <span className="text-ink/55">Funding floor: </span>
            <span className="font-semibold text-ink">{p.floor}</span>
          </span>
        )}
        {p.limit && (
          <span className="rounded-lg bg-[#f2f7f8] px-3 py-1.5 text-sm">
            <span className="text-ink/55">Funding limit: </span>
            <span className="font-semibold text-ink">{p.limit}</span>
          </span>
        )}
      </div>
    )
  );

  const detail = (
    <>
      {fundingBlock}

      {p.eligibility && (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-ink">Who&apos;s eligible: </span>
          <span className="text-ink/70">{p.eligibility}</span>
        </p>
      )}

      {!!p.requirements?.length && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink/50">Application requirements</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink/75">
            {p.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {(!!p.paw?.length || !!p.dci?.length) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {!!p.paw?.length && <DeadlineTable title="Apply — PAW" rows={p.paw} />}
          {!!p.dci?.length && <DeadlineTable title="Report — DCI" rows={p.dci} />}
        </div>
      )}

      {!!p.contacts?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.contacts.map((c, i) => (
            <div key={i} className="rounded-lg bg-[#f2f7f8] px-3 py-2 text-xs">
              <span className="block font-semibold text-ink">{c.label}</span>
              {c.phone && <span className="block text-ink/60">📞 {c.phone}</span>}
              {c.email && (
                <a href={`mailto:${c.email}`} className="block text-primary hover:underline">
                  ✉️ {c.email}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Details in the Program Guide →
      </a>
    </>
  );

  const shell = `rounded-xl border border-[var(--line)] p-5${disqualified ? ' bg-[#fafbfb] opacity-70' : ''}`;
  const summaryText = `mt-1.5 text-sm ${disqualified ? 'text-ink/50' : 'text-ink/75'}`;

  if (!collapsible) {
    return (
      <article className={shell}>
        {title}
        <p className={summaryText}>{p.summary}</p>
        {detail}
      </article>
    );
  }

  return (
    <details className={`group ${shell}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          {title}
          <p className={summaryText}>{p.summary}</p>
        </div>
        <ChevronDown
          aria-hidden
          size={20}
          className="mt-0.5 shrink-0 text-ink/50 transition-transform group-open:rotate-180"
        />
      </summary>
      {detail}
    </details>
  );
}

function DeadlineTable({ title, rows }: { title: string; rows: (PawItem | DciItem)[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--line)]">
      <div className="bg-[#f2f7f8] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink/60">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r, i) => {
            const form = formUrlFor(r.no);
            return (
              <tr key={i} className="border-t border-[var(--line)]">
                <td className="px-3 py-1.5 align-top">
                  {r.no && <span className="font-mono text-ink/45">{r.no} </span>}
                  {r.name}
                  {form && (
                    <a
                      href={form}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-primary hover:underline"
                    >
                      ↓ Download form
                    </a>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-semibold text-ink/80">{r.due ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
