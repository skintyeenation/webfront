import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPageBySlug, stripHtml } from '@/lib/wp';

// On-demand ISR (no generateStaticParams) — the root layout reads the session (headers),
// which conflicts with static prerendering. See app/posts/[slug]/page.tsx.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getPageBySlug(params.slug);
  return { title: page ? stripHtml(page.title.rendered) : 'Not found' };
}

export default async function WpPage({ params }: { params: { slug: string } }) {
  const page = await getPageBySlug(params.slug);
  if (!page) notFound();

  return (
    <article>
      <h1 dangerouslySetInnerHTML={{ __html: page.title.rendered }} />
      <div dangerouslySetInnerHTML={{ __html: page.content.rendered }} />
    </article>
  );
}
