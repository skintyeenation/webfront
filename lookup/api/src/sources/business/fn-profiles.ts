/**
 * ISC First Nation Profiles — ASP.NET WebForms site (`.aspx`) with
 * `__VIEWSTATE`. Like ISC IBD, the page has two forms (a Canada.ca global
 * search and the real FN search `#form1`); clicking the wrong button bounces
 * to canada.ca. Drive with puppeteer.
 *
 *   1) GET /fnp/Main/Search/SearchFN.aspx?lang=eng
 *   2) Type into #plcMain_txtName (ctl00$plcMain$txtName)
 *   3) Click the Search button inside form#form1
 *   4) Parse the result table linking to FNMain.aspx?BAND_NUMBER=…
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { withPage } from '../../util/puppet.js';

const SEARCH_PAGE = 'https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/SearchFN.aspx?lang=eng';

const buildHumanUrl = (q: string): string =>
  `${SEARCH_PAGE}&q=${encodeURIComponent(q)}`;

export const fnProfiles: Source = {
  id: 'fn-profiles',
  name: 'ISC First Nation Profiles',
  mode: 'business',
  format: 'html-search',
  category: 'First Nations',
  homepage: 'https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Index.aspx?lang=eng',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Per-band profile: council, demographics, lands, FNFTA disclosures (puppeteer scrape of the ASP.NET form).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const items = await withPage(async (page) => {
        await page.goto(SEARCH_PAGE, { waitUntil: 'networkidle2', timeout: 25000 });
        await page.waitForSelector('#plcMain_txtName', { timeout: 10000 });
        // The form's own hint reads: "use full or partial name. For a partial
        // name search, enter the '%' before the text." So prepend a leading
        // `%` to make every query a substring match.
        const term = q.startsWith('%') ? q : `%${q}`;
        await page.type('#plcMain_txtName', term);
        // Find the submit button INSIDE form#form1 (not the canada.ca form).
        const submitSel = 'form#form1 input[type="submit"], form#form1 button[type="submit"]';
        await page.waitForSelector(submitSel, { timeout: 5000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
          page.click(submitSel),
        ]);
        await new Promise((r) => setTimeout(r, 1000));
        return page.evaluate(() => {
          const rows: Array<{ title: string; subtitle?: string; url?: string; snippet?: string; fields?: Record<string, string> }> = [];
          // FN result links point at FNMain.aspx?BAND_NUMBER=… or FNListGrid.
          document.querySelectorAll('a[href*="FNMain.aspx"], a[href*="BAND_NUMBER"]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const text = (link.textContent || '').trim();
            if (!text || text.length < 2) return;
            const row = link.closest('tr');
            const cells = row ? Array.from(row.querySelectorAll('td')).map((c) => (c.textContent || '').trim()) : [];
            const bandMatch = (link.getAttribute('href') || '').match(/BAND_NUMBER=(\d+)/i);
            rows.push({
              title: text,
              subtitle: bandMatch ? `Band ${bandMatch[1]}` : undefined,
              url: new URL(link.getAttribute('href') || '', location.origin).toString(),
              snippet: cells.slice(1).join(' · ').slice(0, 240) || undefined,
              fields: bandMatch ? { band_number: bandMatch[1] } : undefined,
            });
          });
          return rows.slice(0, 25);
        });
      });
      const sourceItems: SourceItem[] = items.map((it) => ({
        title: it.title,
        subtitle: it.subtitle,
        url: it.url,
        snippet: it.snippet,
        fields: it.fields,
      }));
      return {
        items: sourceItems,
        searchUrl: buildHumanUrl(q),
        notes: sourceItems.length === 0 ? ['ISC FN Profiles returned no matches for this name.'] : undefined,
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(q),
        warnings: [`ISC FN Profiles scrape failed: ${(err as Error).message}. Use the search link.`],
      };
    }
  },
};
