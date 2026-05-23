/**
 * Link-only money sources — emit a clickable deep search URL.
 */

import type { Source } from '../../types.js';

const u = (s: string): string => encodeURIComponent(s);

export const bcBid: Source = {
  id: 'bc-bid',
  name: 'BC Bid — contract awards & opportunities',
  mode: 'money',
  format: 'link-only',
  category: 'Provincial bids',
  homepage: 'https://www.bcbid.gov.bc.ca/',
  indigenousFilter: 'keyword-or',
  description: 'BC provincial + Crown corp tendering and awards. SciQuest portal — no public JSON API.',
  searchUrl: () => 'https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/contract_award_list_public',
};

export const civicInfoBc: Source = {
  id: 'civicinfo-bc',
  name: 'CivicInfo BC — municipal bids',
  mode: 'money',
  format: 'link-only',
  category: 'Provincial bids',
  homepage: 'https://www.civicinfo.bc.ca/bids',
  indigenousFilter: 'keyword-or',
  description: 'Current municipal & local-government bids across BC.',
  searchUrl: (q) => `https://www.civicinfo.bc.ca/bids?keyword=${u(q)}`,
};

export const sedarPlus: Source = {
  id: 'sedar-plus',
  name: 'SEDAR+ — public-company filings',
  mode: 'money',
  format: 'link-only',
  category: 'Public-company filings',
  homepage: 'https://www.sedarplus.ca/',
  indigenousFilter: 'none',
  description: 'Canadian Securities Administrators filings — financials of publicly traded counterparties.',
  searchUrl: () => 'https://www.sedarplus.ca/csa-party/service/create?targetUrl=%2Flandingpage%2Fservice%2Fsearch',
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
