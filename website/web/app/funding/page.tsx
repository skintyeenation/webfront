import type { Metadata } from 'next';
import Link from 'next/link';
import { publicApi, safe } from '@/lib/api';
import { ExpenditureCard } from '@/components/cards';
import { PROGRAM_AREAS, PROGRAM_GUIDE } from '@/lib/constants';
import { fundingByArea, allDeadlines } from '@skintyee/models';
import { FundingPrograms } from '@/components/FundingPrograms';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Funding' };

// Funding hub: federal (ISC) funding programs you can access (by area), a deadline
// calendar, and band-expenditure transparency.
export default async function FundingPage() {
  const expenditures = await safe(publicApi.transparency.expenditures(), []);
  const deadlines = allDeadlines();

  return (
    <>
      <h1 className="text-2xl font-bold">Funding</h1>
      <p className="mt-1 text-ink/70">
        Federal funding programs the Nation can access, their deadlines, and how the band spends its funding.
      </p>

      {/* Intro / key concepts */}
      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[#f2f7f8] p-5 text-sm text-ink/75">
        Most programs come from <strong>Indigenous Services Canada (ISC)</strong>. Two ideas run through all of
        them: a <strong>PAW</strong> (Proposal / Application / Work plan — how you apply, with a due date) and a{' '}
        <strong>DCI</strong> (Data Collection Instrument — the report you owe, with a due date). Many capital and
        housing programs require the project to be in your <strong>FNIIP</strong>.{' '}
        <a
          href={PROGRAM_GUIDE.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary hover:underline"
        >
          Full ISC BC Region Program Guide (PDF) →
        </a>
      </section>

      {/* New-here CTA — the digestible training course */}
      <Link
        href="/funding/learn"
        className="mt-6 flex items-center gap-4 rounded-xl border border-primary/40 bg-[#f2f7f8] p-5 transition hover:bg-[#e8f1f3]"
      >
        <span className="text-2xl" aria-hidden>
          🧭
        </span>
        <span>
          <span className="block font-bold text-ink">New here? Start with Funding 101</span>
          <span className="block text-sm text-ink/65">
            A plain-language walkthrough of the 189-page guide — apply, report, and stay on top of deadlines.
          </span>
        </span>
        <span className="ml-auto font-semibold text-primary">→</span>
      </Link>

      {/* Programs by area */}
      {PROGRAM_AREAS.map((area) => {
        const progs = fundingByArea(area.slug);
        if (!progs.length) return null;
        return (
          <div key={area.slug}>
            <FundingPrograms
              programs={progs}
              showIntro={false}
              heading={`${area.name}`}
            />
            <Link href={`/programs/${area.slug}`} className="text-sm font-semibold text-primary hover:underline">
              More on {area.name} →
            </Link>
          </div>
        );
      })}

      {/* Funding calendar */}
      <section className="mt-12">
        <h2 className="text-xl font-bold">Funding calendar</h2>
        <p className="mt-1 text-sm text-ink/60">Application (PAW) and reporting (DCI) deadlines across all programs.</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f2f7f8] text-left text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-3 py-2 font-bold">Program</th>
                <th className="px-3 py-2 font-bold">Type</th>
                <th className="px-3 py-2 font-bold">Item</th>
                <th className="px-3 py-2 font-bold">Due</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.map((d, i) => (
                <tr key={i} className="border-t border-[var(--line)]">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{d.program}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink/60">{d.kind}</td>
                  <td className="px-3 py-2 text-ink/75">
                    {d.ref && <span className="font-mono text-ink/45">{d.ref} </span>}
                    {d.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink/80">{d.due ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transparency — band expenditures */}
      <section className="mt-12">
        <h2 className="text-xl font-bold">Transparency — band expenditures</h2>
        <p className="mt-1 text-sm text-ink/60">How the Nation has spent its funding, by program area.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {expenditures.length ? (
            expenditures.map((x) => <ExpenditureCard key={x._id} x={x} />)
          ) : (
            <p className="text-ink/60">Financial reports coming soon.</p>
          )}
        </div>
      </section>
    </>
  );
}
