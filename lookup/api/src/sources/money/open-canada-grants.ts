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
  // Listed in both modes — under Funding for "what grants exist", and under
  // Business for the diligence flow ("has this vendor received federal
  // grants?"). Same scraper handles both.
  mode: ['money', 'business'],
  format: 'html-search',
  category: 'Historical disclosures — Federal grants',
  homepage: BASE,
  indigenousFilter: 'org-filter',
  description: 'Federal grant + contribution + transfer-payment disclosures. Indigenous-only restricts to ISC + CIRNAC.',
  searchUrl: (q, opts) => buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor }),
  async scrape(q, opts): Promise<ScrapeResult> {
    const url = buildUrl(q, { indigenousOnly: opts.indigenousOnly, fromYear: opts.fromYear, vendor: opts.vendor });
    const html = await getText(url);
    const $ = cheerio.load(html);
    const items: SourceItem[] = [];

    // The Open Canada Solr/WET layout for grants is:
    //
    //   <a href="/grants/record/..."> <p>RECIPIENT (may contain <mark>...</mark>)</p> </a>
    //   <h4>$VALUE</h4>
    //   <h5>DATE</h5>
    //   ...followed by a metadata row with <strong>Field:</strong> <p>value</p> blocks
    //     (Agreement / Agreement Number / Duration / Description / Organization /
    //      Program Name / Location).
    //
    // We walk up to the per-record container (the nearest ancestor whose own
    // descendants include both the <a> and the value+meta block), then pull
    // structured fields off it.
    const dedup = new Set<string>();
    $('a[href*="/grants/record/"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href');
      if (!href) return;
      // Strip ?amendments / fragment so we dedupe by canonical record URL.
      const recordPath = href.split('?')[0];
      if (dedup.has(recordPath)) return;
      dedup.add(recordPath);
      // Pull title from the <p> inside the anchor, stripping <mark> highlights.
      const title = $a.find('p').first().text().trim() || $a.text().trim();
      if (!title) return;
      // The recipient anchor lives inside an <h4> > <div.col-sm-8>; walk up two
      // levels to the outer .row that also contains the value <h4>.
      const $card = $a.closest('div.row').parent();
      // Value sits in the right-side col-sm-4 as $h4.
      const valueText = $card
        .find('div.col-sm-4 h4')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      const startDate = $card.find('div.col-sm-4 h5').first().text().trim();
      // Pull each "<strong>Label:</strong> <p>val</p>" pair into a map. The
      // value `<p>` is the next sibling in some cases and inline text in
      // others; cheerio's `.contents()` gives us both.
      const fields: Record<string, string> = {};
      $card.find('strong').each((__, s) => {
        const $s = $(s);
        const label = $s.text().replace(':', '').trim();
        if (!label) return;
        // Take the text after the <strong> — either a sibling <p> or inline.
        const $parent = $s.parent();
        const parentText = $parent.text().replace(/\s+/g, ' ').trim();
        const value = parentText.replace(`${label}:`, '').trim();
        if (value && !fields[label]) fields[label] = value;
      });
      const organization = fields['Organization'] || '';
      const programName = fields['Program Name'] || '';
      const location = fields['Location'] || '';
      const description = fields['Description'] || '';
      const subtitle = [valueText, organization].filter(Boolean).join(' · ') || undefined;
      const snippet =
        [programName && `Program: ${programName}`, description, location && `Location: ${location}`, startDate && `Start ${startDate}`]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 320) || undefined;
      items.push({
        title: title.slice(0, 180),
        subtitle,
        snippet,
        url: new URL(href, BASE).toString(),
        fields: {
          ...(valueText ? { agreement_value: valueText } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(organization ? { funding_organization: organization } : {}),
          ...(programName ? { program_name: programName } : {}),
          ...(location ? { location } : {}),
          ...(description ? { description } : {}),
          ...(fields['Agreement Number'] ? { agreement_number: fields['Agreement Number'] } : {}),
          ...(fields['Duration'] ? { duration: fields['Duration'] } : {}),
        },
      });
    });

    return {
      items: items.slice(0, 25),
      searchUrl: url,
      raw: { contentType: 'text/html', body: html },
    };
  },
};
