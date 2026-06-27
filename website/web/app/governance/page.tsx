import type { Metadata } from 'next';
import { publicApi, safe } from '@/lib/api';
import { RoleCard } from '@/components/cards';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Governance' };

// Band management & roles — Chief & Council + management. The api/ returns only
// the curated public governance roster at the `public` role (no sensitive data).
export default async function GovernancePage() {
  const roster = await safe(publicApi.directory.list(), []);
  return (
    <>
      <h1 className="text-2xl font-bold">Band Management &amp; Governance</h1>
      <p className="mt-1 text-ink/70">Chief &amp; Council and band management.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {roster.length ? (
          roster.map((m: any) => <RoleCard key={m._id} m={m} />)
        ) : (
          <p className="text-ink/60">Roster coming soon.</p>
        )}
      </div>
    </>
  );
}
