/**
 * MRAS Canadian Business Registry — HTML scrape.
 * https://ised-isde.canada.ca/cbr-rec/en/search/results?search=<q>
 */

import * as cheerio from 'cheerio';
import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';

const buildUrl = (q: string): string =>
  `https://ised-isde.canada.ca/cbr-rec/en/search/results?${new URLSearchParams({ search: q }).toString()}`;

export const mras: Source = {
  id: 'mras',
  name: 'MRAS Canadian Business Registry',
  mode: 'business',
  format: 'html-search',
  category: 'Corporate registries (cross-jurisdiction)',
  homepage: 'https://ised-isde.canada.ca/cbr-rec/',
  indigenousFilter: 'none',
  description: 'Cross-jurisdiction company search (BC, federal, AB, ON, …).',
  searchUrl: (q) => buildUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    const url = buildUrl(q);
    const html = await getText(url);
    const $ = cheerio.load(html);
    const items: SourceItem[] = [];

    // The results table — be defensive about the markup shape.
    $('table tbody tr, .results-list li, .results .result, [data-result]').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a').first().text().trim() || $el.find('.name, .business-name').first().text().trim();
      if (!title) return;
      const link = $el.find('a').first().attr('href');
      const subtitle = $el.find('.jurisdiction, td').slice(1).map((__, c) => $(c).text().trim()).get().join(' · ');
      items.push({
        title,
        subtitle: subtitle || undefined,
        url: link ? new URL(link, 'https://ised-isde.canada.ca').toString() : undefined,
      });
    });

    return {
      items: items.slice(0, 25),
      searchUrl: url,
      raw: { contentType: 'text/html', body: html },
      notes: items.length ? undefined : ['No structured rows extracted — open the search URL.'],
    };
  },
};
