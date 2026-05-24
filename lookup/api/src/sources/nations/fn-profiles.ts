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
  mode: 'nations',
  format: 'html-search',
  category: 'Band registry',
  homepage: 'https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Index.aspx?lang=eng',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Per-band profile: council, demographics, lands, FNFTA disclosures (puppeteer scrape of the ASP.NET form).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q, opts): Promise<ScrapeResult> {
    try {
      const items = await withPage(async (page) => {
        await page.goto(SEARCH_PAGE, { waitUntil: 'networkidle2', timeout: 25000 });
        await page.waitForSelector('#plcMain_txtName', { timeout: 10000 });
        // The form's own hint reads: "use full or partial name. For a partial
        // name search, enter the '%' before the text." So prepend a leading
        // `%` to make every query a substring match — an empty query becomes
        // just '%' which is "everything", giving us the full region listing.
        const trimmed = q.trim();
        const term = trimmed ? (trimmed.startsWith('%') ? trimmed : `%${trimmed}`) : '%';
        await page.type('#plcMain_txtName', term);
        // Optional region narrow (e.g. BC = '9'). plcMain_ddlRegion is the
        // ISC regional office dropdown.
        if (opts.regionId) {
          await page.select('#plcMain_ddlRegion', opts.regionId).catch(() => {});
        }
        // (ddlHitsPerPage lives on the FNListGrid response page, not here —
        // we paginate by clicking Next on the results page below.)
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
        // Bump page size to the results-page max (100). The dropdown is an
        // ASP.NET AutoPostBack — selecting + dispatching 'change' triggers
        // a server postback that re-renders with the new page size.
        try {
          await page.select('#plcMain_ddlHitsPerPage', '100');
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
            page.evaluate(() => {
              const el = document.querySelector('#plcMain_ddlHitsPerPage');
              el?.dispatchEvent(new Event('change', { bubbles: true }));
            }),
          ]);
        } catch {
          /* dropdown not present — single-page result, fine */
        }
        const collectPage = () => page.evaluate(() => {
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
          return rows.slice(0, 500);
        });
        // Accumulate across pagination. Look for an enabled "Next" link in
        // the FNListGrid pager; click it; re-collect. Cap at 10 pages
        // (1,000 rows) so a runaway response can't lock the worker.
        const all = new Map<string, any>();
        for (let p2 = 0; p2 < 10; p2 += 1) {
          const batch = await collectPage();
          for (const r of batch) {
            const key = String(r.fields?.band_number || r.title);
            if (!all.has(key)) all.set(key, r);
          }
          const hasNext = await page.evaluate(() => {
            // The pager renders enabled-Next as a clickable <a>; disabled as
            // a non-clickable span. Find an <a> whose text is "Next" or "»".
            const anchors = Array.from(document.querySelectorAll('a, button'));
            const next = anchors.find((a) =>
              /^next\s*»?$|^»$/i.test((a.textContent || '').trim()) ||
              /pageNext|btnNext/i.test(a.id || ''),
            ) as HTMLElement | undefined;
            if (!next) return false;
            const disabled = (next as any).disabled || (next.getAttribute('aria-disabled') === 'true');
            if (disabled) return false;
            next.scrollIntoView({ block: 'center' });
            (next as HTMLAnchorElement).click();
            return true;
          });
          if (!hasNext) break;
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 500));
        }
        return [...all.values()];
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
