import type { Metadata } from 'next';
import { publicApi, safe } from '@/lib/api';
import { RoleCard } from '@/components/cards';
import { GovernanceOrgChart } from '@/components/GovernanceOrgChart';
import { JobsCta } from '@/components/JobsCta';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Governance' };

// Band management & roles — Chief & Council + management. The api/ returns only
// the curated public governance roster at the `public` role (no sensitive data).
export default async function GovernancePage() {
  const roster = await safe(publicApi.directory.list(), []);
  const chief = roster.find(
    (m: any) =>
      [m.role, m.title].some((v: any) => typeof v === 'string' && /chief/i.test(v)) ||
      (Array.isArray(m.bandGroups) && m.bandGroups.includes('chief')),
  );
  const chiefName = chief?.name ?? 'Chief of Skin Tyee Nation';
  const chiefInitial = String(chief?.avatarLetter ?? chiefName[0] ?? 'C').toUpperCase();

  return (
    <>
      <h1 className="text-2xl font-bold">Band Management &amp; Governance</h1>
      <p className="mt-1 text-ink/70">Chief &amp; Council and band management.</p>

      {/* Greetings from the Chief */}
      <section className="mt-6 grid gap-6 rounded-2xl border border-[var(--line)] bg-[#f2f7f8] p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        {chief?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chief.photoUrl} alt={chiefName} className="h-40 w-40 rounded-xl object-cover" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-xl bg-gradient-to-br from-[#00343f] to-[#014e5e] text-5xl font-bold text-white">
            {chiefInitial}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold">Greetings from the Chief</h2>
          <div className="mt-3 space-y-3 text-ink/75">
            <p>
              On behalf of Council and our entire community, I am honoured to welcome you to Skin Tyee
              Nation. As a proud Wet&apos;suwet&apos;en people on the shores of Francois Lake, we carry
              forward the teachings of our ancestors while building a strong future for the generations to
              come.
            </p>
            <p>
              Whether you are a member, a partner, or a visitor, we are glad you are here. Thank you for
              taking the time to learn about our Nation.
            </p>
          </div>
          <p className="mt-4 font-semibold text-ink">{chiefName}</p>
          <p className="text-sm text-ink/60">Chief, Skin Tyee Nation</p>
        </div>
      </section>

      <h2 className="mt-10 text-xl font-bold">Leadership structure</h2>
      <div className="mt-4">
        <GovernanceOrgChart roster={roster} />
      </div>

      <h2 className="mt-10 text-xl font-bold">Chief, Council &amp; Management</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {roster.length ? (
          roster.map((m: any) => <RoleCard key={m._id} m={m} />)
        ) : (
          <p className="text-ink/60">Roster coming soon.</p>
        )}
      </div>

      <div className="mt-10">
        <JobsCta />
      </div>
    </>
  );
}
