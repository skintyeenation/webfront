/**
 * BC Indigenous Business Listings — CKAN datastore.
 *
 *   GET https://catalogue.data.gov.bc.ca/api/3/action/datastore_search
 *       ?resource_id=f805f66e-8294-4f8d-bdd9-2400eb3938d0
 *       &q=<query>&limit=25
 *
 * Inherently Indigenous-only. Records carry name, description, city, address,
 * email, phone, website, region, industry sector, Indigenous ownership %,
 * year formed, employee count.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';

const RESOURCE_ID = 'f805f66e-8294-4f8d-bdd9-2400eb3938d0';

interface CkanDatastoreResp {
  result: {
    total: number;
    records: Array<{
      _id?: number;
      'Business Name'?: string;
      Description?: string;
      Address?: string;
      'Postal Code'?: string;
      Email?: string;
      Phone?: string;
      'Web Site'?: string;
      City?: string;
      Keywords?: string;
      'Indigenous Ownership'?: string;
      Region?: string;
      Type?: string;
      'Industry Sector'?: string;
      'Year Formed'?: string | number;
      'Number of Employees'?: string | number;
      'Primary Contact'?: string;
      'Contact Title'?: string;
    }>;
  };
}

const buildApiUrl = (q: string): string =>
  `https://catalogue.data.gov.bc.ca/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&q=${encodeURIComponent(q)}&limit=25`;

const buildHumanUrl = (q: string): string =>
  `https://catalogue.data.gov.bc.ca/dataset/bc-indigenous-business-listings?q=${encodeURIComponent(q)}`;

export const bcIndigenousListings: Source = {
  id: 'bc-indigenous-listings',
  name: 'BC Indigenous Business Listings (open data)',
  mode: 'business',
  format: 'ckan',
  category: 'Indigenous-only directories',
  homepage: 'https://catalogue.data.gov.bc.ca/dataset/bc-indigenous-business-listings',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Provincial open dataset of Indigenous-owned BC businesses (CKAN datastore — name, contact, ownership, industry).',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    const url = buildApiUrl(q);
    const data = await getJson<CkanDatastoreResp>(url);
    const items: SourceItem[] = (data.result?.records ?? []).map((r) => {
      const name = r['Business Name'] ?? '(unnamed)';
      const city = [r.City, r['Postal Code']].filter(Boolean).join(' · ');
      return {
        title: name,
        subtitle: [r['Indigenous Ownership'], r.Region, r['Industry Sector']].filter(Boolean).join(' · ') || undefined,
        url: r['Web Site'] || undefined,
        snippet: [
          r.Description?.slice(0, 280),
          city,
          r.Address,
          r['Year Formed'] && `Year formed ${r['Year Formed']}`,
          r['Number of Employees'] && `Employees: ${r['Number of Employees']}`,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
        fields: {
          ...(r.Email ? { email: r.Email } : {}),
          ...(r.Phone ? { phone: r.Phone } : {}),
          ...(r['Indigenous Ownership'] ? { indigenous_ownership: r['Indigenous Ownership'] } : {}),
          ...(r.Region ? { region: r.Region } : {}),
          ...(r['Industry Sector'] ? { industry: r['Industry Sector'] } : {}),
          ...(r.Type ? { type: r.Type } : {}),
          ...(r['Year Formed'] ? { year_formed: r['Year Formed'] } : {}),
          ...(r['Number of Employees'] ? { employees: r['Number of Employees'] } : {}),
          ...(r['Primary Contact'] ? { contact: r['Primary Contact'] } : {}),
          ...(r['Contact Title'] ? { contact_title: r['Contact Title'] } : {}),
          ...(r.Keywords ? { keywords: r.Keywords } : {}),
        },
      };
    });
    return {
      items,
      searchUrl: buildHumanUrl(q),
      raw: { contentType: 'application/json', body: JSON.stringify(data, null, 2) },
      notes: [`BC Indigenous Listings total = ${data.result?.total ?? 'n/a'}; showing ${items.length}.`],
    };
  },
};
