/**
 * search.open.canada.ca/contracts — federal Proactive Disclosure of Contracts.
 * HTML Solr search, confirmed live 2026-05-23.
 *
 * Indigenous filter:
 *   procurement_strategy_indigenous_business=Y  (PSIB)
 *   comprehensive_land_claims_agreement=Y       (CLCAA — modern treaties)
 *
 * Other useful params: search_text, sort, page, owner_org, contract_year,
 * total_contract_value, vendor_name, …
 */

import * as cheerio from 'cheerio';
import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';

const BASE = 'https://search.open.canada.ca/contracts/';

const buildUrl = (q: string, opts: { indigenousOnly: boolean; fromYear?: number; vendor?: string; minValue?: number }): string => {
  const p = new URLSearchParams();
  p.set('search_text', opts.vendor ? `${q} ${opts.vendor}`.trim() : q);
  if (opts.indigenousOnly) p.set('procurement_strategy_indigenous_business', 'Y');
  if (opts.fromYear) p.set('contract_year', String(opts.fromYear));
  return `${BASE}?${p.toString()}`;
};

export const openCanadaContracts: Source = {
  id: 'open-canada-contracts',
  name: 'Open Canada — Federal contracts (>$10K)',
  mode: 'money',
  format: 'html-search',
  category: 'Federal contracts / grants',
  homepage: BASE,
  indigenousFilter: 'flag',
  description: 'All disclosed federal contracts over $10K. Indigenous-only flips the PSIB filter.',
  searchUrl: (q, opts) =>
    buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor, minValue: opts.minValue }),
  async scrape(q, opts): Promise<ScrapeResult> {
    const url = buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor, minValue: opts.minValue });
    const html = await getText(url);
    const $ = cheerio.load(html);
    const items: SourceItem[] = [];

    // Each result is `<a href="/contracts/record/..."><h3>VENDOR</h3></a>` plus
    // a sibling row with `<h3>Total Value: $X</h3>` and follow-on rows of
    // <strong>Contract Date:</strong> etc.
    $('a[href*="/contracts/record/"]').each((_, a) => {
      const $a = $(a);
      const title = $a.find('h3').first().text().trim() || $a.text().trim();
      const href = $a.attr('href');
      if (!title || !href) return;
      // The row wrapping this anchor; the parent row's sibling holds the Total Value.
      const $row = $a.closest('div.row').parent().closest('div.row');
      const valueText = $row.find('h3').filter((__, h) => /total value/i.test($(h).text())).first().text().trim();
      const meta = $row.find('strong').map((__, s) => $(s).text().replace(':', '').trim() + ': ' + ($(s).parent().next().text().trim() || '')).get().join(' · ');
      items.push({
        title: title.slice(0, 180),
        subtitle: valueText || undefined,
        snippet: meta.slice(0, 320) || undefined,
        url: new URL(href, BASE).toString(),
      });
    });

    return {
      items: items.slice(0, 25),
      searchUrl: url,
      raw: { contentType: 'text/html', body: html },
      notes: items.length ? undefined : ['No structured results extracted — open the search URL.'],
    };
  },
};
