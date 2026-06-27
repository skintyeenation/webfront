import type { Metadata } from 'next';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';

export const revalidate = 60;
export const metadata: Metadata = { title: 'News' };

// News master page — posts authored under the WordPress 'news' category.
export default async function NewsPage() {
  const posts = await getPostsByCategory('news', 50);
  return (
    <>
      <h1 className="text-2xl font-bold">News</h1>
      <p className="mt-1 text-ink/70">Latest news and announcements from the Nation.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">News will be posted here.</p>
        )}
      </div>
    </>
  );
}
