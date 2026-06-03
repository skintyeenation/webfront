// Pay period configuration — single source of truth for the
// timesheet feature AND the Dashboard's cut-off countdown.
//
// Why a TS catalog (not env): the same way skintyee-meeting-types.ts
// and skintyee-groups.ts work. Lives in code, code-reviewable, no
// chance of an env var drift between local / Container App. If the
// cycle changes, edit the constants below and redeploy.

// dayjs (~2KB) instead of moment (~70KB, maintenance mode). API is
// almost identical; immutable by default — `add()` / `subtract()`
// return a NEW dayjs instance instead of mutating the receiver, so
// pattern is `cutoff = anchor.add(n * L, 'day')` not `anchor.add(…)`.
import dayjs from 'dayjs';

/** A worker's pay period. Bi-weekly, anchored to a known cutoff Friday. */
export const PAY_PERIOD_CONFIG = {
  // The length of one pay period in days. 14 = bi-weekly.
  lengthDays: 14 as const,

  // A known cutoff date. Cutoffs recur every lengthDays from here.
  // Both directions — we can iterate forward (next cutoff) or backward
  // (history). MUST be a Friday.
  anchorISO: '2026-05-29',

  // How many days after the period's last day before payday lands.
  // Skin Tyee: pay the Friday after cutoff = 7 days later.
  payDaysAfterCutoff: 7 as const,

  // Anyone with weekly hours exceeding this in a single week within
  // a timesheet flags the timesheet for admin-only approval (auto-
  // approve doesn't apply when overtime is present).
  overtimeWeeklyHoursThreshold: 40 as const,

  // The first day of a work week as moment understands it (1 = Mon-
  // day, 6 = Saturday, 0 = Sunday). Used to split a 14-day period
  // into "week 1" + "week 2" for the OT check + grid rendering.
  // Skin Tyee timesheets start a workweek on Saturday so weekends can
  // be entered alongside weekdays in the same row.
  workweekStartsOnIsoDay: 6 as const,
} as const;

export interface PayPeriod {
  /** stable identifier: YYYY-MM-DD of the cutoff Friday */
  id: string;
  /** ISO date of the first day of the period (inclusive) */
  startISO: string;
  /** ISO date of the last day of the period (cutoff Friday, inclusive) */
  endISO: string;
  /** ISO date of when paycheques land */
  payDateISO: string;
  /** Human label, e.g. "May 30 – Jun 12" */
  label: string;
}

/** Build a PayPeriod for the cycle that contains `whenISO` (default today). */
export function payPeriodFor(whenISO?: string): PayPeriod {
  const anchor = dayjs(PAY_PERIOD_CONFIG.anchorISO).startOf('day');
  const when = dayjs(whenISO ?? undefined).startOf('day');
  // Find the index of the cycle that ENDS on or after `when`. Cutoff
  // days are anchor + n * lengthDays for n ∈ ℤ. ceil handles both
  // before-anchor (negative diff) and after-anchor cases.
  const daysSinceAnchor = when.diff(anchor, 'day');
  const n = Math.ceil(daysSinceAnchor / PAY_PERIOD_CONFIG.lengthDays);
  const cutoff  = anchor.add(n * PAY_PERIOD_CONFIG.lengthDays, 'day');
  const start   = cutoff.subtract(PAY_PERIOD_CONFIG.lengthDays - 1, 'day');
  const payDate = cutoff.add(PAY_PERIOD_CONFIG.payDaysAfterCutoff, 'day');
  return {
    id:         cutoff.format('YYYY-MM-DD'),
    startISO:   start.format('YYYY-MM-DD'),
    endISO:     cutoff.format('YYYY-MM-DD'),
    payDateISO: payDate.format('YYYY-MM-DD'),
    label: `${start.format('MMM D')} – ${cutoff.format('MMM D')}`,
  };
}

/** Build the previous N pay periods, most-recent first (history view). */
export function recentPayPeriods(count: number, fromISO?: string): PayPeriod[] {
  const current = payPeriodFor(fromISO);
  const anchor = dayjs(current.endISO).startOf('day');
  const out: PayPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const cutoff = anchor.subtract(i * PAY_PERIOD_CONFIG.lengthDays, 'day');
    out.push(payPeriodFor(cutoff.format('YYYY-MM-DD')));
  }
  return out;
}
