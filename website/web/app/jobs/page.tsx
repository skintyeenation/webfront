import type { Metadata } from 'next';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Jobs' };

// Jobs portal — postings authored as WordPress posts (category 'jobs').
export default async function JobsPage() {
  const posts = await getPostsByCategory('jobs', 50);
  return (
    <>
      <h1 className="text-2xl font-bold">Jobs</h1>
      <p className="mt-1 text-ink/70">Employment and contract opportunities with Skin Tyee First Nation.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">No open postings right now — check back soon.</p>
        )}
      </div>
    </>
  );
}
