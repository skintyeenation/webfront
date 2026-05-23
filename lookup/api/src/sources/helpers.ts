/**
 * Source helpers: Indigenous keyword OR, query-string building, …
 */

export const INDIGENOUS_KEYWORDS = ['Indigenous', 'First Nation', 'Métis', 'Inuit', 'Aboriginal'];

export function indigenousOrQuery(q: string): string {
  // For sources that only support keyword filtering we OR in Indigenous terms.
  const terms = INDIGENOUS_KEYWORDS.map((t) => `"${t}"`).join(' OR ');
  return q.trim() ? `(${q.trim()}) AND (${terms})` : terms;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
