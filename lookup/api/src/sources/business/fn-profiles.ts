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
        // The form has SIX submit buttons (btnFirstNation / btnTribalCouncil /
        // btnReserve / btnPoliticalOrganization / btnFNFTA / btnSearch); the
        // first input[type=submit] is the category-nav, NOT the search. The
        // search button is specifically #plcMain_btnSearch.
        await page.waitForSelector('#plcMain_btnSearch', { timeout: 5000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
          page.click('#plcMain_btnSearch'),
        ]);
        // The search posts back to FNListGrid.aspx with a table of matches.
        await new Promise((r) => setTimeout(r, 1000));
        return page.evaluate(() => {
          // The result table contains pairs of <a> per Nation: one wraps the
          // band number, one wraps the Nation name. Dedupe by BAND_NUMBER and
          // prefer the row whose anchor text is non-numeric (the name).
          const byBand = new Map<string, { number: string; name: string; href: string; row?: Element | null }>();
          document.querySelectorAll('a[href*="BAND_NUMBER="]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const href = link.getAttribute('href') || '';
            const m = href.match(/BAND_NUMBER=(\d+)/i);
            if (!m) return;
            const band = m[1];
            const text = (link.textContent || '').trim();
            const isNumeric = /^\d+$/.test(text);
            const cur = byBand.get(band);
            const row = link.closest('tr');
            if (!cur) {
              byBand.set(band, { number: isNumeric ? text : band, name: isNumeric ? '' : text, href, row });
            } else {
              if (isNumeric && !cur.number) cur.number = text;
              if (!isNumeric && (!cur.name || cur.name.length < text.length)) cur.name = text;
            }
          });
          const rows: Array<{ title: string; subtitle?: string; url?: string; snippet?: string; fields?: Record<string, string> }> = [];
          for (const v of byBand.values()) {
            if (!v.name) continue; // skip records without a name (shouldn't happen)
            const cells = v.row ? Array.from(v.row.querySelectorAll('td')).map((c) => (c.textContent || '').trim()) : [];
            // Cell layout (post-2024): [number, name, address/community, province, …]
            const community = cells[2] || '';
            const province = cells[3] || '';
            const region = cells[4] || '';
            rows.push({
              title: v.name,
              subtitle: `Band ${v.number}`,
              // Result links on FNListGrid are relative to /fnp/Main/Search/.
              url: new URL(v.href, location.href).toString(),
              snippet: [community, province, region].filter(Boolean).join(' · ') || undefined,
              fields: {
                band_number: v.number,
                ...(community ? { community } : {}),
                ...(province ? { province } : {}),
                ...(region ? { region } : {}),
              },
            });
          }
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
