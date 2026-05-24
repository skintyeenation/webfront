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
import { bcBid, civicInfoBc, sedarPlus, contractsCsv, grantsCsv } from './money/link-only.js';

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
  // Money
  openCanadaContracts,
  openCanadaGrants,
  openCanadaCkan,
  bcOpenDataCkan,
  merx,
  bcBid,
  civicInfoBc,
  sedarPlus,
  contractsCsv,
  grantsCsv,
  // Nations
  fnProfiles,
  fnFma,
];

export function sourcesByMode(mode: SourceMode): Source[] {
  return ALL_SOURCES.filter((s) => s.mode === mode);
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
