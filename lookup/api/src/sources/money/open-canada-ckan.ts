/**
 * Open Canada CKAN dataset search.
 * GET https://open.canada.ca/data/api/3/action/package_search?q=<q>&rows=10
 *
 * Use to discover datasets (e.g. grant programs, Indigenous-business listings,
 * regional development funds) that may apply to a keyword. Confirmed live.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

interface CkanSearchResp {
  success: boolean;
  result: {
    count: number;
    results: Array<{
      name?: string;
      title?: string;
      notes?: string;
      organization?: { title?: string };
      resources?: Array<{ format?: string; url?: string }>;
      tags?: Array<{ display_name?: string }>;
    }>;
  };
}

const buildHumanUrl = (q: string): string =>
  `https://open.canada.ca/data/en/dataset?q=${encodeURIComponent(q)}`;

const buildApiUrl = (q: string): string =>
  `https://open.canada.ca/data/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=10`;

export const openCanadaCkan: Source = {
  id: 'open-canada-ckan',
  name: 'Open Canada — datasets (CKAN)',
  mode: 'money',
  format: 'ckan',
  category: 'Open-data catalogues',
  homepage: 'https://open.canada.ca/data/en/dataset',
  indigenousFilter: 'keyword-or',
  description: 'Federal open-data catalogue — surfaces grant/funding datasets matching the keyword.',
  searchUrl: (q, opts) => buildHumanUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    const url = buildApiUrl(query);
    const data = await getJson<CkanSearchResp>(url);
    const items: SourceItem[] = (data.result?.results ?? []).slice(0, 15).map((d) => ({
      title: d.title || d.name || '(untitled)',
      subtitle: d.organization?.title,
      url: d.name ? `https://open.canada.ca/data/en/dataset/${d.name}` : undefined,
      snippet: (d.notes ?? '').slice(0, 280),
      fields: {
        formats: (d.resources ?? []).map((r) => r.format).filter(Boolean).join(', '),
        tags: (d.tags ?? []).map((t) => t.display_name).filter(Boolean).slice(0, 6).join(', '),
      },
    }));
    return {
      items,
      searchUrl: buildHumanUrl(query),
      raw: { contentType: 'application/json', body: JSON.stringify(data, null, 2) },
      notes: [`CKAN match count = ${data.result?.count ?? 'n/a'}; showing ${items.length}.`],
    };
  },
};
