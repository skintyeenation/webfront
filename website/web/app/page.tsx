import Link from 'next/link';
import { getPosts } from '@/lib/wp';

export const revalidate = 60;

export default async function Home() {
  const posts = await getPosts();

  return (
    <>
      <h1>Latest news</h1>
      {posts.length === 0 ? (
        <p className="excerpt">No posts yet. Add one in WordPress and it shows up here.</p>
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.slug}`} dangerouslySetInnerHTML={{ __html: p.title.rendered }} />
              <div className="excerpt" dangerouslySetInnerHTML={{ __html: p.excerpt.rendered }} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
