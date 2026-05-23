/**
 * OrgBook BC — JSON API. Confirmed live 2026-05-23.
 * GET https://www.orgbook.gov.bc.ca/api/v4/search/topic?q=<q>&inactive=any
 * Detail page: /entity/<source_id>  (e.g. /entity/BC1217312)
 *
 * Quirk: `revoked=true` + `inactive=any` together returns 0 (it means
 * "only revoked credentials, among inactive entities"). Default to including
 * inactive entities but only valid credentials.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';
import { qs } from '../helpers.js';

interface OrgBookSearchResp {
  total: number;
  page: number;
  page_size: number;
  results: Array<{
    id?: number;
    source_id?: string;
    type?: string;
    names?: Array<{ text: string; type: string; credential_id?: number }>;
    addresses?: Array<{ city?: string; province?: string; postal_code?: string }>;
    topic?: {
      id?: number;
      source_id?: string;
      type?: string;
    };
    score?: number;
  }>;
}

const buildUrl = (q: string): string => {
  const params = qs({ q, inactive: 'any', ordering: '-score' });
  return `https://www.orgbook.gov.bc.ca/api/v4/search/topic${params}`;
};

const buildHumanUrl = (q: string): string =>
  `https://www.orgbook.gov.bc.ca/search/?${new URLSearchParams({ q }).toString()}`;

export const orgbookBc: Source = {
  id: 'orgbook-bc',
  name: 'OrgBook BC',
  mode: 'business',
  format: 'json-api',
  category: 'Corporate registries (BC)',
  homepage: 'https://www.orgbook.gov.bc.ca/',
  indigenousFilter: 'none',
  description: 'Public BC corporate registry directory (JSON API). Incorporation #, status, registered office.',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    const apiUrl = buildUrl(q);
    const data = await getJson<OrgBookSearchResp>(apiUrl);
    const items: SourceItem[] = (data.results ?? []).slice(0, 20).map((r) => {
      const primaryName = r.names?.find((n) => n.type === 'entity_name')?.text || r.names?.[0]?.text || '(unnamed)';
      const sourceId = r.topic?.source_id || r.source_id || '';
      const type = r.topic?.type || r.type || '';
      const addr = r.addresses?.[0];
      const city = [addr?.city, addr?.province].filter(Boolean).join(', ');
      const topicId = r.topic?.id || r.id;
      const profileUrl = topicId ? `https://www.orgbook.gov.bc.ca/entity/${sourceId || topicId}` : undefined;
      return {
        title: primaryName,
        subtitle: [sourceId, type].filter(Boolean).join(' · '),
        url: profileUrl,
        snippet: city || undefined,
        fields: {
          ...(sourceId ? { incorporation_number: sourceId } : {}),
          ...(type ? { type } : {}),
          ...(addr?.postal_code ? { postal_code: addr.postal_code } : {}),
        },
      };
    });
    return {
      items,
      searchUrl: buildHumanUrl(q),
      raw: { contentType: 'application/json', body: JSON.stringify(data, null, 2) },
      notes: [`OrgBook total = ${data.total}; showing ${items.length}.`],
    };
  },
};
