import Link from 'next/link';
import { stripHtml, type WPEntry } from '@/lib/wp';

// Parallax band featuring Major Projects (authored as WordPress posts).
// The fixed background scrolls slower than the content for the parallax effect.
export function MajorProjectsParallax({ projects }: { projects: WPEntry[] }) {
  return (
    <section className="parallax">
      <div className="parallax-inner">
        <h2 className="text-2xl font-bold text-white">Major Projects</h2>
        <p className="mt-1 text-white/80">Capital projects and community investments.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {projects.length === 0 ? (
            <p className="text-white/80">Project updates will appear here soon.</p>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/posts/${p.slug}`}
                className="block rounded-lg bg-white/95 p-4 shadow transition hover:-translate-y-0.5"
              >
                <h3 className="font-semibold text-ink" dangerouslySetInnerHTML={{ __html: p.title.rendered }} />
                <p className="mt-1 line-clamp-3 text-sm text-ink/70">{stripHtml(p.excerpt.rendered)}</p>
              </Link>
            ))
          )}
        </div>
        <Link href="/projects" className="mt-6 inline-block font-semibold text-white underline">
          All projects →
        </Link>
      </div>
    </section>
  );
}
