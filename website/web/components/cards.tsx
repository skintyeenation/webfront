import Link from 'next/link';
import type { AppNotification, BandMeeting, CommunityEvent, Expenditure } from '@skintyee/models';
import { NOTIFICATION_COLORS, CAD } from '@/lib/constants';

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
  return (
    <Link href={`/programs/${p.slug}`} className="block rounded-lg border border-[var(--line)] p-5 transition hover:border-primary">
      <h3 className="font-semibold text-ink">{p.name}</h3>
      <p className="mt-1 text-sm text-ink/70">{p.desc}</p>
    </Link>
  );
}

// A WordPress post teaser (used by Projects + Program category pages).
export function PostTeaser({ p, basePath = '/posts' }: { p: { id: number; slug: string; title: { rendered: string }; excerpt: { rendered: string } }; basePath?: string }) {
  return (
    <Link href={`${basePath}/${p.slug}`} className="block rounded-lg border border-[var(--line)] p-4 transition hover:border-primary">
      <h3 className="font-semibold text-ink" dangerouslySetInnerHTML={{ __html: p.title.rendered }} />
      <div className="mt-1 text-sm text-ink/70" dangerouslySetInnerHTML={{ __html: p.excerpt.rendered }} />
    </Link>
  );
}
