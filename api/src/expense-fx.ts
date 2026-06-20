// Expense currency conversion. The claim/period/report totals are expressed in
// the BASE currency (CAD); individual receipts may be entered in a supported
// foreign currency and are converted to CAD for any total.
//
// POC: a fixed FX table (no live rate feed). Update FX_TO_CAD when rates move,
// or wire a rate provider later. Supported currencies are CAD + USD for now.

export const BASE_CURRENCY = 'CAD';
export const SUPPORTED_CURRENCIES = ['CAD', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// 1 unit of <currency> = N CAD. Set via env (no live feed for now); the default
// is a deliberate HIGHBALL so foreign receipts are never under-reimbursed.
//   USD_TO_CAD   (default 1.45)
const USD_TO_CAD = Number(process.env.USD_TO_CAD) > 0 ? Number(process.env.USD_TO_CAD) : 1.45;

export const FX_TO_CAD: Record<string, number> = {
  CAD: 1,
  USD: USD_TO_CAD,
};

/** Normalise an arbitrary/AI currency string to a supported one (default CAD). */
export function normalizeCurrency(c?: string | null): SupportedCurrency {
  const up = (c ?? '').toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(up) ? (up as SupportedCurrency) : 'CAD';
}

/** Convert an amount in `currency` to CAD (rounded to cents). */
export function toCad(amount: number, currency?: string | null): number {
  const rate = FX_TO_CAD[normalizeCurrency(currency)] ?? 1;
  return Math.round((Number(amount) || 0) * rate * 100) / 100;
}
