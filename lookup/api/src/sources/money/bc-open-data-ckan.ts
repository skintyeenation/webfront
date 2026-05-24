/**
 * BC Open Data catalogue (CKAN). Confirmed live.
 * GET https://catalogue.data.gov.bc.ca/api/3/action/package_search?q=<q>&rows=10
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

interface CkanSearchResp {
  result: {
    count: number;
    results: Array<{
      name?: string;
      title?: string;
      notes?: string;
      organization?: { title?: string };
      resources?: Array<{ format?: string }>;
      tags?: Array<{ display_name?: string }>;
    }>;
  };
}

const buildHumanUrl = (q: string): string =>
  `https://catalogue.data.gov.bc.ca/dataset?q=${encodeURIComponent(q)}`;

const buildApiUrl = (q: string): string =>
  `https://catalogue.data.gov.bc.ca/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=10`;

export const bcOpenDataCkan: Source = {
  id: 'bc-open-data-ckan',
  name: 'BC Open Data — datasets (CKAN)',
  mode: 'money',
  format: 'ckan',
  category: 'Reference — Open-data catalogues',
  homepage: 'https://catalogue.data.gov.bc.ca/',
  indigenousFilter: 'keyword-or',
  description: 'BC provincial open-data catalogue — surface BC grant/funding datasets.',
  searchUrl: (q, opts) => buildHumanUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    const url = buildApiUrl(query);
    const data = await getJson<CkanSearchResp>(url);
    const items: SourceItem[] = (data.result?.results ?? []).slice(0, 15).map((d) => ({
      title: d.title || d.name || '(untitled)',
      subtitle: d.organization?.title,
      url: d.name ? `https://catalogue.data.gov.bc.ca/dataset/${d.name}` : undefined,
      snippet: (d.notes ?? '').slice(0, 280),
      fields: {
        formats: (d.resources ?? []).map((r) => r.format).filter(Boolean).join(', '),
      },
    }));
    return {
      items,
      searchUrl: buildHumanUrl(query),
      raw: { contentType: 'application/json', body: JSON.stringify(data, null, 2) },
      notes: [`BC CKAN match count = ${data.result?.count ?? 'n/a'}; showing ${items.length}.`],
    };
  },
};
