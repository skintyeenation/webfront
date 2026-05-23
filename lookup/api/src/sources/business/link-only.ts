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

// isc-ibd, ccab and bc-indigenous-listings have real scrapers — see their own
// files in this directory. They are no longer declared as link-only.

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

// fn-fma now has a real scraper — see ./fn-fma.ts.

// Helper to OR in Indigenous keywords for sources that filter purely by keyword.
export { indigenousOrQuery };
