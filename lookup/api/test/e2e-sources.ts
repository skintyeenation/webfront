/**
 * End-to-end smoke test for every catalogued source.
 *
 * For each source we pick a query that is *known* to return results, run the
 * scraper (or build the link-only search URL), and assert:
 *   - scrapable sources: items.length > 0
 *   - link-only sources: searchUrl is a valid http(s) URL
 *
 * Run:
 *   pnpm --filter @skintyee/lookup-api test:e2e
 */

import { ALL_SOURCES } from '../src/sources/index.js';
import type { ScrapeResult, Source } from '../src/types.js';
import { closeBrowser } from '../src/util/puppet.js';

// Known-good queries — chosen because we've verified live that they return >0
// items at one point during development. If a scraper regresses, this test
// surfaces it.
const QUERIES: Record<string, string> = {
  'orgbook-bc': 'Birdco',
  mras: 'Two Worlds Consulting',
  website: 'Birdco Industrial Resources Ltd', // needs --website
  'bc-indigenous-listings': 'consulting',
  // "Cambium" hits one real IBD entry (Cambium Indigenous Professional
  // Services); "Birdco" is genuinely not in IBD.
  'isc-ibd': 'Cambium',
  ccab: 'consulting',
  'fn-fma': 'Tsleil',
  // Money mode
  'open-canada-contracts': 'First Nation',
  'open-canada-grants': 'First Nation',
  'open-canada-ckan': 'Indigenous',
  'bc-open-data-ckan': 'Indigenous',
  merx: 'First Nation',
};

// Link-only — these should at least produce a clickable URL.
// Some require a name + provided extra context (website, etc.).

interface Result {
  id: string;
  name: string;
  scrapable: boolean;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  durationMs: number;
}

async function runOne(s: Source): Promise<Result> {
  const start = Date.now();
  const q = QUERIES[s.id] ?? 'Indigenous';
  const opts = {
    indigenousOnly: false,
    website: s.id === 'website' ? 'https://birdcoirl.ca' : undefined,
  };
  try {
    if (s.scrape) {
      const res: ScrapeResult = await s.scrape(q, opts);
      const ok = res.items.length > 0;
      return {
        id: s.id,
        name: s.name,
        scrapable: true,
        status: ok ? 'pass' : 'fail',
        detail: ok
          ? `${res.items.length} items · first: ${res.items[0].title.slice(0, 60)}`
          : 'returned 0 items',
        durationMs: Date.now() - start,
      };
    }
    const url = s.searchUrl(q, opts);
    const okUrl = /^https?:\/\//.test(url);
    return {
      id: s.id,
      name: s.name,
      scrapable: false,
      status: okUrl ? 'pass' : 'fail',
      detail: okUrl ? `link → ${url.slice(0, 80)}` : `bad URL: ${url}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: s.id,
      name: s.name,
      scrapable: !!s.scrape,
      status: 'fail',
      detail: `error: ${(err as Error).message}`,
      durationMs: Date.now() - start,
    };
  }
}

function pad(s: string, n: number) { return s + ' '.repeat(Math.max(0, n - s.length)); }
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main(): Promise<void> {
  console.log(`\nE2E smoke — ${ALL_SOURCES.length} sources\n`);
  const results: Result[] = [];
  for (const s of ALL_SOURCES) {
    process.stdout.write(`  … ${pad(s.id, 28)} ${D('(' + (s.scrape ? 'scrape' : 'link') + ')')}`);
    const r = await runOne(s);
    results.push(r);
    const icon = r.status === 'pass' ? G('✔') : r.status === 'fail' ? R('✖') : Y('-');
    process.stdout.write(`\r  ${icon} ${pad(s.id, 28)} ${pad(`${r.durationMs}ms`, 8)} ${D(r.detail.slice(0, 100))}\n`);
  }

  console.log('');
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const scrapeFails = results.filter((r) => r.scrapable && r.status === 'fail');
  console.log(`Summary: ${G(pass + ' pass')} · ${fail ? R(fail + ' fail') : '0 fail'} / ${ALL_SOURCES.length} total`);
  if (scrapeFails.length) {
    console.log('\n' + Y('Scrapers that returned 0:'));
    for (const r of scrapeFails) console.log(`  - ${r.name} (${r.id}): ${r.detail}`);
  }

  await closeBrowser();
  process.exit(scrapeFails.length ? 1 : 0);
}

void main();
