/**
 * Band detail aggregator — fans out to the per-band sub-pages on the federal
 * First Nation Profiles site and returns structured data for each section.
 *
 * URL pattern:
 *   https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/<page>.aspx?BAND_NUMBER=<n>&lang=eng
 *
 * Sections supported:
 *   general     — FNMain.aspx          (official name, number, address, postal, phone, fax)
 *   governance  — FNGovernance.aspx    (chief + council members)
 *   reserves    — FNReserves.aspx      (named reserves)
 *   population  — FNRegPopulation.aspx (registered population breakdown — great for charts)
 *   funds       — FederalFundsMain.aspx (annual federal-funding PDFs)
 *   fnfta       — FNFTA Financial Transparency Act link
 *
 * Driven by puppeteer because the site is ASP.NET with viewstate.
 */

import { getJson } from '../../util/http.js';
import { withPage } from '../../util/puppet.js';

const BASE = 'https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search';

export type Section = 'general' | 'governance' | 'reserves' | 'population' | 'funds' | 'fnfta' | 'geo';

export interface PairList { [label: string]: string }

export interface PopulationBreakdown {
  rows: Array<{ label: string; count: number }>;
  total: number;
  asOf?: string;
  /** Useful pre-rolled summaries for charts. */
  summary: {
    onReserve: number;
    offReserve: number;
    onOtherReserve: number;
    onCrownLand: number;
    male: number;
    female: number;
  };
}

export interface FundsRow {
  fiscalYear: string;
  documentName: string;
  documentUrl?: string;
}

export interface GeoFeature {
  /** Reserve name as resolved against the federal Aboriginal Lands layer. */
  name: string;
  /** CLSS admin-area id (e.g. "07465" for SKINS LAKE 15). */
  adminAreaId?: string;
  /** Polygon rings in [lng, lat] WGS84. */
  rings: number[][][];
  /** [lng, lat] — mean of the first ring; good enough to drop a pin. */
  centroid: [number, number];
  /** Axis-aligned bounding box [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number];
}

export interface GeoSection {
  features: GeoFeature[];
  /** Bounding box covering every reserve we resolved. */
  bbox?: [number, number, number, number];
  warnings?: string[];
}

export interface BandDetail {
  bandNumber: string;
  general?: PairList & {
    officialName?: string;
    address?: string;
    postalCode?: string;
    phone?: string;
    fax?: string;
  };
  governance?: { rows: Array<{ role?: string; name?: string; term?: string }>; raw?: string };
  reserves?: { rows: Array<{ name?: string; size?: string; community?: string; url?: string }>; raw?: string };
  population?: PopulationBreakdown;
  funds?: { rows: FundsRow[]; raw?: string };
  fnfta?: { searchUrl: string };
  geo?: GeoSection;
  /** Section-level errors. */
  errors?: Record<string, string>;
}

const ALL_SECTIONS: Section[] = ['general', 'governance', 'reserves', 'population', 'funds', 'fnfta', 'geo'];

/**
 * Federal NRCan CLSS Aboriginal Lands MapServer — used to resolve each
 * reserve name to a polygon. Returns GeoJSON in WGS84 (outSR=4326).
 */
const CLSS_LAYER =
  'https://proxyinternet.nrcan.gc.ca/arcgis/rest/services/CLSS-SATC/CLSS_Administrative_Boundaries/MapServer/0/query';

