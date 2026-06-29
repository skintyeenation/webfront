import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fundingByArea, allDeadlines } from '@skintyee/models';
import { LEARN_MODULES, learnModule, AREA_INTRO } from '@/lib/funding-learn';
import { FundingPrograms } from '@/components/FundingPrograms';
import { Acronym } from '@/components/Acronym';

// On-demand render (no generateStaticParams) — the root layout reads the session (headers),
// which conflicts with static prerendering. See app/posts/[slug]/page.tsx.
export const revalidate = 60;

export function generateMetadata({ params }: { params: { module: string } }): Metadata {
  const m = learnModule(params.module);
  return { title: m ? `${m.title} · Funding 101` : 'Funding 101' };
}

export default function LearnModulePage({ params }: { params: { module: string } }) {
  const mod = learnModule(params.module);
  if (!mod) notFound();
  const idx = LEARN_MODULES.findIndex((m) => m.slug === mod.slug);
  const prev = LEARN_MODULES[idx - 1];
  const next = LEARN_MODULES[idx + 1];

  return (
    <>
      <Link href="/funding/learn" className="text-sm font-semibold text-primary hover:underline">
        ← Funding 101
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{mod.title}</h1>
      <p className="mt-1 text-ink/70">{mod.blurb}</p>

      <div className="mt-6">
        {mod.slug === 'funding-101' ? (
          <Funding101 />
        ) : mod.slug === 'calendar' ? (
          <CalendarModule />
        ) : (
          <AreaModule slug={mod.slug} />
        )}
      </div>

      {/* Prev / next */}
      <nav className="mt-12 flex justify-between gap-4 border-t border-[var(--line)] pt-5 text-sm">
        {prev ? (
          <Link href={`/funding/learn/${prev.slug}`} className="font-semibold text-primary hover:underline">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/funding/learn/${next.slug}`} className="font-semibold text-primary hover:underline">
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}

// ---- Module: Funding 101 (plain-language concepts) ------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-ink/75">{children}</div>
    </section>
  );
}

function Takeaways({ items }: { items: string[] }) {
  return (
    <div className="mt-6 rounded-xl border border-[var(--line)] bg-[#f2f7f8] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/50">Key takeaways</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Funding101() {
  return (
    <>
      <Section title="Two kinds of money: grants vs contributions">
        <p>
          Almost all band funding is a <strong>transfer payment</strong> from Indigenous Services
          Canada (<Acronym>ISC</Acronym>). It comes two ways:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Grants</strong> — you’re accountable to your members, no audit required. The newer
            10-year <Acronym>NFR</Acronym> grant gives multi-year, flexible core funding.
          </li>
          <li>
            <strong>Contributions</strong> — you’re accountable to Canada, subject to audit, and there
            are conditions in your funding agreement.
          </li>
        </ul>
      </Section>

      <Section title="PAW — how you apply">
        <p>
          A <strong><Acronym>PAW</Acronym></strong> (Proposal / Application / Work plan) is the form you
          submit to <em>get</em> funding. Each one has a number and a <strong>due date</strong>. Some
          programs need a fresh PAW every year; others (Block / Grant agreements) build it into your core
          funding so you only re-apply when you renew.
        </p>
      </Section>

      <Section title="DCI — what you report">
        <p>
          A <strong><Acronym>DCI</Acronym></strong> (Data Collection Instrument) is the report you
          <em> owe back</em> after you’ve received funding — also numbered, also with a due date. Your
          funding agreement lists which DCIs you owe and when.
        </p>
      </Section>

      <Section title="FNIIP — the plan behind the money">
        <p>
          For anything to do with buildings, water, roads, or housing, the project usually has to be in
          your <strong><Acronym>FNIIP</Acronym></strong> — the First Nations Infrastructure Investment
          Plan, your 5-year list of community priorities. No FNIIP listing, no capital funding. You build
          and update it with your Capital Management Officer.
        </p>
      </Section>

      <Section title="GCIMS — the system that tracks it all + gets you paid">
        <p>
          <Acronym>ISC</Acronym> manages funding through <strong><Acronym>GCIMS</Acronym></strong> (the
          Grants &amp; Contributions Information Management System). With access you can see your reports,
          payments, and agreement terms — and catch issues before they hold up a payment. Money is
          released on a schedule through the year, sized to the type and amount of your funding.
        </p>
      </Section>

      <Section title="Why deadlines matter">
        <p>
          This is the one to remember: <strong>overdue reports can automatically halt your funding</strong>.
          GCIMS will stop payments for a late prior-year report until it’s cleared. Staying on top of your
          PAW and DCI due dates is the single biggest thing that keeps the money flowing.
        </p>
      </Section>

      <Takeaways
        items={[
          'PAW = how you apply (has a # + due date). DCI = the report you owe back (has a # + due date).',
          'Capital + housing projects must be listed in your FNIIP to be eligible.',
          'Block / NFR Grant agreements bundle many programs into core funding — fewer separate applications.',
          'File reports on time — overdue reports can auto-halt your payments through GCIMS.',
        ]}
      />
    </>
  );
}

// ---- Module: a program area ----------------------------------------------
function AreaModule({ slug }: { slug: string }) {
  const programs = fundingByArea(slug);
  const intro = AREA_INTRO[slug];
  const deadlines = programs.flatMap((p) => [...(p.paw ?? []), ...(p.dci ?? [])]).length;
  return (
    <>
      {intro ? <p className="text-ink/80">{intro}</p> : null}
      <Takeaways
        items={[
          `${programs.length} funding program${programs.length === 1 ? '' : 's'} in this area, with ${deadlines} application + reporting deadline${deadlines === 1 ? '' : 's'} to track.`,
          'Each card below shows who’s eligible, how to apply (PAW), what you report (DCI), and who to contact.',
          'Tap “Details in the Program Guide” on any program to jump to the official source.',
        ]}
      />
      <FundingPrograms programs={programs} showIntro heading="The programs" />
      <p className="mt-6 text-sm">
        <Link href={`/programs/${slug}`} className="font-semibold text-primary hover:underline">
          See this area’s page (news + programs) →
        </Link>
      </p>
    </>
  );
}

// ---- Module: the funding calendar ----------------------------------------
function CalendarModule() {
  const all = allDeadlines();
  const apply = all.filter((d) => d.kind.startsWith('Application'));
  const report = all.filter((d) => d.kind.startsWith('Report'));
  const list = (rows: typeof all) => (
    <ul className="mt-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
      {rows.map((d, i) => (
        <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="text-ink/80">
            <span className="font-semibold text-ink">{d.program}</span> — {d.ref ? <span className="font-mono text-ink/45">{d.ref} </span> : null}
            {d.name}
          </span>
          <span className="whitespace-nowrap font-semibold text-ink/80">{d.due ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <p className="text-ink/80">
        Every deadline across all programs, split into what you <strong>apply</strong> for (
        <Acronym>PAW</Acronym>) and what you <strong>report</strong> (<Acronym>DCI</Acronym>). On the app,
        council / finance / system-admin also see these on a calendar.
      </p>
      <section className="mt-6">
        <h2 className="text-lg font-bold">Applications (PAW)</h2>
        {list(apply)}
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-bold">Reports (DCI)</h2>
        {list(report)}
      </section>
    </>
  );
}
