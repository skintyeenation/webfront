'use client';
import { useEffect, useState } from 'react';
import { expandAcronym, type DeadlineRow } from '@skintyee/models';

// Funding deadline calendar with two views: a real month grid (PAW/DCI deadlines plotted
// on day cells, prev/next month nav) and the flat list/table. ISC deadlines recur on a
// fixed month+day without a year, so the grid lays them out on the current calendar year
// for weekday alignment; items with no parseable date (Ongoing / Monthly / rolling) are
// listed separately.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ABBR_IDX: Record<string, number> = Object.fromEntries(ABBR.map((m, i) => [m.toLowerCase(), i]));
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Hit = { month: number; day: number; row: DeadlineRow };

function partition(rows: DeadlineRow[]) {
  const dated: Hit[] = [];
  const rolling: DeadlineRow[] = [];
  for (const row of rows) {
    const matches = [
      ...(row.due || '').matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/gi),
    ];
    if (!matches.length) rolling.push(row);
    else for (const m of matches) dated.push({ month: ABBR_IDX[m[1].toLowerCase()], day: +m[2], row });
  }
  return { dated, rolling };
}

const isPaw = (r: DeadlineRow) => r.kind.startsWith('Application');

export function FundingCalendar({
  deadlines,
  areas = [],
}: {
  deadlines: DeadlineRow[];
  areas?: { slug: string; name: string }[];
}) {
  const now = new Date();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(now.getMonth());
  const [areaFilter, setAreaFilter] = useState<string[]>([]);
  const year = now.getFullYear();

  const toggleArea = (slug: string) =>
    setAreaFilter((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  const filtered = areaFilter.length ? deadlines.filter((d) => areaFilter.includes(d.area)) : deadlines;
  const { dated, rolling } = partition(filtered);

  // Click a deadline in the calendar → jump to its row in the list view and flag it.
  const [highlight, setHighlight] = useState<number | null>(null);
  const showInList = (row: DeadlineRow) => {
    setHighlight(filtered.indexOf(row));
    setView('list');
  };
  useEffect(() => {
    if (view === 'list' && highlight != null) {
      document.getElementById(`dl-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [view, highlight]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthHits = dated.filter((h) => h.month === month).sort((a, b) => a.day - b.day);

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Funding calendar</h2>
          <p className="mt-1 text-sm text-ink/60">
            Application (PAW) and reporting (DCI) deadlines across all programs.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5 text-sm">
          {(['calendar', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 font-semibold capitalize transition ${
                view === v ? 'bg-primary text-white' : 'text-ink/60 hover:text-primary'
              }`}
            >
              {v} view
            </button>
          ))}
        </div>
      </div>

      {areas.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Filter</span>
          <button
            onClick={() => setAreaFilter([])}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              areaFilter.length === 0
                ? 'border-primary bg-primary text-white'
                : 'border-[var(--line)] text-ink/60 hover:border-primary/50'
            }`}
          >
            All areas
          </button>
          {areas.map((a) => {
            const on = areaFilter.includes(a.slug);
            return (
              <button
                key={a.slug}
                onClick={() => toggleArea(a.slug)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  on
                    ? 'border-primary bg-primary text-white'
                    : 'border-[var(--line)] text-ink/60 hover:border-primary/50'
                }`}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      )}

      {view === 'calendar' ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonth((m) => (m + 11) % 12)}
              className="rounded-md px-3 py-1 text-lg text-ink/60 hover:text-primary"
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="font-bold text-ink">
              {MONTHS[month]} <span className="text-ink/40">{year}</span>
            </div>
            <button
              onClick={() => setMonth((m) => (m + 1) % 12)}
              className="rounded-md px-3 py-1 text-lg text-ink/60 hover:text-primary"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="mt-2 flex gap-4 text-xs text-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Apply (PAW)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Report (DCI)
            </span>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
            {WEEK.map((w) => (
              <div
                key={w}
                className="bg-[#f2f7f8] px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-ink/50"
              >
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              const hits = day ? dated.filter((h) => h.month === month && h.day === day) : [];
              return (
                <div key={i} className={`min-h-[64px] p-1.5 ${day ? 'bg-white' : 'bg-[#fafbfb]'}`}>
                  {day && <div className="text-right text-[11px] font-semibold text-ink/40">{day}</div>}
                  <div className="mt-0.5 space-y-0.5">
                    {hits.map((h, j) => (
                      <button
                        key={j}
                        onClick={() => showInList(h.row)}
                        title={`${h.row.program}: ${h.row.name} (${h.row.kind}) — click for details`}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold text-white transition hover:opacity-80 ${
                          isPaw(h.row) ? 'bg-primary' : 'bg-accent'
                        }`}
                      >
                        {h.row.program}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            {monthHits.length ? (
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] text-sm">
                {monthHits.map((h, i) => (
                  <li key={i}>
                    <button
                      onClick={() => showInList(h.row)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-[#f2f7f8]"
                    >
                      <span className="w-12 shrink-0 font-bold text-ink">
                        {ABBR[month]} {h.day}
                      </span>
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isPaw(h.row) ? 'bg-primary' : 'bg-accent'}`}
                      />
                      <span>
                        <span className="font-semibold text-ink">{h.row.program}</span>{' '}
                        <span className="text-ink/60">— {h.row.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-[var(--line)] px-3 py-4 text-center text-sm text-ink/50">
                No fixed deadlines in {MONTHS[month]}.
              </p>
            )}
          </div>

          {rolling.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/50">Rolling / no fixed date</p>
              <ul className="mt-1 space-y-1 text-sm text-ink/70">
                {rolling.map((r, i) => (
                  <li key={i}>
                    <span className="font-semibold text-ink">{r.program}</span> — {r.name}{' '}
                    <span className="text-ink/45">({r.due})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f2f7f8] text-left text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-3 py-2 font-bold">Program</th>
                <th className="px-3 py-2 font-bold">Type</th>
                <th className="px-3 py-2 font-bold">Item</th>
                <th className="px-3 py-2 font-bold">Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const full = expandAcronym(d.program);
                return (
                <tr
                  key={i}
                  id={`dl-${i}`}
                  className={`border-t border-[var(--line)] transition-colors ${
                    highlight === i ? 'bg-primary/10' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    {full ? (
                      <>
                        <span className="font-semibold text-ink">{full}</span>{' '}
                        <span className="whitespace-nowrap font-mono text-xs text-ink/45">({d.program})</span>
                      </>
                    ) : (
                      <span className="font-semibold text-ink">{d.program}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink/60">{d.kind}</td>
                  <td className="px-3 py-2 text-ink/75">
                    {d.ref && <span className="font-mono text-ink/45">{d.ref} </span>}
                    {d.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink/80">{d.due ?? '—'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