async function fetchReserveGeo(name: string): Promise<GeoFeature | undefined> {
  // SQL-escape apostrophes (TATLA'T EAST 2 → TATLA''T EAST 2) then URL-encode.
  const sqlSafe = name.replace(/'/g, "''");
  const params = new URLSearchParams({
    where: `adminAreaNameEng LIKE '%${sqlSafe}%'`,
    outFields: 'adminAreaNameEng,adminAreaId',
    f: 'geojson',
    outSR: '4326',
    returnGeometry: 'true',
  });
  const url = `${CLSS_LAYER}?${params.toString()}`;
  let data: any;
  try {
    data = await getJson<any>(url);
  } catch {
    return undefined;
  }
  const feat = (data.features ?? [])[0];
  if (!feat || !feat.geometry) return undefined;
  const geom = feat.geometry as { type: string; coordinates: any };
  let rings: number[][][] = [];
  if (geom.type === 'Polygon') rings = geom.coordinates as number[][][];
  else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates as number[][][][]) rings.push(...poly);
  }
  if (!rings.length) return undefined;
  // Centroid + bbox over the first ring.
  const flat = rings[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of flat) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLng += lng;
    sumLat += lat;
  }
  return {
    name: feat.properties?.adminAreaNameEng ?? name,
    adminAreaId: feat.properties?.adminAreaId,
    rings,
    centroid: [sumLng / flat.length, sumLat / flat.length],
    bbox: [minLng, minLat, maxLng, maxLat],
  };
}

