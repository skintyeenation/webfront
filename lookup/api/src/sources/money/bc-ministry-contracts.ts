/**
 * BC Ministry Contract Awards — backed by the BC Open Data CKAN datastore.
 *
 *   https://catalogue.data.gov.bc.ca/dataset/ministry-contract-awards-province-of-british-columbia
 *
 * Why this is the right BC-Bid replacement: the dataset is owned by
 * **BC government Procurement Services** (the same Crown org that runs BC
 * Bid; custodian Jeff Perks @ gov.bc.ca), and the dataset's own description
 * states verbatim:
 *
 *   "B.C. government ministries post contract award summaries for each
 *    competitive opportunity published on BC Bid. This changed from
 *    optional to core policy effective July 1, 2014. Award summaries are
 *    posted after the contract is signed."
 *
 * So every award that lands on BC Bid is — by ministerial policy — also
 * lodged here as structured CSV, sliced into quarterly resources. We hit
 * CKAN's `datastore_search` to keyword-filter directly against the CSV
 * rows.
 *
 * Why we need this: BC Bid itself is captcha-locked by SciQuest's
 * browser_check gate — we can't get past it with curl or Puppeteer (the
 * automated checker rejects every non-human session, regardless of
 * stealth flags / real Chrome UA / cookie pre-warming). This dataset
 * is the structured back-door: vendor, contract title, award amount,
 * issuing organization, award date — all queryable.
 *
 * The dataset has ~26 quarterly resources back to 2012. We query the
 * `QUARTERS_TO_SEARCH` most recent active resources in parallel and
 * merge results.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

const PACKAGE_ID = 'ministry-contract-awards-province-of-british-columbia';
const CKAN_BASE = 'https://catalogue.data.gov.bc.ca';
const HUMAN_URL = `${CKAN_BASE}/dataset/${PACKAGE_ID}`;
/** How many recent quarters to search. 4 = the last ~year of awards. */
const QUARTERS_TO_SEARCH = 4;
/** Max items returned across all quarters. */
const MAX_ITEMS = 25;

interface PackageShowResponse {
  result: {
    resources: Array<{
      id: string;
      name: string;
      format: string;
      datastore_active?: boolean;
      created?: string;
    }>;
  };
}

interface DatastoreSearchResponse {
  result: {
    total: number;
    fields: Array<{ id: string; type: string }>;
    records: Array<Record<string, string | number>>;
  };
}

interface AwardRow {
  title: string;
  vendor: string;
  amount?: string;
  issuingOrg?: string;
  awardedDate?: string;
  procurementMethod?: string;
  opportunityId?: string;
  vendorCity?: string;
  vendorCountry?: string;
  quarterLabel: string;
}

async function recentActiveResources(): Promise<Array<{ id: string; name: string }>> {
  const r = (await getJson<PackageShowResponse>(
    `${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`,
  )) as PackageShowResponse;
  return r.result.resources
    .filter((res) => res.datastore_active && res.format?.toUpperCase() === 'CSV')
    // The dataset names them like "Ministry Contract Awards - Jul to Sep 2025";
    // sort lexicographically by `created` (most recent first) — CKAN populates
    // created at upload time, which corresponds to publication of that quarter.
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
    .slice(0, QUARTERS_TO_SEARCH)
    .map((res) => ({ id: res.id, name: res.name }));
}

