import type { Metadata } from 'next';
import Link from 'next/link';
import { PROGRAM_GUIDE } from '@/lib/constants';
import { LEARN_MODULES } from '@/lib/funding-learn';

export const metadata: Metadata = { title: 'Funding 101' };

// Friendly landing for the "Funding 101" training course — the plain-language
// version of the 189-page ISC Program Guide.
export default function FundingLearnPage() {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Funding 101</p>
      <h1 className="mt-1 text-2xl font-bold">A plain-language guide to band funding</h1>
      <p className="mt-2 max-w-2xl text-ink/70">
        The federal Program Guide is 189 pages. This is the short, friendly version — what funding
        the Nation can get, how to apply, and what you have to report. Start with the basics, then
        jump to the area you need.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LEARN_MODULES.map((m, i) => (
          <Link
            key={m.slug}
            href={`/funding/learn/${m.slug}`}
            className="group rounded-xl border border-[var(--line)] p-5 transition hover:border-primary hover:bg-[#f2f7f8]"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-ink/40">
              {m.slug === 'funding-101' ? 'Start here' : m.slug === 'calendar' ? 'Reference' : `Module ${i}`}
            </span>
            <p className="mt-1 font-bold text-ink group-hover:text-primary">{m.title}</p>
            <p className="mt-1 text-sm text-ink/65">{m.blurb}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/funding" className="font-semibold text-primary hover:underline">
          ← Back to Funding
        </Link>
        <a
          href={PROGRAM_GUIDE.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary hover:underline"
        >
          Read the full Program Guide (PDF) →
        </a>
      </div>
    </>
  );
}
