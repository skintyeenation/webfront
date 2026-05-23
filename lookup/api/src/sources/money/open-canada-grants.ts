/**
 * search.open.canada.ca/grants — federal Grants & Contributions.
 * HTML Solr search, confirmed live 2026-05-23.
 *
 * Indigenous filter: there's no single flag; we restrict by funding org
 *   (owner_org=isc-sac, cirnac-rcaanc) which are the two Indigenous-affairs
 *   departments. For broader coverage we can also OR Indigenous keywords into
 *   search_text — done via helpers.indigenousOrQuery when no owner_org is set.
 */

import * as cheerio from 'cheerio';
import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';

const BASE = 'https://search.open.canada.ca/grants/';

const buildUrl = (q: string, opts: { indigenousOnly: boolean; fromYear?: number; vendor?: string }): string => {
  const p = new URLSearchParams();
  p.set('search_text', opts.vendor ? `${q} ${opts.vendor}`.trim() : q);
  if (opts.indigenousOnly) {
    // Multi-select param — the search portal accepts repeated values.
    p.append('owner_org', 'isc-sac');
    p.append('owner_org', 'cirnac-rcaanc');
  }
  if (opts.fromYear) p.set('fiscal_year', `${opts.fromYear}-${opts.fromYear + 1}`);
  return `${BASE}?${p.toString()}`;
};

export const openCanadaGrants: Source = {
  id: 'open-canada-grants',
  name: 'Open Canada — Federal grants & contributions',
  mode: 'money',
  format: 'html-search',
  category: 'Federal contracts / grants',
  homepage: BASE,
  indigenousFilter: 'org-filter',
  description: 'Federal grant + contribution + transfer-payment disclosures. Indigenous-only restricts to ISC + CIRNAC.',
  searchUrl: (q, opts) => buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor }),
  async scrape(q, opts): Promise<ScrapeResult> {
    const url = buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor });
    const html = await getText(url);
    const $ = cheerio.load(html);
    const items: SourceItem[] = [];

    // Same WET layout as contracts: `<a href="/grants/record/..."><h3>RECIPIENT</h3></a>`.
    $('a[href*="/grants/record/"]').each((_, a) => {
      const $a = $(a);
      const title = $a.find('h3').first().text().trim() || $a.text().trim();
      const href = $a.attr('href');
      if (!title || !href) return;
      const $row = $a.closest('div.row').parent().closest('div.row');
      const valueText = $row.find('h3').filter((__, h) => /value/i.test($(h).text())).first().text().trim();
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
    };
  },
};
