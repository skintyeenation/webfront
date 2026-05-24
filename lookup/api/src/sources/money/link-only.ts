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
 * Canada Business Benefits Finder — the canonical successor to the old
 * `canada.ca/en/services/funding.html` page (which 404s as of 2026). The
 * page itself has a "Take the survey" wizard that filters across federal
 * + provincial grants + contributions + loans; deep-linking with a `?q=`
 * param doesn't work, so we just link the landing.
 */
export const fedFundingFinder: Source = {
  id: 'fed-funding-finder',
  name: 'Canada Business Benefits Finder',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://www.canada.ca/en/services/business/grants.html',
  indigenousFilter: 'keyword-or',
  description:
    'Government of Canada Business Benefits Finder — cross-departmental + cross-provincial grants, contributions, loans wizard. Filter for Indigenous-eligible streams in the on-page survey.',
  searchUrl: () => 'https://www.canada.ca/en/services/business/grants.html',
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

/**
 * First Nations Health Authority — receives federal + BC block funding,
 * disburses to member Nations for community health, mental wellness,
 * harm reduction.
 */
export const fnha: Source = {
  id: 'fnha',
  name: 'First Nations Health Authority (BC)',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial grants',
  homepage: 'https://www.fnha.ca/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'BC-wide First Nations health body; runs grants to member Nations for community health programs, mental wellness, harm reduction, healthy living.',
  searchUrl: () => 'https://www.fnha.ca/',
};

/**
 * Indigenous Tourism BC — sector-specific funding stream tied to
 * Destination BC's tourism marketing.
 */
export const indigenousTourismBc: Source = {
  id: 'indigenous-tourism-bc',
  name: 'Indigenous Tourism BC',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial grants',
  // The indigenoustourismbc.com domain is now fully squatted by SearchHounds
  // (verified Puppeteer 2026-05; every path resolves to a domain-parking
  // landing). ITBC's live site has moved to indigenousbc.com.
  homepage: 'https://www.indigenousbc.com/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'BC Indigenous-led tourism marketing + business-development body. Sector-specific funding for Indigenous tourism operators (the old indigenoustourismbc.com domain is now squatted — indigenousbc.com is the canonical).',
  searchUrl: () => 'https://www.indigenousbc.com/',
};

/**
 * Indigenous Tourism Association of Canada (ITAC) — national counterpart;
 * runs the Indigenous Tourism Stimulus Development Fund jointly with NACCA.
 */
export const itac: Source = {
  id: 'itac',
  name: 'ITAC — Indigenous Tourism Association of Canada',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://indigenoustourism.ca/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'National Indigenous tourism body; runs the Indigenous Tourism Stimulus Development Fund jointly with NACCA and sector-specific programs.',
  searchUrl: () => 'https://indigenoustourism.ca/',
};

/**
 * Inspirit Foundation — Indigenous youth + intercultural granting.
 */
export const inspiritFoundation: Source = {
  id: 'inspirit-foundation',
  name: 'Inspirit Foundation — Indigenous youth & intercultural',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://inspiritfoundation.org/grants/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'Charitable foundation supporting Indigenous youth + intercultural / interfaith programs across Canada.',
  searchUrl: () => 'https://inspiritfoundation.org/grants/',
};

/**
 * Vancouver Foundation — BC community foundation with Indigenous priority
 * granting streams.
 */
export const vancouverFoundation: Source = {
  id: 'vancouver-foundation',
  name: 'Vancouver Foundation — community grants',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Provincial grants',
  homepage: 'https://www.vancouverfoundation.ca/grants',
  indigenousFilter: 'keyword-or',
  description:
    'BC community foundation (one of Canada\'s largest). Multiple granting streams, Indigenous-priority categories embedded across portfolios.',
  searchUrl: () => 'https://www.vancouverfoundation.ca/grants',
};

/**
 * Canada Indigenous Loan Guarantee Corporation (CILGC) — federal
 * loan-guarantee vehicle administered by ISED to help Nations equity-acquire
 * major resource and infrastructure projects (TMX, LNG Canada, etc.).
 *
 * The original Finance Canada landing page 404s as of 2026-05; the program
 * was moved under ISED's portfolio after CDEV reorganisation. The ISED
 * splash page is the current canonical pointer.
 */
export const tmxIndigenousLoanGuarantee: Source = {
  id: 'tmx-loan-guarantee',
  name: 'Canada Indigenous Loan Guarantee Corporation (CILGC)',
  mode: 'money',
  format: 'link-only',
  category: 'Open opportunities — Federal grants',
  homepage: 'https://ised-isde.canada.ca/site/canada-indigenous-loan-guarantee-corporation/en',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description:
    'Federal loan-guarantee vehicle ($5B envelope) for Nations to equity-acquire major resource and infrastructure projects (TMX, LNG Canada, etc.). Now administered by ISED via the Canada Indigenous Loan Guarantee Corporation.',
  searchUrl: () =>
    'https://ised-isde.canada.ca/site/canada-indigenous-loan-guarantee-corporation/en',
};

/**
 * Imagine Canada Grant Connect — paid charity-funding database (~$1k/yr).
 * Link-only entry so users know it exists; paywall means no automation.
 */
export const grantConnect: Source = {
  id: 'grant-connect',
  name: 'Imagine Canada — Grant Connect (paid)',
  mode: 'money',
  format: 'link-only',
  category: 'Reference — Public-company filings',
  homepage: 'https://grantconnect.ca/',
  indigenousFilter: 'keyword-or',
  requiresAuth: 'paid',
  description:
    'Paid charity-funding database (~$1k/yr) aggregating Canadian foundations, corporate giving, and government grants. Paywall — link-only.',
  searchUrl: () => 'https://grantconnect.ca/',
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
