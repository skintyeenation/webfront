/**
 * MERX — federal + multi-province tender opportunities. Confirmed live.
 * https://www.merx.com/public/solicitations/open?keywords=<q>&pageNumber=1&language=EN
 *
 * Indigenous filter: no dedicated flag — OR Indigenous keywords into the query.
 */

import * as cheerio from 'cheerio';
import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

const buildUrl = (q: string, status: 'open' | 'awards' = 'open'): string =>
  `https://www.merx.com/public/solicitations/${status}?keywords=${encodeURIComponent(q)}&language=EN`;

export const merx: Source = {
  id: 'merx',
  name: 'MERX — tenders & awarded contracts',
  mode: 'money',
  format: 'html-search',
  category: 'Bids / solicitations',
  homepage: 'https://www.merx.com/',
  indigenousFilter: 'keyword-or',
  description: 'Active and awarded solicitations across federal and several provinces.',
  searchUrl: (q, opts) => buildUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q, 'open'),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    const url = buildUrl(query, 'open');
    let html = '';
    try {
      html = await getText(url);
    } catch (e) {
      return {
        items: [],
        searchUrl: url,
        warnings: [`MERX fetch failed (${(e as Error).message}); link only.`],
      };
    }
    const $ = cheerio.load(html);
    const items: SourceItem[] = [];
    $('.results a, .solicitation-item, [data-notice-id], .mets-table tbody tr').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a').first().text().trim() || $el.text().trim().slice(0, 200);
      const href = $el.find('a').first().attr('href');
      if (!title) return;
      const id = $el.attr('data-notice-id') || '';
      items.push({
        title: title.slice(0, 180),
        subtitle: id || undefined,
        url: href ? new URL(href, 'https://www.merx.com').toString() : undefined,
      });
    });
    return {
      items: items.slice(0, 25),
      searchUrl: url,
      raw: { contentType: 'text/html', body: html },
    };
  },
};
