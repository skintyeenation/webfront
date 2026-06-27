import Link from 'next/link';
import type { AppNotification, BandMeeting, CommunityEvent, Expenditure } from '@skintyee/models';
import { NOTIFICATION_COLORS, CAD } from '@/lib/constants';
import { House, GraduationCap, Trees, HeartHandshake, Baby, HeartPulse, type LucideIcon } from 'lucide-react';

const PROGRAM_ICONS: Record<string, LucideIcon> = {
  housing: House,
  education: GraduationCap,
  'lands-economic-development': Trees,
  social: HeartHandshake,
  'child-family-services': Baby,
  health: HeartPulse,
};

// Background imagery per program (POC) — a dark overlay keeps text legible.
// Curated, visually-verified Unsplash photos (stable); the last two are still
// topical placeholders pending art direction.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=640&h=420&fit=crop&q=70`;
const PROGRAM_IMAGES: Record<string, string> = {
  housing: U('1728344430621-f6b58ef4a108'), // modular home in a field
  education: U('1589206946274-929e4da3996b'), // Indigenous woman teaching a child
  'lands-economic-development': U('1634672652995-ee7525bce595'), // lumber mill
  social: U('1614144477821-9daf217ae100'), // family by the lake
  'child-family-services': 'https://loremflickr.com/640/420/family,children?lock=25',
  health: 'https://loremflickr.com/640/420/wellness,forest?lock=26',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export function NotificationItem({ n }: { n: AppNotification }) {
  const color = NOTIFICATION_COLORS[n.category] ?? '#90A4AE';
  return (
    <div className="flex gap-3 border-b border-[var(--line)] py-3">
      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
            {n.category}
          </span>
          <span className="text-xs text-ink/50">{fmtDate(n.createdAt)}</span>
        </div>
        <p className="font-medium text-ink">{n.title}</p>
        <p className="text-sm text-ink/70">{n.body}</p>
      </div>
    </div>
  );
}

export function EventCard({ e }: { e: CommunityEvent }) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-4">
      <div className="text-xs font-semibold text-primary">{fmtDate(e.startsAt)}</div>
      <h3 className="mt-1 font-semibold text-ink">{e.title}</h3>
      {e.location && <p className="text-sm text-ink/70">{e.location}</p>}
      {e.cancelled && <span className="text-xs font-semibold text-[#E53935]">Cancelled</span>}
    </div>
  );
}

export function MeetingItem({ m }: { m: BandMeeting }) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-4">
      <div className="text-xs font-semibold text-accent">{fmtDate(m.startsAt)}</div>
      <h3 className="mt-1 font-semibold text-ink">{m.title}</h3>
      {m.location && <p className="text-sm text-ink/70">{m.location}</p>}
    </div>
  );
}

// A band-management / governance roster card.
export function RoleCard({ m }: { m: { _id: string; name: string; role?: string; title?: string; avatarLetter?: string } }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--line)] p-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
        {m.avatarLetter ?? m.name?.[0] ?? '?'}
      </span>
      <div>
        <p className="font-semibold text-ink">{m.name}</p>
        <p className="text-sm text-ink/70">{m.title ?? m.role}</p>
        {m.role && <span className="text-xs font-semibold uppercase tracking-wide text-accent">{m.role}</span>}
      </div>
    </div>
  );
}

// A funding / transparency expenditure card with a budget-vs-spent bar.
export function ExpenditureCard({ x }: { x: Expenditure }) {
  const pct = x.budget > 0 ? Math.min(100, Math.round((x.spent / x.budget) * 100)) : 0;
  return (
    <div className="rounded-lg border border-[var(--line)] p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-ink">{x.area}</h3>
        <span className="text-xs text-ink/50">{x.fiscalYear}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded bg-[var(--line)]">
        <div className="h-full rounded bg-success" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-ink/70">
        {CAD(x.spent)} spent of {CAD(x.budget)} ({pct}%)
      </p>
      {x.breakdown?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-ink/60">
          {x.breakdown.map((b, i) => (
            <li key={i} className="flex justify-between">
              <span>{b.label}</span>
              <span>{CAD(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgramCard({ p }: { p: { slug: string; name: string; desc: string } }) {
  const Icon = PROGRAM_ICONS[p.slug] ?? House;
  const img = PROGRAM_IMAGES[p.slug];
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="program-card"
      style={
        img
          ? {
              backgroundImage: `linear-gradient(160deg, rgba(18,22,26,0.55) 0%, rgba(18,22,26,0.9) 100%), url(${img})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <Icon size={28} strokeWidth={1.75} />
      <h3 className="mt-3 text-lg font-semibold">{p.name}</h3>
      <p className="mt-1 text-sm text-white/80">{p.desc}</p>
    </Link>
  );
}

// A WordPress post teaser (used by Projects + Program category pages).
export function PostTeaser({ p, basePath = '/posts', image }: { p: { id: number; slug: string; title: { rendered: string }; excerpt: { rendered: string } }; basePath?: string; image?: string }) {
  return (
    <Link href={`${basePath}/${p.slug}`} className="flex gap-3 rounded-lg border border-[var(--line)] p-4 transition hover:border-primary">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0">
        <h3 className="font-semibold text-ink" dangerouslySetInnerHTML={{ __html: p.title.rendered }} />
        <div className="mt-1 text-sm text-ink/70" dangerouslySetInnerHTML={{ __html: p.excerpt.rendered }} />
      </div>
    </Link>
  );
}
