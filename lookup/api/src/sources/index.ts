/**
 * Source catalogue — single source of truth for the CLI picker and the RN app.
 */

import type { Source, SourceMode } from '../types.js';

import { orgbookBc } from './business/orgbook-bc.js';
import { mras } from './business/mras.js';
import { website } from './business/website.js';
import { bcIndigenousListings } from './business/bc-indigenous-listings.js';
import { iscIbd } from './business/isc-ibd.js';
import { ccab } from './business/ccab.js';
import { fnFma } from './nations/fn-fma.js';
import { fnProfiles } from './nations/fn-profiles.js';
import { bcfsc } from './business/bcfsc-safe.js';
import {
  opencorporates,
  corporationsCanada,
  craCharities,
  worksafebc,
  bccsaCor,
  cso,
} from './business/link-only.js';

import { openCanadaContracts } from './money/open-canada-contracts.js';
import { openCanadaGrants } from './money/open-canada-grants.js';
import { openCanadaCkan } from './money/open-canada-ckan.js';
import { bcOpenDataCkan } from './money/bc-open-data-ckan.js';
import { merx } from './money/merx.js';
import { canadabuys } from './money/canadabuys.js';
import { bcMinistryContracts } from './money/bc-ministry-contracts.js';
import { bcCrfTransfers } from './money/bc-crf-transfers.js';
import {
  bcBid,
  civicInfoBc,
  sedarPlus,
  contractsCsv,
  grantsCsv,
  psib,
  innovativeSolutionsCanada,
  defenceProcurement,
  bcHydroTenders,
  iscFundingPrograms,
  chIndigenousLanguages,
  fpcc,
  nacca,
  fedFundingFinder,
  bcafn,
} from './money/link-only.js';

export const ALL_SOURCES: Source[] = [
  // Business
  orgbookBc,
  mras,
  opencorporates,
  corporationsCanada,
  craCharities,
  iscIbd,
  ccab,
  bcIndigenousListings,
  worksafebc,
  bcfsc,
  bccsaCor,
  cso,
  website,
  // Money — federal procurement first (CanadaBuys = the GoC portal),
  // then federal Indigenous-specific grants, then bulk datasets, then
  // provincial / Crown corp / municipal.
  canadabuys,
  openCanadaContracts,
  openCanadaGrants,
  openCanadaCkan,
  fedFundingFinder,
  iscFundingPrograms,
  chIndigenousLanguages,
  nacca,
  psib,
  innovativeSolutionsCanada,
  defenceProcurement,
  merx,
  contractsCsv,
  grantsCsv,
  bcMinistryContracts,
  bcCrfTransfers,
  bcOpenDataCkan,
  fpcc,
  bcafn,
  bcBid,
  bcHydroTenders,
  civicInfoBc,
  sedarPlus,
  // Nations
  fnProfiles,
  fnFma,
];

/** Membership check that handles both single-mode and multi-mode sources. */
function inMode(s: Source, mode: SourceMode): boolean {
  return Array.isArray(s.mode) ? s.mode.includes(mode) : s.mode === mode;
}

export function sourcesByMode(mode: SourceMode): Source[] {
  return ALL_SOURCES.filter((s) => inMode(s, mode));
}

export function sourceById(id: string): Source | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

export function defaultSelected(mode: SourceMode, indigenousOnly: boolean): string[] {
  const list = sourcesByMode(mode);
  return list
    .filter((s) => {
      // Always include scrapable sources by default.
      const isScrapable = !!s.scrape;
      if (indigenousOnly) {
        return isScrapable || s.autoSelectOnIndigenous;
      }
      return isScrapable;
    })
    .map((s) => s.id);
}
