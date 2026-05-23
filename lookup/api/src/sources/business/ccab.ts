/**
 * CCAB (Canadian Council for Aboriginal Business) Certified Aboriginal
 * Business directory. Rebranded to ccib.ca; the old /cab-directory/ route
 * 404s. The current directory lives at /main/member/ with query params.
 * `qccabprogram=797` filters to the CAB (Certified Aboriginal Business)
 * program specifically.
 *
 * Individual members are at /main/member/<slug>/ (e.g. /takoda-consulting/).
 * Drive with puppeteer because the listing is rendered through a JS-driven
 * WordPress template.
 *
 * Inherently Indigenous-only.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { withPage } from '../../util/puppet.js';

const buildHumanUrl = (q: string): string => {
  const sp = new URLSearchParams({
    qcompanyname: q,
    qccabindustry: '0',
    qccabprogram: '797', // CAB program
    qccabterritory: '0',
    qccabmembershiptype: '0',
    s: '',
  });
  return `https://www.ccib.ca/main/member/?${sp.toString()}`;
};

export const ccab: Source = {
  id: 'ccab',
  name: 'CCAB CAB directory',
  mode: 'business',
  format: 'html-search',
  category: 'Indigenous-only directories',
  homepage: 'https://www.ccib.ca/main/member/?qccabprogram=797',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'CCAB Certified Aboriginal Business directory (now under ccib.ca/main/member/; puppeteer-driven).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const items = await withPage(async (page) => {
        await page.goto(buildHumanUrl(q), { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 1500));
        return page.evaluate(() => {
          // Member detail pages live at /main/member/<slug>/ — distinguish
          // from the listing page itself (which is /main/member/?…). Anything
          // with a trailing slug counts as a real member link.
          const seen = new Set<string>();
          const rows: Array<{ title: string; url?: string; snippet?: string }> = [];
          document.querySelectorAll('a[href*="/main/member/"]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const href = link.getAttribute('href') || '';
            // Skip the listing page itself + paginators + nav links.
            if (!/\/main\/member\/[a-z0-9][a-z0-9-]+\/?$/i.test(href)) return;
            const title = (link.textContent || '').trim();
            if (!title || title.length < 3 || seen.has(title)) return;
            // Skip obvious nav noise ("English", "French", "NONE", single letters, …).
            if (/^(english|french|none|sort|filter|all|123|\d)$/i.test(title)) return;
            if (title.length === 1) return;
            seen.add(title);
            const card = link.closest('article, li, .member, .card, .post, div');
            const snippet = (card?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
            rows.push({
              title,
              url: new URL(href, location.origin).toString(),
              snippet: snippet === title ? undefined : snippet,
            });
          });
          return rows.slice(0, 25);
        });
      });
      const sourceItems: SourceItem[] = items.map((it) => ({
        title: it.title,
        url: it.url,
        snippet: it.snippet,
      }));
      return {
        items: sourceItems,
        searchUrl: buildHumanUrl(q),
        notes: sourceItems.length === 0 ? ['CCAB returned no member links for this query.'] : undefined,
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(q),
        warnings: [`CCAB scrape failed: ${(err as Error).message}. Use the search link.`],
      };
    }
  },
};
