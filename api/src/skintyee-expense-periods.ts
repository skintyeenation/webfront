// Expense reporting periods — same bi-weekly cutoff MECHANISM as the timesheet
// pay periods (skintyee-pay-periods.ts), but **independently configurable**:
// expenses have their own config so finance can run them on a different cycle
// (e.g. monthly) without touching payroll. Edit EXPENSE_PERIOD_CONFIG and
// redeploy. Kept as a TS catalog (code-reviewed, no env drift) like the rest.
import dayjs from 'dayjs';

/** Independent from PAY_PERIOD_CONFIG — change these freely for expenses only. */
export const EXPENSE_PERIOD_CONFIG = {
  // Length of one expense period in days. 14 = bi-weekly (default); set to e.g.
  // 28 or 30 for a roughly-monthly cycle.
  lengthDays: 14 as const,
  // A known cutoff date; periods recur every lengthDays from here (both ways).
  anchorISO: '2026-05-29',
  // Days after cutoff before reimbursement is expected to land.
  reimburseDaysAfterCutoff: 7 as const,
} as const;

export interface ExpensePeriod {
  /** stable id: YYYY-MM-DD of the cutoff day */
  id: string;
  startISO: string;
  endISO: string;
  /** ISO date reimbursement is expected to land */
  payDateISO: string;
  /** Human label, e.g. "May 30 – Jun 12" */
  label: string;
}

/** Build the expense period that contains `whenISO` (default today). */
export function expensePeriodFor(whenISO?: string): ExpensePeriod {
  const cfg = EXPENSE_PERIOD_CONFIG;
  const anchor = dayjs(cfg.anchorISO).startOf('day');
  const when = dayjs(whenISO ?? undefined).startOf('day');
  const daysSinceAnchor = when.diff(anchor, 'day');
  const n = Math.ceil(daysSinceAnchor / cfg.lengthDays);
  const cutoff = anchor.add(n * cfg.lengthDays, 'day');
  const start = cutoff.subtract(cfg.lengthDays - 1, 'day');
  const payDate = cutoff.add(cfg.reimburseDaysAfterCutoff, 'day');
  return {
    id: cutoff.format('YYYY-MM-DD'),
    startISO: start.format('YYYY-MM-DD'),
    endISO: cutoff.format('YYYY-MM-DD'),
    payDateISO: payDate.format('YYYY-MM-DD'),
    label: `${start.format('MMM D')} – ${cutoff.format('MMM D')}`,
  };
}

/** Build the previous N expense periods, most-recent first (history view). */
export function recentExpensePeriods(count: number, fromISO?: string): ExpensePeriod[] {
  const current = expensePeriodFor(fromISO);
  const anchor = dayjs(current.endISO).startOf('day');
  const out: ExpensePeriod[] = [];
  for (let i = 0; i < count; i++) {
    const cutoff = anchor.subtract(i * EXPENSE_PERIOD_CONFIG.lengthDays, 'day');
    out.push(expensePeriodFor(cutoff.format('YYYY-MM-DD')));
  }
  return out;
}
