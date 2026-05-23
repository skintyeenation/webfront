/**
 * ISC Indigenous Business Directory — federal Indigenous-owned-business
 * registry. The site is ASP.NET-style with server session state, so we drive
 * it with puppeteer:
 *
 *   1) GET /REA-IBD/eng/reset      (seeds the session + lands on the form)
 *   2) type into #companyName
 *   3) click form#frm1 button[name="action:Search"]
 *   4) parse the /results page once results have loaded
 *
 * Inherently Indigenous-only.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { withPage } from '../../util/puppet.js';

const SEARCH_PAGE = 'https://www.sac-isc.gc.ca/REA-IBD/eng/search';

const buildHumanUrl = (q: string): string =>
  `${SEARCH_PAGE}?companyName=${encodeURIComponent(q)}`;

export const iscIbd: Source = {
  id: 'isc-ibd',
  name: 'ISC Indigenous Business Directory',
  mode: 'business',
  format: 'html-search',
  category: 'Indigenous-only directories',
  homepage: 'https://www.sac-isc.gc.ca/rea-ibd',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Federal directory of ≥51%-Indigenous-owned businesses (puppeteer-driven session-form scrape).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const items = await withPage(async (page) => {
        // /reset seeds the session and renders the search form.
        await page.goto('https://www.sac-isc.gc.ca/REA-IBD/eng/reset', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#companyName', { timeout: 15000 });
        await page.type('#companyName', q);
        // Click the actual Search button inside form#frm1 — using form.submit()
        // hits a Canada.ca-wide form that also lives on the page.
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
          page.click('form#frm1 button[name="action:Search"]'),
        ]);
        // Settle for any lazy-loaded result blocks.
        await new Promise((r) => setTimeout(r, 1500));
        return page.evaluate(() => {
          const rows: Array<{ title: string; subtitle?: string; url?: string; snippet?: string }> = [];
          // Each business hit is a section containing an <a> to /eng/profile?id=…
          document.querySelectorAll('a[href*="/eng/profile?id="]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const title = (link.textContent || '').trim();
            if (!title) return;
            const card = link.closest('article, .panel, .row, li, div') as HTMLElement | null;
            const ctx = (card?.textContent || '').replace(/\s+/g, ' ').trim();
            rows.push({
              title,
              url: new URL(link.getAttribute('href') || '', location.origin).toString(),
              snippet: ctx.slice(0, 320) || undefined,
            });
          });
          // Failure indicators on the page → "No results found" / "0 results".
          if (rows.length === 0) {
            const banner = document.querySelector('.alert, .info, .alert-info, h2')?.textContent || '';
            if (/no result|0\s+result/i.test(banner)) return [];
          }
          return rows.slice(0, 25);
        });
      });
      const sourceItems: SourceItem[] = items.map((it) => ({ title: it.title, url: it.url, snippet: it.snippet }));
      return {
        items: sourceItems,
        searchUrl: buildHumanUrl(q),
        notes: items.length === 0 ? ['ISC IBD returned no profile links for this query.'] : undefined,
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(q),
        warnings: [`ISC IBD scrape failed: ${(err as Error).message}. Use the search link.`],
      };
    }
  },
};
