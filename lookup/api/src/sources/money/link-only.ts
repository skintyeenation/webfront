/**
 * Link-only money sources — emit a clickable deep search URL.
 */

import type { Source } from '../../types.js';

const u = (s: string): string => encodeURIComponent(s);

export const bcBid: Source = {
  id: 'bc-bid',
  name: 'BC Bid — opportunities & awards (public)',
  mode: 'money',
  format: 'link-only',
  category: 'Provincial bids',
  homepage: 'https://www.bcbid.gov.bc.ca/',
  indigenousFilter: 'keyword-or',
  description:
    'BC provincial + Crown corp tendering. The "Browse Public Opportunities" page is open without login (your browser handles the SciQuest browser_check). The award list itself requires a free SciQuest account.',
  searchUrl: () => 'https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/request_browse_public',
};

export const civicInfoBc: Source = {
  id: 'civicinfo-bc',
  name: 'CivicInfo BC — municipal bids',
  mode: 'money',
  format: 'link-only',
  category: 'Provincial bids',
  homepage: 'https://www.civicinfo.bc.ca/bids',
  indigenousFilter: 'keyword-or',
  description:
    'Current municipal & local-government bids across BC. Cloudflare-protected so we cannot scrape — the link opens the public bid list, and the site\'s own keyword box filters from there.',
  searchUrl: (q) => (q.trim() ? `https://www.civicinfo.bc.ca/bids?keyword=${u(q)}` : 'https://www.civicinfo.bc.ca/bids'),
};

export const sedarPlus: Source = {
  id: 'sedar-plus',
  name: 'SEDAR+ — public-company filings',
  mode: 'money',
  format: 'link-only',
  category: 'Public-company filings',
  homepage: 'https://www.sedarplus.ca/',
  indigenousFilter: 'none',
  description:
    'Canadian Securities Administrators filings — financials of publicly traded counterparties.',
  searchUrl: () =>
    'https://www.sedarplus.ca/csa-party/service/create?targetUrl=%2Flandingpage%2Fservice%2Fsearch',
};

export const contractsCsv: Source = {
  id: 'contracts-csv',
  name: 'Federal Contracts (bulk CSV)',
  mode: 'money',
  format: 'csv-bulk',
  category: 'Federal contracts / grants',
  homepage: 'https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b',
  indigenousFilter: 'flag',
  description: 'Bulk CSV of all disclosed federal contracts >$10K. Useful for offline keyword scans.',
  searchUrl: () =>
    'https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv',
};

export const grantsCsv: Source = {
  id: 'grants-csv',
  name: 'Federal Grants & Contributions (bulk CSV)',
  mode: 'money',
  format: 'csv-bulk',
  category: 'Federal contracts / grants',
  homepage: 'https://open.canada.ca/data/en/dataset/432527ab-7aac-45b5-81d6-7597107a7013',
  indigenousFilter: 'org-filter',
  description: 'Bulk CSV of all disclosed federal grants & contributions.',
  searchUrl: () => 'https://open.canada.ca/data/en/dataset/432527ab-7aac-45b5-81d6-7597107a7013',
};

/**
 * Procurement Strategy for Indigenous Business (PSIB) — federal program that
 * lets buyers set aside contracts for Indigenous-owned firms. The set-aside
 * flag is searchable on CanadaBuys but only as a per-notice property; this is
 * a deep link to the program landing page + the live PSIB inventory.
 */
export const psib: Source = {
  id: 'psib',
  name: 'PSIB — Indigenous business set-aside contracts',
  mode: 'money',
  format: 'link-only',
  category: 'Federal bids',
  homepage: 'https://www.sac-isc.gc.ca/eng/1100100032779/1610723194465',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'Procurement Strategy for Indigenous Business — federal contracts set aside for Indigenous-owned suppliers. Includes the program rules and the live IBD (Indigenous Business Directory) lookup.',
  searchUrl: (q) =>
    q.trim()
      ? `https://canadabuys.canada.ca/en/tender-opportunities?words=${u(q + ' indigenous set-aside')}`
      : 'https://www.sac-isc.gc.ca/eng/1100100032779/1610723194465',
};

export const innovativeSolutionsCanada: Source = {
  id: 'isc-challenges',
  name: 'Innovative Solutions Canada — R&D challenges',
  mode: 'money',
  format: 'link-only',
  category: 'Federal bids',
  homepage: 'https://ised-isde.canada.ca/site/innovative-solutions-canada/en',
  indigenousFilter: 'none',
  description:
    'Federal R&D challenge program — early-stage funding (up to $1M Phase 1, $2M Phase 2) for Canadian small businesses solving departmental tech problems. New challenges posted every ~quarter.',
  searchUrl: () =>
    'https://ised-isde.canada.ca/site/innovative-solutions-canada/en/funding-opportunities/current-funding-opportunities',
};

export const defenceProcurement: Source = {
  id: 'defence-procurement',
  name: 'Defence procurement (DND/PSPC)',
  mode: 'money',
  format: 'link-only',
  category: 'Federal bids',
  homepage: 'https://www.canada.ca/en/department-national-defence/services/procurement.html',
  indigenousFilter: 'none',
  description:
    'Defence-related federal solicitations — current procurements published by the Department of National Defence and PSPC defence acquisition.',
  searchUrl: (q) =>
    q.trim()
      ? `https://canadabuys.canada.ca/en/tender-opportunities?words=${u(q + ' defence')}`
      : 'https://www.canada.ca/en/department-national-defence/services/procurement.html',
};

export const bcHydroTenders: Source = {
  id: 'bc-hydro-tenders',
  name: 'BC Hydro — bid opportunities (Crown corp)',
  mode: 'money',
  format: 'link-only',
  category: 'Provincial bids',
  homepage: 'https://www.bchydro.com/work-with-us/suppliers/bid-opportunities.html',
  indigenousFilter: 'keyword-or',
  description:
    'BC Hydro tender opportunities (Crown corp procurement). Many BC Hydro RFPs are also mirrored on BC Bid; this is the direct supplier portal.',
  searchUrl: () => 'https://www.bchydro.com/work-with-us/suppliers/bid-opportunities.html',
};
