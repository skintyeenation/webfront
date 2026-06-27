import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { getPostsByCategory } from '@/lib/wp';

// Careers CTA — shows the number of open positions and links to /jobs. Greyed
// out (disabled) when there are no available positions.
export async function JobsCta() {
  const jobs = await getPostsByCategory('jobs', 50);
  const n = jobs.length;
  const has = n > 0;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[#f2f7f8] p-8 text-center">
      <h2 className="text-xl font-bold text-ink">Work with Skin Tyee</h2>
      <p className="mt-1 text-ink/70">
        {has
          ? `We have ${n} available position${n === 1 ? '' : 's'} — join our team.`
          : 'There are no available positions right now. Please check back soon.'}
      </p>
      <div className="mt-5">
        {has ? (
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            <Briefcase size={18} aria-hidden="true" /> Apply for jobs
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-sm">{n} open</span>
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="No positions available right now"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-[var(--line)] px-6 py-3 font-semibold text-ink/40"
          >
            <Briefcase size={18} aria-hidden="true" /> Apply for jobs
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-sm">None open</span>
          </span>
        )}
      </div>
    </section>
  );
}
