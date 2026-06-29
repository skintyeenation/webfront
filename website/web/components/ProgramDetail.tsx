import { FileUp } from 'lucide-react';
import type { FundingProgram, PawItem, DciItem } from '@skintyee/models';
import { fundingForNation, SKIN_TYEE_PROFILE } from '@skintyee/models';
import { PROGRAM_GUIDE } from '@/lib/constants';
import { formUrlFor } from '@/lib/funding-forms';
import { Acronym } from './Acronym';

// Shared, client-safe rendering of an ISC funding program's details (no hooks, no server-only
// deps) so the SAME markup is used by the accordion cards (FundingPrograms) AND inline in the
// apply form (ProgramSubmissionForm) when a program is selected.

const SCALE_LABEL = ['', 'smaller / targeted', 'moderate', 'substantial', 'major'];

// Restaurant-style funding-size badge ($–$$$$). Relative magnitude only, not a real amount.
export function ScaleBadge({ scale }: { scale?: 1 | 2 | 3 | 4 }) {
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

/** True when the Nation's size disqualifies this program (card should be greyed out). */
export function isDisqualified(p: FundingProgram): boolean {
  const n = fundingForNation(p, SKIN_TYEE_PROFILE);
  return !!n && !n.eligible;
}

// Program title: name + acronym + scale badge + size-tier / not-available pill.
export function ProgramTitle({ p, as = 'h3' }: { p: FundingProgram; as?: 'h3' | 'h4' }) {
  const nation = fundingForNation(p, SKIN_TYEE_PROFILE);
  const disqualified = !!nation && !nation.eligible;
  const Tag = as;
  return (
    <Tag className={`font-bold ${disqualified ? 'text-ink/50' : 'text-ink'}`}>
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
    </Tag>
  );
}

// Program detail body: size-resolved funding (or static floor/limit), eligibility,
// application requirements, PAW/DCI deadline tables with form downloads, contacts, guide link.
export function ProgramDetail({ p, applyHref }: { p: FundingProgram; applyHref?: string }) {
  const href = p.pdfPage ? `${PROGRAM_GUIDE.href}#page=${p.pdfPage}` : PROGRAM_GUIDE.href;
  const nation = fundingForNation(p, SKIN_TYEE_PROFILE);

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

  return (
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

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {applyHref && (
          <a
            href={applyHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <FileUp size={16} aria-hidden /> Upload PAW / apply
          </a>
        )}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Details in the Program Guide →
        </a>
      </div>
    </>
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
