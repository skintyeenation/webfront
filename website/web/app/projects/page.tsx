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
      <p className="mt-1 text-ink/70">Capital projects and community investments.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length ? (
          posts.map((p) => <PostTeaser key={p.id} p={p} />)
        ) : (
          <p className="text-ink/60">Project updates will be posted here.</p>
        )}
      </div>
    </>
  );
}
