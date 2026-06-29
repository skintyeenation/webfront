import type { Metadata } from 'next';
import Link from 'next/link';
import { PROGRAM_AREAS, PROGRAM_GUIDE } from '@/lib/constants';
import { allDeadlines } from '@skintyee/models';
import { FundingCalendar } from '@/components/FundingCalendar';
import { ProgramsByArea } from '@/components/ProgramsByArea';
import { ProgramSubmissionSection } from '@/components/ProgramSubmissionSection';
import { FundingTabs } from '@/components/FundingTabs';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Funding' };

// Funding hub: federal (ISC) funding programs (by area), a deadline calendar, and the apply
// portal — each in its own tab.
export default async function FundingPage() {
  const deadlines = allDeadlines();
  const calendarAreas = PROGRAM_AREAS.filter((a) => deadlines.some((d) => d.area === a.slug)).map(
    ({ slug, name }) => ({ slug, name }),
  );

  return (
    <>
      <h1 className="text-2xl font-bold">Funding</h1>
      <p className="mt-1 text-ink/70">
        The Nation&apos;s portal for federal funding programs — find the program for your area, see its
        deadlines, download the application form, and submit your completed PAW and supporting documents.
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

      <FundingTabs
        tabs={[
          {
            id: 'calendar',
            label: 'Calendar',
            content: <FundingCalendar deadlines={deadlines} areas={calendarAreas} />,
          },
          { id: 'programs', label: 'Programs by area', content: <ProgramsByArea /> },
          { id: 'apply', label: 'Apply', content: <ProgramSubmissionSection /> },
        ]}
      />
    </>
  );
}
