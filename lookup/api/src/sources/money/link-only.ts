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
  category: 'Open opportunities — Provincial bids',
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
  category: 'Open opportunities — Provincial bids',
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
  category: 'Reference — Public-company filings',
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
  category: 'Historical disclosures — Federal contracts (bulk CSV)',
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
  category: 'Historical disclosures — Federal grants (bulk CSV)',
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
  category: 'Open opportunities — Federal bids',
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
  category: 'Open opportunities — Federal bids',
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
  category: 'Open opportunities — Federal bids',
  homepage: 'https://www.canada.ca/en/department-national-defence/services/procurement.html',
  indigenousFilter: 'none',
  description:
    'Defence-related federal solicitations — current procurements published by the Department of National Defence and PSPC defence acquisition.',
  searchUrl: (q) =>
    q.trim()
      ? `https://canadabuys.canada.ca/en/tender-opportunities?words=${u(q + ' defence')}`
      : 'https://www.canada.ca/en/department-national-defence/services/procurement.html',
};

/**
 * ISC — federal funding programs catalogue. Landing page lists every active
 * grant/contribution program ISC runs (housing, education, infrastructure,
 * economic dev, health, child + family services, …).
 */
export const iscFundingPrograms: Source = {
  id: 'isc-funding',
  name: 'ISC + CIRNAC — Calls for proposals',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  // The canada.ca/.../indigenous-services-canada/services/funding.html URL
  // previously cited here 404s as of 2026. CIRNAC's "Calls for proposals"
  // page is the canonical live listing of currently-open ISC + CIRNAC
  // funding rounds.
  homepage: 'https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'CIRNAC Calls for Proposals — current ISC + CIRNAC funding rounds (Modern treaty, Indigenous Women & 2SLGBTQI+, Food Security Research, Federal Interlocutor, etc.). The same hub is scraped structurally by `available-grants`.',
  searchUrl: () => 'https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249',
};

/**
 * Canadian Heritage — Indigenous Languages funding component. ~$117M/year
 * since 2024, grants to Indigenous-led orgs for language revitalization,
 * documentation, education materials, and immersion programs.
 */
export const chIndigenousLanguages: Source = {
  id: 'ch-indigenous-languages',
  name: 'Canadian Heritage — Indigenous Languages funding',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://www.canada.ca/en/canadian-heritage/services/funding/indigenous-languages.html',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'Indigenous Languages and Cultures program — federal grants to Indigenous-led organizations for language revitalization, documentation, education resources, and immersion programs. Phased applications announced annually.',
  searchUrl: () => 'https://www.canada.ca/en/canadian-heritage/services/funding/indigenous-languages.html',
};

/**
 * First Peoples' Cultural Council — BC's Indigenous-controlled Crown corporation
 * for language + culture funding. Operates several grant streams (B.C. Language
 * Initiative, Cultural Heritage Stewardship Program, Indigenous Arts Program).
 */
export const fpcc: Source = {
  id: 'fpcc',
  name: 'First Peoples\' Cultural Council (BC) — language & arts grants',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial grants',
  homepage: 'https://fpcc.ca/grants/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'BC Crown corporation supporting Indigenous languages, arts, and cultural heritage. Active grant streams: BC Language Initiative, Cultural Heritage Stewardship Program, Indigenous Arts Program, Mentor-Apprentice Program. Open intake.',
  searchUrl: () => 'https://fpcc.ca/grants/',
};

/**
 * NACCA — National Aboriginal Capital Corporations Association. Network of
 * 50+ Aboriginal Financial Institutions across Canada providing capital,
 * loans, and grants to Indigenous entrepreneurs. Includes the Indigenous
 * Growth Fund (~$150M evergreen capital pool).
 */
export const nacca: Source = {
  id: 'nacca',
  name: 'NACCA — Aboriginal Financial Institutions network',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://nacca.ca/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'National Aboriginal Capital Corporations Association — network of 50+ Aboriginal Financial Institutions across Canada. Capital + loans + grants for Indigenous SMEs through Indigenous Growth Fund (~$150M), Indigenous Entrepreneur Loan Fund, and member-AFI products.',
  searchUrl: () => 'https://nacca.ca/',
};

/**
 * BC Funding Programs index — direct link into the federal Government of
 * Canada grants finder filtered to Indigenous-targeted funding.
 */
export const fedFundingFinder: Source = {
  id: 'fed-funding-finder',
  name: 'Federal Funding Finder — Indigenous filter',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://www.canada.ca/en/services/funding.html',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'Government of Canada grants finder — cross-departmental search of every federal grant + contribution. Deep-linked with "Indigenous" keyword pre-applied to surface programs from ISC, CIRNAC, Heritage, ESDC, ISED, and more.',
  searchUrl: (q) =>
    q.trim()
      ? `https://www.canada.ca/en/services/funding.html?q=${u(q + ' indigenous')}`
      : 'https://www.canada.ca/en/services/funding.html?q=indigenous',
};

/**
 * BCAFN (BC Assembly of First Nations) — political organization representing
 * 203 First Nations in BC. Maintains a funding/announcements page that lists
 * provincial + federal opportunities relevant to BC First Nations.
 */
export const bcafn: Source = {
  id: 'bcafn',
  name: 'BCAFN — BC Assembly of First Nations',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial grants',
  homepage: 'https://www.bcafn.ca/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'BC Assembly of First Nations — political org representing 203 BC First Nations. Funding announcements, capacity-building grants, sector-specific (housing, fisheries, gov-to-gov) opportunities aggregated for member bands.',
  searchUrl: () => 'https://www.bcafn.ca/',
};

export const bcHydroTenders: Source = {
  id: 'bc-hydro-tenders',
  name: 'BC Hydro — bid opportunities (Crown corp)',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial bids',
  homepage: 'https://www.bchydro.com/work-with-us/suppliers/bid-opportunities.html',
  indigenousFilter: 'keyword-or',
  description:
    'BC Hydro tender opportunities (Crown corp procurement). Many BC Hydro RFPs are also mirrored on BC Bid; this is the direct supplier portal.',
  searchUrl: () => 'https://www.bchydro.com/work-with-us/suppliers/bid-opportunities.html',
};
