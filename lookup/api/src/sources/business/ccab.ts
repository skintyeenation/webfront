/**
 * CCAB (Canadian Council for Aboriginal Business) Certified Aboriginal
 * Business directory. After the 2024 rebrand it lives at ccib.ca but the
 * `/cab-directory/` route is still active and is filtered client-side.
 * Drive with puppeteer.
 *
 * Inherently Indigenous-only.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { withPage } from '../../util/puppet.js';

const buildHumanUrl = (q: string): string =>
  `https://www.ccib.ca/cab-directory/?keyword=${encodeURIComponent(q)}`;

export const ccab: Source = {
  id: 'ccab',
  name: 'CCAB CAB directory',
  mode: 'business',
  format: 'html-search',
  category: 'Indigenous-only directories',
  homepage: 'https://www.ccib.ca/cab-directory/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'CCAB Certified Aboriginal Business directory (puppeteer scrape of the JS-filtered listing).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const items = await withPage(async (page) => {
        await page.goto(buildHumanUrl(q), { waitUntil: 'networkidle2' });
        try {
          await page.waitForSelector('.cab-directory, .member-listing, article, .post', { timeout: 8000 });
        } catch {
          // No results / different DOM — return whatever we can.
        }
        return page.evaluate((needle) => {
          // Be defensive — CCIB has been WordPress-themed.
          const seen = new Set<string>();
          const rows: Array<{ title: string; subtitle?: string; url?: string; snippet?: string }> = [];
          // Try common patterns.
          const cards = document.querySelectorAll('.cab-directory article, .cab-directory .member, article.member, article.cab, .cab-listing, .business-listing, .member-listing article, article.post');
          cards.forEach((el) => {
            const titleEl = el.querySelector('h2 a, h3 a, .title a, .name a, .entry-title a, h2, h3, .name') as HTMLElement | null;
            const title = (titleEl?.textContent ?? '').trim();
            if (!title || seen.has(title)) return;
            seen.add(title);
            const link = (titleEl?.tagName === 'A' ? titleEl : titleEl?.closest('a') || el.querySelector('a')) as HTMLAnchorElement | null;
            const subtitle = (el.querySelector('.industry, .sector, .category, .meta')?.textContent ?? '').replace(/\s+/g, ' ').trim();
            const snippet = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
            rows.push({ title, subtitle: subtitle || undefined, url: link?.href, snippet });
          });
          if (rows.length) return rows.slice(0, 25);
          // Fall back: any <a> whose text matches the needle and that links somewhere with /business/ or /member/.
          document.querySelectorAll('a').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const t = (link.textContent ?? '').trim();
            const href = link.getAttribute('href') ?? '';
            if (!t || seen.has(t)) return;
            if (!/business|member|company|cab/i.test(href)) return;
            if (needle && !t.toLowerCase().includes(needle.toLowerCase())) return;
            seen.add(t);
            rows.push({ title: t, url: link.href });
          });
          return rows.slice(0, 25);
        }, q);
      });
      const sourceItems: SourceItem[] = items.map((it) => ({
        title: it.title,
        subtitle: it.subtitle,
        url: it.url,
        snippet: it.snippet,
      }));
      return {
        items: sourceItems,
        searchUrl: buildHumanUrl(q),
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
