/**
 * Bulk band registry — Indian Act registered population CSV from ISC's
 * Open Government dataset. Includes every band registered under the
 * Indian Act with band number, name, region, province, and a 2022
 * population snapshot. Much faster than puppeteering FNListGrid.
 *
 * Dataset: https://open.canada.ca/data/en/dataset/6a493874-853b-4dbf-869d-22544fec79ec
 */

import { getText } from '../../util/http.js';

const CSV_URL =
  'https://open.canada.ca/data/dataset/6a493874-853b-4dbf-869d-22544fec79ec/resource/b4babb86-4e7a-433e-a183-370b9f0678a1/download/edma-dfm-data-management-open-data-2024-2025-dr000277-iab-registered-population-report-2022-data.csv';

export interface RegistryBand {
  bandNumber: string;
  name: string;
  region: string; // FR-labelled region (e.g. "Colombie-Britannique", "Atlantique")
  province: string; // FR-labelled province
  district?: string;
  population: number; // total registered (2022)
}

/**
 * Map the dataset's regional labels onto the ISC numeric region ids we use
 * in fn-profiles.ts (`plcMain_ddlRegion` options). Same as the labels in
 * NationsLookup's REGIONS list, in FR (the CSV uses French region names).
 */
const REGION_TO_ID: Record<string, string> = {
  'colombie-britannique': '9',
  yukon: '8',
  alberta: '7',
  saskatchewan: '6',
  manitoba: '5',
  ontario: '4',
  québec: '3',
  quebec: '3',
  atlantique: '2',
  'territoires du nord-ouest': '0',
  'territoires-du-nord-ouest': '0',
};

function parseCsvLine(line: string): string[] {
  // Tiny CSV parser — the ISC file has no embedded commas/quotes in the
  // columns we care about, but be safe.
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inStr && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inStr = !inStr;
    } else if (c === ',' && !inStr) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Fetch + parse the band CSV. ~66 KB, parses in <50 ms. */
export async function fetchRegisteredBands(): Promise<RegistryBand[]> {
  const text = await getText(CSV_URL, {
    headers: {
      // The dataset CDN's WAF rejects our default Mozilla-compatible UA
      // but accepts a real Chrome string.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  // First line is BOM + header; the columns are FR-labelled.
  const headerCols = parseCsvLine(lines[0].replace(/^﻿/, ''));
  const colNo = headerCols.indexOf('numero_groupe_enregistrement');
  const colName = headerCols.indexOf('nom_groupe_enregistrement');
  const colRegion = headerCols.indexOf('region');
  const colProv = headerCols.indexOf('prov_terr');
  const colDistrict = headerCols.indexOf('district');
  const colPop = headerCols.indexOf('pop_total_total');
  const rows: RegistryBand[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (!cells[colNo] || !cells[colName]) continue;
    rows.push({
      bandNumber: cells[colNo].trim(),
      name: cells[colName].trim(),
      region: cells[colRegion]?.trim() || '',
      province: cells[colProv]?.trim() || '',
      district: cells[colDistrict]?.trim() && cells[colDistrict].trim() !== 'NA' ? cells[colDistrict].trim() : undefined,
      population: Number(cells[colPop] || 0) || 0,
    });
  }
  // Sort by name for a predictable list.
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/**
 * Filter the full registry to one ISC region (e.g. '9' for BC). Region
 * matching is on the dataset's FR region label.
 */
export function filterByRegionId(all: RegistryBand[], regionId: string): RegistryBand[] {
  return all.filter((b) => REGION_TO_ID[b.region.toLowerCase()] === regionId);
}
