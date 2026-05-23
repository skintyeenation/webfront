/**
 * MRAS Canadian Business Registry — JSON API (the public SPA is JS-heavy and
 * loads results from a Solr-backed endpoint).
 *
 * Search:
 *   GET https://ised-isde.canada.ca/cbr/srch/api/v1/search
 *       ?fq=keyword:{<query>}
 *       &lang=en
 *       &queryaction=fieldquery
 *       &sortfield=score&sortorder=desc
 *
 * Response: { totalResults, count, docs: [{ MRAS_ID, Company_Name,
 *   Entity_Type, BN, Juri_ID, Jurisdiction, Status_State, Date_Incorporated,
 *   Reg_office_city, Reg_office_province, ... }] }
 *
 * The /search/details SPA route only renders the shell, so for a clickable
 * deep link we use that route by `id`. For BC entities we additionally link
 * to OrgBook BC for the live profile.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';

interface MrasDoc {
  MRAS_ID: string;
  Company_Name?: string;
  Entity_Type?: string;
  BN?: string;
  Juri_ID?: string;
  Jurisdiction?: string;
  Status_State?: string;
  Date_Incorporated?: string;
  Reg_office_city?: string;
  Reg_office_province?: string;
}

interface MrasResp {
  totalResults: number;
  count: number;
  docs: MrasDoc[];
}

const buildApiUrl = (q: string): string => {
  // The MRAS frontend wraps the keyword in `{…}` — Solr field-query syntax.
  const fq = `keyword:{${q}}`;
  const sp = new URLSearchParams();
  sp.set('fq', fq);
  sp.set('lang', 'en');
  sp.set('queryaction', 'fieldquery');
  sp.set('sortfield', 'score');
  sp.set('sortorder', 'desc');
  return `https://ised-isde.canada.ca/cbr/srch/api/v1/search?${sp.toString()}`;
};

const buildHumanUrl = (q: string): string =>
  `https://ised-isde.canada.ca/cbr-rec/en/search/results?${new URLSearchParams({ search: q }).toString()}`;

const profileUrl = (doc: MrasDoc): string => {
  // BC entities have a live profile on OrgBook BC keyed by Juri_ID.
  if (doc.Jurisdiction === 'BC' && doc.Juri_ID) {
    return `https://www.orgbook.gov.bc.ca/entity/${doc.Juri_ID}`;
  }
  // Otherwise deep-link into the MRAS SPA — the route picks up `id` and
  // renders the details panel client-side.
  return `https://ised-isde.canada.ca/cbr-rec/en/search/details?id=${encodeURIComponent(doc.MRAS_ID)}`;
};

export const mras: Source = {
  id: 'mras',
  name: 'MRAS Canadian Business Registry',
  mode: 'business',
  format: 'json-api',
  category: 'Corporate registries (cross-jurisdiction)',
  homepage: 'https://ised-isde.canada.ca/cbr-rec/',
  indigenousFilter: 'none',
  description: 'Cross-jurisdiction company search (BC, federal, AB, ON, …) via the public MRAS JSON API.',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    const apiUrl = buildApiUrl(q);
    const data = await getJson<MrasResp>(apiUrl);
    const items: SourceItem[] = (data.docs ?? []).slice(0, 25).map((doc) => ({
      title: doc.Company_Name ?? '(unnamed)',
      subtitle: [doc.Jurisdiction, doc.Juri_ID, doc.Status_State].filter(Boolean).join(' · '),
      url: profileUrl(doc),
      snippet: [
        doc.Entity_Type,
        doc.Reg_office_city && `${doc.Reg_office_city}${doc.Reg_office_province ? ', ' + doc.Reg_office_province : ''}`,
        doc.Date_Incorporated && `Incorporated ${doc.Date_Incorporated}`,
        doc.BN && `BN ${doc.BN}`,
      ]
        .filter(Boolean)
        .join(' · '),
      fields: {
        ...(doc.MRAS_ID ? { mras_id: doc.MRAS_ID } : {}),
        ...(doc.BN ? { business_number: doc.BN } : {}),
        ...(doc.Juri_ID ? { juri_id: doc.Juri_ID } : {}),
        ...(doc.Entity_Type ? { entity_type: doc.Entity_Type } : {}),
        ...(doc.Jurisdiction ? { jurisdiction: doc.Jurisdiction } : {}),
        ...(doc.Status_State ? { status: doc.Status_State } : {}),
      },
    }));
    return {
      items,
      searchUrl: buildHumanUrl(q),
      raw: { contentType: 'application/json', body: JSON.stringify(data, null, 2) },
      notes: [`MRAS totalResults = ${data.totalResults}; showing ${items.length}.`],
    };
  },
};