async function searchOneResource(
  resourceId: string,
  resourceName: string,
  q: string,
): Promise<AwardRow[]> {
  const params = new URLSearchParams({
    resource_id: resourceId,
    limit: '50',
  });
  if (q.trim()) params.set('q', q);
  const url = `${CKAN_BASE}/api/3/action/datastore_search?${params.toString()}`;
  const r = (await getJson<DatastoreSearchResponse>(url)) as DatastoreSearchResponse;
  return r.result.records.map((rec) => ({
    title: String(rec['Title'] ?? rec['title'] ?? '').trim(),
    vendor: String(rec['Successful Vendor'] ?? rec['Supplier Name'] ?? '').trim(),
    amount: String(rec['Award Total'] ?? rec['Award Value'] ?? '').trim() || undefined,
    issuingOrg: String(rec['Issued by Organization'] ?? '').trim() || undefined,
    awardedDate: String(rec['Date Awarded'] ?? rec['Award Date'] ?? '').slice(0, 10) || undefined,
    procurementMethod: String(rec['Procurement Method'] ?? '').trim() || undefined,
    opportunityId: String(rec['Opportunity ID'] ?? '').trim() || undefined,
    vendorCity: String(rec['Successful Vendor Address'] ?? '').trim() || undefined,
    vendorCountry: String(rec['Successful Vendor Country'] ?? '').trim() || undefined,
    quarterLabel: resourceName.replace(/^Ministry Contract Awards\s*-?\s*/i, ''),
  }));
}

const buildHumanUrl = (q: string): string =>
  q.trim() ? `${HUMAN_URL}?q=${encodeURIComponent(q)}` : HUMAN_URL;

export const bcMinistryContracts: Source = {
  id: 'bc-ministry-contracts',
  name: 'BC Ministry Contract Awards (BC Bid replacement)',
  mode: 'money',
  format: 'csv-bulk',
  category: 'Historical disclosures — BC ministry contracts',
  homepage: HUMAN_URL,
  indigenousFilter: 'keyword-or',
  description:
    'Structured BC government contract awards — by Procurement Services policy (July 2014+), BC ministries publish a summary of every competitive opportunity they ran on BC Bid into this CKAN dataset. Queryable CSV form via the BC Open Data datastore. Owned by gov.bc.ca Procurement Services — same Crown org that runs BC Bid.',
  searchUrl: (q, opts) => buildHumanUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    try {
      const resources = await recentActiveResources();
      // Run all quarter queries in parallel, then merge + cap.
      const settled = await Promise.allSettled(
        resources.map((r) => searchOneResource(r.id, r.name, query)),
      );
      const rows: AwardRow[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          rows.push(...s.value);
        } else {
          warnings.push(`Quarter "${resources[i].name}" failed: ${s.reason}`);
        }
      }
      // Sort newest first.
      rows.sort((a, b) => (b.awardedDate || '').localeCompare(a.awardedDate || ''));
      const items: SourceItem[] = rows.slice(0, MAX_ITEMS).map((r) => ({
        title: r.vendor || r.title || '(unnamed contract)',
        subtitle: r.title && r.title !== r.vendor ? r.title : r.issuingOrg,
        snippet: [r.amount && `Award ${r.amount}`, r.awardedDate, r.procurementMethod, r.quarterLabel]
          .filter(Boolean)
          .join(' · ') || undefined,
        fields: {
          ...(r.vendor ? { vendor: r.vendor } : {}),
          ...(r.amount ? { award_total: r.amount } : {}),
          ...(r.issuingOrg ? { issued_by: r.issuingOrg } : {}),
          ...(r.awardedDate ? { date_awarded: r.awardedDate } : {}),
          ...(r.procurementMethod ? { procurement_method: r.procurementMethod } : {}),
          ...(r.opportunityId ? { bcbid_opportunity_id: r.opportunityId } : {}),
          ...(r.vendorCity ? { vendor_address: r.vendorCity } : {}),
          ...(r.vendorCountry ? { vendor_country: r.vendorCountry } : {}),
          quarter: r.quarterLabel,
        },
      }));
      return {
        items,
        searchUrl: buildHumanUrl(query),
        notes: [
          `Searched ${resources.length} most recent quarter${resources.length === 1 ? '' : 's'} (~${rows.length} rows matched). Dataset has ~26 quarters back to 2012.`,
        ],
        ...(warnings.length ? { warnings } : {}),
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(query),
        warnings: [`BC CKAN fetch failed (${(err as Error).message}); link only.`],
      };
    }
  },
};
