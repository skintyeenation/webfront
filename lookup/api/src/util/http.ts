/**
 * Polite HTTP helpers. Native `fetch` with a sensible User-Agent, a per-host
 * minimum interval (default 1 req/s/host), one retry on 429/5xx with backoff.
 */

// Some federal sites (search.open.canada.ca) reject UAs that don't start with
// Mozilla/, or that embed a contact URL in the parens. Keep an identifier
// inside so server logs can still attribute the traffic to us, but no URL.
const UA = 'Mozilla/5.0 (compatible; skintyee-lookup/0.1)';
const MIN_INTERVAL_MS = 1000;

const lastHit = new Map<string, number>();

async function pace(url: string): Promise<void> {
  const host = new URL(url).host;
  const now = Date.now();
  const last = lastHit.get(host) ?? 0;
  const wait = MIN_INTERVAL_MS - (now - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export interface FetchOptions {
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  signal?: AbortSignal;
  /** Treat as JSON & parse on success. */
  json?: boolean;
  /** Max attempts (default 2 — initial + 1 retry). */
  attempts?: number;
}

export async function getText(url: string, opts: FetchOptions = {}): Promise<string> {
  const attempts = opts.attempts ?? 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await pace(url);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...(opts.headers ?? {}) },
        body: opts.body,
        signal: opts.signal,
        redirect: 'follow',
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      // Some WET-based federal portals (search.open.canada.ca) return 400 with
      // the actual page body when our request shape is technically off — but
      // the body is still the search results. Accept any 2xx/4xx with a body
      // and let the scraper decide. Only the 5xx/429 paths throw above.
      const body = await res.text();
      if (!res.ok && body.length < 200) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

export async function getJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const body = await getText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers ?? {}) } });
  return JSON.parse(body) as T;
}

export { UA };
