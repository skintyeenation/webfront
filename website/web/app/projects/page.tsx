import type { Metadata } from 'next';
import { getPostsByCategory } from '@/lib/wp';
import { PostTeaser } from '@/components/cards';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Major Projects' };

// Master page — Major Projects are authored as WordPress posts (category
// 'major-projects'); each links to its post.
export default async function ProjectsPage() {
  const posts = await getPostsByCategory('major-projects', 50);
  return (
    <>
      <h1 className="text-2xl font-bold">Major Projects</h1>
      <p className="mt-1 max-w-2xl text-ink/70">
        Capital projects and community investments across our territory — spanning oil &amp; gas
        (primarily natural gas), minerals &amp; mining, housing &amp; economic development, and forestry
        &amp; conservation.
      </p>
      <h2 className="mt-8 text-xl font-bold">Active Projects</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">Active project updates will be posted here.</p>
        )}
      </div>
    </>
  );
}
