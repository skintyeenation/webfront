import type { Metadata } from 'next';
import { publicApi, safe } from '@/lib/api';
import { ExpenditureCard } from '@/components/cards';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Funding' };

// Funding & transparency — band expenditures by program area (public).
export default async function FundingPage() {
  const expenditures = await safe(publicApi.transparency.expenditures(), []);
  return (
    <>
      <h1 className="text-2xl font-bold">Funding &amp; Transparency</h1>
      <p className="mt-1 text-ink/70">Band expenditures by program area.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {expenditures.length ? (
          expenditures.map((x) => <ExpenditureCard key={x._id} x={x} />)
        ) : (
          <p className="text-ink/60">Financial reports coming soon.</p>
        )}
      </div>
    </>
  );
}
