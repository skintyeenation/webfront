import type { FundingProgram, PawItem, DciItem } from '@skintyee/models';
import { PROGRAM_GUIDE } from '@/lib/constants';
import { formUrlFor } from '@/lib/funding-forms';
import { Acronym } from './Acronym';

// Renders the ISC funding programs for a program area: plain summary, eligibility,
// requirements, Application (PAW) + Reporting (DCI) deadline tables, contact cards,
// and a deep-link into the Program Guide.
export function FundingPrograms({
  programs,
  heading = 'Funding programs',
  showIntro = true,
}: {
  programs: FundingProgram[];
  heading?: string;
  showIntro?: boolean;
}) {
  if (!programs.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">{heading}</h2>
      {showIntro && (
        <p className="mt-1 text-sm text-ink/60">
          Federal (Indigenous Services Canada) funding for this area. <strong>PAW</strong> = how you apply;{' '}
          <strong>DCI</strong> = the report you owe.
        </p>
      )}
      <div className="mt-4 space-y-5">
        {programs.map((p) => (
          <FundingCard key={p.name} p={p} />
        ))}
      </div>
    </section>
  );
}

function FundingCard({ p }: { p: FundingProgram }) {
  const href = p.pdfPage ? `${PROGRAM_GUIDE.href}#page=${p.pdfPage}` : PROGRAM_GUIDE.href;
  return (
    <article className="rounded-xl border border-[var(--line)] p-5">
      <h3 className="font-bold text-ink">
        {p.name}
        {p.acronym && (
          <span className="ml-2 text-sm font-semibold text-accent">
            <Acronym>{p.acronym}</Acronym>
          </span>
        )}
      </h3>
      <p className="mt-1.5 text-sm text-ink/75">{p.summary}</p>

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
    </article>
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
