/**
 * BC CRF Government Transfers — every BC payment of $25,000+ to any third
 * party (community org, First Nation, vendor, public-sector entity).
 *
 *   https://catalogue.data.gov.bc.ca/dataset/crf-detailed-schedules-of-payments-government-transfers
 *
 * Published in the Province of British Columbia Public Accounts. The CKAN
 * dataset slices the Public Accounts by fiscal year (FYE 2007 through FYE
 * 2023, each its own datastore-active CSV). 14,589 transfer rows in FYE
 * 2023 alone; ~446 hit `q=first nation` (in FYE 2023, ranging from
 * $24,669 to $476,445 per transfer per ministry).
 *
 * Fields per row: NAME (payee), MINISTRY (which BC ministry paid), AMOUNT.
 * That's it — minimal but sufficient to discover money flowing to a band.
 *
 * Same pattern as bc-ministry-contracts.ts: query latest N fiscal years in
 * parallel + merge. We default to 2 (most recent two FYEs = ~30,000
 * transfers searched), since older years are less actionable.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getJson } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

const PACKAGE_ID = 'crf-detailed-schedules-of-payments-government-transfers';
const CKAN_BASE = 'https://catalogue.data.gov.bc.ca';
const HUMAN_URL = `${CKAN_BASE}/dataset/${PACKAGE_ID}`;
const FISCAL_YEARS_TO_SEARCH = 2;
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

interface TransferRow {
  payee: string;
  ministry: string;
  amount: string;
  amountNumeric?: number;
  fiscalYearLabel: string;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(/[\s,$]/g, ''));
  return isFinite(n) ? n : undefined;
}

async function recentActiveResources(): Promise<Array<{ id: string; name: string }>> {
  const r = (await getJson<PackageShowResponse>(
    `${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`,
  )) as PackageShowResponse;
  return r.result.resources
    .filter((res) => res.datastore_active && res.format?.toUpperCase() === 'CSV')
    // Sort by name desc — names follow "FYE 2023 - Government Transfers" so
    // string-desc puts the most recent fiscal year first.
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, FISCAL_YEARS_TO_SEARCH)
    .map((res) => ({ id: res.id, name: res.name }));
}

async function searchOneResource(
  resourceId: string,
  resourceName: string,
  q: string,
): Promise<TransferRow[]> {
  const params = new URLSearchParams({ resource_id: resourceId, limit: '100' });
  if (q.trim()) params.set('q', q);
  const url = `${CKAN_BASE}/api/3/action/datastore_search?${params.toString()}`;
  const r = (await getJson<DatastoreSearchResponse>(url)) as DatastoreSearchResponse;
  const labelMatch = resourceName.match(/FYE\s*(\d{4})/i);
  const fyLabel = labelMatch ? `FY ending ${labelMatch[1]}` : resourceName;
  return r.result.records.map((rec) => {
    const amount = String(rec['AMOUNT'] ?? '').trim();
    return {
      payee: String(rec['NAME'] ?? '').trim(),
      ministry: String(rec['MINISTRY'] ?? '').trim(),
      amount,
      amountNumeric: parseAmount(amount),
      fiscalYearLabel: fyLabel,
    };
  });
}

const buildHumanUrl = (q: string): string =>
  q.trim() ? `${HUMAN_URL}?q=${encodeURIComponent(q)}` : HUMAN_URL;

const fmtCAD = (n: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

export const bcCrfTransfers: Source = {
  id: 'bc-crf-transfers',
  name: 'BC Government Transfers (≥$25K, Public Accounts)',
  mode: 'money',
  format: 'csv-bulk',
  category: 'Provincial Indigenous grants',
  homepage: HUMAN_URL,
  indigenousFilter: 'keyword-or',
  description:
    'Every BC government payment of $25,000+ to any third party — community orgs, First Nations, vendors, public-sector — as published in the Province of BC Public Accounts. Fields: payee name, ministry, amount. Sliced into fiscal-year CKAN datastore CSVs (14k+ rows/year).',
  searchUrl: (q, opts) => buildHumanUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    try {
      const resources = await recentActiveResources();
      const settled = await Promise.allSettled(
        resources.map((r) => searchOneResource(r.id, r.name, query)),
      );
      const rows: TransferRow[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') rows.push(...s.value);
        else warnings.push(`Resource "${resources[i].name}" failed: ${s.reason}`);
      }
      // Highest-dollar transfers first.
      rows.sort((a, b) => (b.amountNumeric ?? 0) - (a.amountNumeric ?? 0));
      // Aggregate-by-payee summary for the notes line.
      const payeeTotals = new Map<string, { total: number; count: number }>();
      for (const r of rows) {
        if (!r.amountNumeric) continue;
        const cur = payeeTotals.get(r.payee) || { total: 0, count: 0 };
        cur.total += r.amountNumeric;
        cur.count += 1;
        payeeTotals.set(r.payee, cur);
      }
      const items: SourceItem[] = rows.slice(0, MAX_ITEMS).map((r) => ({
        title: r.payee || '(unnamed payee)',
        subtitle: r.ministry ? `Ministry: ${r.ministry}` : undefined,
        snippet: [
          r.amountNumeric ? fmtCAD(r.amountNumeric) : r.amount,
          r.fiscalYearLabel,
        ]
          .filter(Boolean)
          .join(' · '),
        fields: {
          payee: r.payee,
          ministry: r.ministry,
          amount_raw: r.amount,
          ...(r.amountNumeric !== undefined ? { amount_cad: r.amountNumeric } : {}),
          fiscal_year: r.fiscalYearLabel,
        },
      }));
      const aggregateLine = (() => {
        if (payeeTotals.size === 0) return '';
        const top = [...payeeTotals.entries()].sort((a, b) => b[1].total - a[1].total)[0];
        return `Top payee: ${top[0]} — ${fmtCAD(top[1].total)} across ${top[1].count} transfer${top[1].count === 1 ? '' : 's'}.`;
      })();
      return {
        items,
        searchUrl: buildHumanUrl(query),
        notes: [
          `Searched ${resources.length} most recent fiscal year${resources.length === 1 ? '' : 's'}: ${rows.length} matching transfer${rows.length === 1 ? '' : 's'}.${aggregateLine ? ' ' + aggregateLine : ''}`,
        ],
        ...(warnings.length ? { warnings } : {}),
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(query),
        warnings: [`BC CRF CKAN fetch failed (${(err as Error).message}); link only.`],
      };
    }
  },
};
