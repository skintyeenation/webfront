/**
 * Link-only business-lookup sources — we emit a deep search URL for each so
 * the user can click through to the form/portal. Documented in
 * docs/research/lookup-endpoints.md.
 */

import type { Source } from '../../types.js';
import { indigenousOrQuery } from '../helpers.js';

const u = (s: string): string => encodeURIComponent(s);

export const opencorporates: Source = {
  id: 'opencorporates',
  name: 'OpenCorporates',
  mode: 'business',
  format: 'json-api',
  category: 'Corporate registries (cross-jurisdiction)',
  homepage: 'https://opencorporates.com/',
  indigenousFilter: 'none',
  requiresAuth: 'api-key',
  description: 'Aggregated corporate registry data across jurisdictions. Free API needs a token.',
  searchUrl: (q) => `https://opencorporates.com/companies?jurisdiction_code=ca_bc&q=${u(q)}`,
};

export const corporationsCanada: Source = {
  id: 'corporations-canada',
  name: 'Corporations Canada (federal)',
  mode: 'business',
  format: 'html-search',
  category: 'Corporate registries (federal)',
  homepage: 'https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html',
  indigenousFilter: 'none',
  description: 'Federally-incorporated companies (CBCA) — directors, registered office.',
  searchUrl: (q) =>
    `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html?V_SEARCH.command=navigate&V_TOKEN=&crpNm=${u(q)}`,
};

export const craCharities: Source = {
  id: 'cra-charities',
  name: 'CRA Charities Listings (T3010)',
  mode: 'business',
  format: 'html-search',
  category: 'Charities',
  homepage: 'https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch?request_locale=en',
  indigenousFilter: 'none',
  description: 'Registered charities — annual T3010 returns: revenue, expenses, salaries, programs.',
  searchUrl: (q) =>
    `https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyAdvncdSrch?request_locale=en&q.bsnssNm=${u(q)}`,
};

export const iscIbd: Source = {
  id: 'isc-ibd',
  name: 'ISC Indigenous Business Directory',
  mode: 'business',
  format: 'html-search',
  category: 'Indigenous-only directories',
  homepage: 'https://www.sac-isc.gc.ca/rea-ibd',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Federal directory of Indigenous-owned businesses (≥51%). Session-form scrape is brittle; link-only here.',
  searchUrl: (q) => `https://www.sac-isc.gc.ca/REA-IBD/eng/search?bsnssNm=${u(q)}`,
};

export const ccab: Source = {
  id: 'ccab',
  name: 'CCAB CAB directory',
  mode: 'business',
  format: 'html-search',
  category: 'Indigenous-only directories',
  homepage: 'https://www.ccab.com/cab-directory/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Canadian Council for Aboriginal Business — audited Certified Aboriginal Business directory.',
  searchUrl: (q) => `https://www.ccab.com/cab-directory/?keyword=${u(q)}`,
};

export const bcIndigenousListings: Source = {
  id: 'bc-indigenous-listings',
  name: 'BC Indigenous Business Listings (open data)',
  mode: 'business',
  format: 'ckan',
  category: 'Indigenous-only directories',
  homepage: 'https://catalogue.data.gov.bc.ca/dataset/bc-indigenous-business-listings',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Provincial open dataset of Indigenous-owned BC businesses.',
  searchUrl: (q) =>
    `https://catalogue.data.gov.bc.ca/dataset?q=${u(`bc-indigenous-business-listings ${q}`)}`,
};

export const worksafebc: Source = {
  id: 'worksafebc',
  name: 'WorkSafeBC clearance',
  mode: 'business',
  format: 'html-search',
  category: 'Safety / certification',
  homepage: 'https://online.worksafebc.com/anonymous/clearance/',
  indigenousFilter: 'none',
  description: 'Verify a contractor\'s WSBC clearance status (good standing).',
  searchUrl: () => 'https://online.worksafebc.com/anonymous/clearance/',
};

export const bcfsc: Source = {
  id: 'bcfsc-safe',
  name: 'BCFSC SAFE Companies',
  mode: 'business',
  format: 'html-search',
  category: 'Safety / certification',
  homepage: 'https://www.bcforestsafe.org/safe-companies/safe-program/safe-companies-list/',
  indigenousFilter: 'none',
  description: 'BC Forest Safety Council — list of SAFE-certified forestry contractors.',
  searchUrl: (q) =>
    `https://www.bcforestsafe.org/?s=${u(q)}`,
};

export const bccsaCor: Source = {
  id: 'bccsa-cor',
  name: 'BCCSA COR / equivalency',
  mode: 'business',
  format: 'html-search',
  category: 'Safety / certification',
  homepage: 'https://www.bccsa.ca/find-a-cor-cor-equivalency-company/',
  indigenousFilter: 'none',
  description: 'BC Construction Safety Alliance — COR-certified construction companies.',
  searchUrl: (q) => `https://www.bccsa.ca/?s=${u(q)}`,
};

export const cso: Source = {
  id: 'cso',
  name: 'Court Services Online (BC civil/Supreme)',
  mode: 'business',
  format: 'html-search',
  category: 'Litigation / public records',
  homepage: 'https://justice.gov.bc.ca/cso/index.do',
  indigenousFilter: 'none',
  description: 'BC court party search — litigation by/against a company.',
  searchUrl: () => 'https://justice.gov.bc.ca/cso/esearch/civil/partySearch.do',
};

export const fnProfiles: Source = {
  id: 'fn-profiles',
  name: 'ISC First Nation Profiles',
  mode: 'business',
  format: 'html-search',
  category: 'First Nations',
  homepage: 'https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Index.aspx?lang=eng',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'Per-band profile: council, demographics, lands, FNFTA disclosures.',
  searchUrl: (q) => `https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/SearchFN.aspx?lang=eng&q=${u(q)}`,
};

export const fnFma: Source = {
  id: 'fn-fma',
  name: 'FN Financial Management Board (certified Nations)',
  mode: 'business',
  format: 'link-only',
  category: 'First Nations',
  homepage: 'https://fnfmb.com/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'List of First Nations certified under the First Nations Fiscal Management Act.',
  searchUrl: () => 'https://fnfmb.com/en/our-work/financial-management-system-certification',
};

// Helper to OR in Indigenous keywords for sources that filter purely by keyword.
export { indigenousOrQuery };