async function getGeoFor(reserveNames: string[]): Promise<GeoSection> {
  const features: GeoFeature[] = [];
  const warnings: string[] = [];
  for (const n of reserveNames) {
    const g = await fetchReserveGeo(n);
    if (g) features.push(g);
    else warnings.push(`No CLSS polygon for "${n}"`);
  }
  let bbox: GeoSection['bbox'];
  if (features.length) {
    bbox = features.reduce(
      (acc, f) => [
        Math.min(acc[0], f.bbox[0]),
        Math.min(acc[1], f.bbox[1]),
        Math.max(acc[2], f.bbox[2]),
        Math.max(acc[3], f.bbox[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
    );
  }
  return { features, bbox, warnings: warnings.length ? warnings : undefined };
}

const labelMap: Record<string, string> = {
  'Official Name': 'officialName',
  Number: 'number',
  Address: 'address',
  'Postal code': 'postalCode',
  'Postal Code': 'postalCode',
  Phone: 'phone',
  Fax: 'fax',
};

export async function getBandDetail(bandNumber: string, sections: Section[] = ALL_SECTIONS): Promise<BandDetail> {
  const detail: BandDetail = { bandNumber, errors: {} };

  // Reuse a single puppeteer page across all section fetches — cuts wall-clock
  // by sharing browser session + cookies.
  await withPage(
    async (page) => {
      for (const section of sections) {
        try {
          if (section === 'fnfta') {
            detail.fnfta = { searchUrl: `https://www.sac-isc.gc.ca/eng/1322056355024/1571080676226` };
            continue;
          }
          if (section === 'geo') {
            // Need the reserve list. If we haven't scraped reserves yet,
            // do it implicitly (the geo lookup is keyed by reserve name).
            if (!detail.reserves) {
              const urls = { reserves: `${BASE}/FNReserves.aspx?BAND_NUMBER=${bandNumber}&lang=eng` };
              await page.goto(urls.reserves, { waitUntil: 'networkidle2', timeout: 25000 });
              const data = await page.evaluate(() => {
                const tables = Array.from(document.querySelectorAll('main table, [property="mainContentOfPage"] table'));
                for (const t of tables) {
                  const headers = Array.from(t.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(
                    (c) => (c.textContent || '').trim().toLowerCase(),
                  );
                  if (!headers.length || !/(name|reserve)/i.test(headers.join(' '))) continue;
                  const trs = Array.from(t.querySelectorAll('tbody tr, tr')).slice(1, 50);
                  const names: string[] = [];
                  for (const tr of trs) {
                    const t0 = (tr.querySelector('td')?.textContent || '').trim();
                    if (t0) names.push(t0);
                  }
                  return names;
                }
                return [];
              });
              detail.reserves = { rows: data.map((name: string) => ({ name })) };
            }
            const names = (detail.reserves?.rows ?? []).map((r) => r.name).filter(Boolean) as string[];
            detail.geo = await getGeoFor(names);
            continue;
          }
          const urls: Record<Section, string> = {
            general: `${BASE}/FNMain.aspx?BAND_NUMBER=${bandNumber}&lang=eng`,
            governance: `${BASE}/FNGovernance.aspx?BAND_NUMBER=${bandNumber}&lang=eng`,
            reserves: `${BASE}/FNReserves.aspx?BAND_NUMBER=${bandNumber}&lang=eng`,
            population: `${BASE}/FNRegPopulation.aspx?BAND_NUMBER=${bandNumber}&lang=eng`,
            funds: `${BASE}/FederalFundsMain.aspx?BAND_NUMBER=${bandNumber}&lang=eng`,
            fnfta: '',
            geo: '',
          };
          const url = urls[section];
          if (!url) continue;
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
          if (section === 'general') {
            detail.general = await page.evaluate((labelMapJson) => {
              const map = JSON.parse(labelMapJson) as Record<string, string>;
              const pairs: any = {};
              // FN Profiles uses Bootstrap col-md-2 grid pairs:
              //   <div class="col-md-2"><span class="control-label">Label</span></div>
              //   <div class="col-md-…"><span ...>Value</span></div>
              document.querySelectorAll('span.control-label, [id^="plcMain_lbl"]').forEach((labelEl) => {
                const label = (labelEl.textContent || '').replace(/[:\s]+$/, '').trim();
                if (!map[label]) return;
                const col = labelEl.closest('[class*="col-"]');
                const valEl = col?.nextElementSibling;
                const v = (valEl?.textContent || '').replace(/\s+/g, ' ').trim();
                if (v) pairs[map[label]] = v;
              });
              return pairs;
            }, JSON.stringify(labelMap));
          } else if (section === 'population') {
            detail.population = await page.evaluate(() => {
              const rows: Array<{ label: string; count: number }> = [];
              let asOf = '';
              // Find the table whose header has "Residency" + "# of People".
              const tables = Array.from(document.querySelectorAll('table'));
              for (const t of tables) {
                const headerCells = Array.from(t.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map((c) => (c.textContent || '').trim());
                if (!headerCells.some((h) => /Residency/i.test(h))) continue;
                const trs = Array.from(t.querySelectorAll('tbody tr, tr')).filter((tr) => tr.querySelectorAll('td').length === 2);
                for (const tr of trs) {
                  const tds = Array.from(tr.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
                  if (!tds[0] || tds[0] === 'Residency') continue;
                  const n = Number(tds[1].replace(/[^\d]/g, ''));
                  if (!Number.isFinite(n)) continue;
                  rows.push({ label: tds[0], count: n });
                }
                break;
              }
              const m = document.body.textContent?.match(/Registered Population as of\s+([^\n<]+?)\s*(?:Residency|<)/i);
              if (m) asOf = m[1].trim();
              const totalRow = rows.find((r) => /Total Registered Population/i.test(r.label));
              const total = totalRow ? totalRow.count : rows.reduce((s, r) => s + r.count, 0);
              const sum = (re: RegExp) => rows.filter((r) => re.test(r.label)).reduce((s, r) => s + r.count, 0);
              const summary = {
                onReserve: sum(/On Own Reserve/i),
                offReserve: sum(/Off Reserve/i),
                onOtherReserve: sum(/On Other Reserves/i),
                onCrownLand: sum(/Crown Land/i),
                // Use word boundaries — `/Males/i` matches "Females" too because
                // the substring "ales" appears in both ("FE-MALES").
                male: sum(/\bMales\b/i),
                female: sum(/\bFemales\b/i),
              };
              return { rows: rows.filter((r) => !/Total Registered/i.test(r.label)), total, asOf, summary };
            });
          } else if (section === 'funds') {
            detail.funds = await page.evaluate((base) => {
              const rows: Array<{ fiscalYear: string; documentName: string; documentUrl?: string }> = [];
              const tables = Array.from(document.querySelectorAll('table'));
              for (const t of tables) {
                const headerCells = Array.from(t.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map((c) => (c.textContent || '').trim());
                if (!headerCells.some((h) => /Fiscal Year/i.test(h))) continue;
                const trs = Array.from(t.querySelectorAll('tbody tr, tr')).filter((tr) => tr.querySelectorAll('td').length >= 2);
                for (const tr of trs) {
                  const tds = Array.from(tr.querySelectorAll('td'));
                  const fy = (tds[0].textContent || '').trim();
                  const linkEl = tds[1].querySelector('a');
                  const name = (tds[1].textContent || '').trim();
                  if (!fy || /Fiscal Year/i.test(fy)) continue;
                  const href = linkEl?.getAttribute('href') ?? undefined;
                  rows.push({ fiscalYear: fy, documentName: name, documentUrl: href ? new URL(href, base + '/').toString() : undefined });
                }
                break;
              }
              return { rows };
            }, BASE);
          } else if (section === 'governance' || section === 'reserves') {
            const data = await page.evaluate(() => {
              const tables = Array.from(document.querySelectorAll('main table, [property="mainContentOfPage"] table'));
              for (const t of tables) {
                const headerCells = Array.from(t.querySelectorAll('thead th, tr:first-child th, tr:first-child td'));
                const headers = headerCells.map((c) => (c.textContent || '').trim());
                const headersLower = headers.map((h) => h.toLowerCase());
                if (!headersLower.length || headersLower.every((h) => /share|social|email/i.test(h))) continue;
                if (!/(name|role|reserve|chief|council|term|surname|given|title|location|hectare|area)/i.test(headersLower.join(' '))) continue;
                const trs = Array.from(t.querySelectorAll('tbody tr, tr')).slice(1, 50);
                const rows = trs.map((tr) => {
                  const cells = Array.from(tr.querySelectorAll('td'));
                  // Skip rows that are repeated headers.
                  const texts = cells.map((c) => (c.textContent || '').trim());
                  if (texts.join('') === '' || texts.join('|') === headers.join('|')) return null;
                  const obj: any = {};
                  headersLower.forEach((h, i) => {
                    if (texts[i]) obj[h] = texts[i];
                  });
                  // Capture any link in the row — reserves link to per-reserve detail.
                  const link = tr.querySelector('a[href*="Reserve"], a[href*="BAND_NUMBER"]') as HTMLAnchorElement | null;
                  if (link) obj.__href = new URL(link.getAttribute('href') || '', location.href).toString();
                  return obj;
                }).filter(Boolean) as any[];
                return { headers: headersLower, rows };
              }
              return { headers: [], rows: [] };
            });
            if (section === 'governance') {
              detail.governance = {
                rows: data.rows.map((r: any) => {
                  const given = r['given name'] || r['given'] || '';
                  const surname = r['surname'] || '';
                  const name = (r.name as string) || [given, surname].filter(Boolean).join(' ').trim() || undefined;
                  return {
                    role: r.title || r.role || r.position,
                    name,
                    term: r['expiry date'] ? `Term ends ${r['expiry date']}` : r.term || r.expiry,
                  };
                }).filter((r: any) => r.role || r.name),
              };
            } else {
              detail.reserves = {
                rows: data.rows.map((r: any) => ({
                  name: r.name || r['reserve name'] || r['reserve'],
                  size: r['size'] || r['area'] || r['hectares'] || r['area (ha)'],
                  community: r.community || r.location,
                  // Stash detail-page URL so the UI can deep-link.
                  ...(r.__href ? { url: r.__href } : {}),
                })).filter((r: any) => r.name),
              };
            }
          }
        } catch (err) {
          (detail.errors as Record<string, string>)[section] = (err as Error).message;
        }
      }
    },
    { timeoutMs: 60000 },
  );

  if (detail.errors && Object.keys(detail.errors).length === 0) delete detail.errors;
  return detail;
}
