import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPageBySlug, getPageSlugs, stripHtml } from '@/lib/wp';

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getPageSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

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
