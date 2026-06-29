import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug, getPostSlugs, stripHtml } from '@/lib/wp';

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getPostSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  return { title: post ? stripHtml(post.title.rendered) : 'Not found' };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/news" className="text-sm font-semibold text-primary hover:underline">
        ← Back to news
      </Link>

      <header className="mt-4">
        <h1
          className="text-3xl font-bold leading-tight text-ink"
          dangerouslySetInnerHTML={{ __html: post.title.rendered }}
        />
        <time dateTime={post.date} className="mt-2 block text-sm text-ink/50">
          {fmtDate(post.date)}
        </time>
      </header>

      <div
        className="prose prose-lg mt-6 max-w-none prose-headings:text-ink prose-a:text-primary prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: post.content.rendered }}
      />
    </article>
  );
}
