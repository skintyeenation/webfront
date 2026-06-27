'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Flame, Pickaxe, Building2, Trees, RadioTower, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

// Parallax band featuring the nation's major project SECTORS as a three-up
// scroller — swipe on mobile, arrows on desktop. Individual active projects
// (e.g. Water System Upgrade) live on /projects. Photos are topical placeholders.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&q=70`;
const SECTORS: { name: string; blurb: string; image: string; Icon: LucideIcon }[] = [
  { name: 'Oil & Gas', blurb: 'Primarily natural gas — development and revenue-sharing across our territory.', image: U('1559510981-10719ce4266a'), Icon: Flame },
  { name: 'Minerals & Mining', blurb: 'Responsible mineral exploration and mining partnerships.', image: U('1637254019271-1efb74a1009a'), Icon: Pickaxe },
  { name: 'Housing & Economic Development', blurb: 'Homes, infrastructure, and band-owned enterprise.', image: U('1712924833046-1c54abac2840'), Icon: Building2 },
  { name: 'Forestry & Conservation', blurb: 'Stewardship of our lands and waters — including the salmon runs.', image: U('1616459943793-f4fca51b6647'), Icon: Trees },
  { name: 'Telecommunications', blurb: 'Connectivity and broadband infrastructure for the community.', image: U('1744679596626-1699b156942f'), Icon: RadioTower },
];

export function MajorProjectsParallax() {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: number) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <section className="parallax">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Major Projects</h2>
            <p className="mt-1 text-white/80">Capital projects and community investments across our territory.</p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button type="button" onClick={() => nudge(-1)} aria-label="Previous" className="rounded-full bg-white/90 p-2 text-ink transition hover:bg-white">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => nudge(1)} aria-label="Next" className="rounded-full bg-white/90 p-2 text-ink transition hover:bg-white">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTORS.map((s) => (
            <div
              key={s.name}
              className="w-[82%] shrink-0 snap-start overflow-hidden rounded-xl bg-white shadow sm:w-[calc((100%-2.5rem)/3)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image}
                alt={s.name}
                width={600}
                height={400}
                loading="lazy"
                className="h-40 w-full object-cover"
              />
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <s.Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
                  <h3 className="font-semibold text-ink">{s.name}</h3>
                </div>
                <p className="mt-1 text-sm text-ink/60">{s.blurb}</p>
              </div>
            </div>
          ))}
        </div>

        <Link href="/projects" className="mt-6 inline-block font-semibold text-white underline">
          All projects →
        </Link>
      </div>
    </section>
  );
}
