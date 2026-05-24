/**
 * CanadaBuys — the federal Government of Canada procurement portal that
 * replaced buyandsell.gc.ca in 2022. Single listing page mixes three record
 * types (tender notices, award notices, contract history); the search-filter
 * query param keyword-matches across all three.
 *
 *   https://canadabuys.canada.ca/en/tender-opportunities?words=<q>
 *
 * (The page has three input boxes — `keys`, `search_filter`, and `words` — but
 * only `words` actually runs a full-text search. `search_filter` is a
 * category/filter narrow that returns everything when used alone, and `keys`
 * targets the global site-search index, not the tender table.)
 *
 * Plain HTML (no JS challenge, no login), so we fetch + cheerio.
 *
 * Indigenous filter: CanadaBuys has a "Procurement Strategy for Indigenous
 * Business (PSIB)" set-aside flag, but it's only exposed on individual notice
 * pages — not as a listing filter param. So we OR Indigenous keywords into the
 * query string (same approach as MERX).
 */

import * as cheerio from 'cheerio';

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';
import { indigenousOrQuery } from '../helpers.js';

const BASE = 'https://canadabuys.canada.ca';

const buildUrl = (q: string): string =>
  `${BASE}/en/tender-opportunities?words=${encodeURIComponent(q)}`;

interface ParsedRow {
  title: string;
  url: string;
  /** 'tender' = open opportunity; 'award' = award notice; 'contract' = contract history (already-paid). */
  recordType: 'tender' | 'award' | 'contract';
  categoryOrRef?: string;
  openedOrAmended?: string;
  closingOrDate?: string;
  organizationOrValue?: string;
}

/**
 * Each result row is a 5-column table row whose first cell holds the title
 * anchor. Column order:
 *
 *   tender:   title | category   | open/amend | closing  | organization
 *   award:    title | category   | open/amend | publication | organization
 *   contract: vendor| reference# | department | date     | value (CAD)
 *
 * We don't need to relabel the columns per type — generic field names cover it.
 */
function parseRow($el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): ParsedRow | undefined {
  const cells = $el.find('td');
  if (cells.length < 1) return undefined;
  const $titleA = cells.eq(0).find('a').first();
  const href = $titleA.attr('href') || '';
  if (!href || !href.includes('/en/tender-opportunities/')) return undefined;
  let recordType: ParsedRow['recordType'];
  if (href.includes('/tender-notice/')) recordType = 'tender';
  else if (href.includes('/award-notice/')) recordType = 'award';
  else if (href.includes('/contract-history/')) recordType = 'contract';
  else return undefined;
  const title = $titleA.text().trim();
  if (!title) return undefined;
  const txt = (i: number) =>
    cells.length > i ? cells.eq(i).text().replace(/\s+/g, ' ').trim() || undefined : undefined;
  return {
    title,
    url: new URL(href, BASE).toString(),
    recordType,
    categoryOrRef: txt(1),
    openedOrAmended: txt(2),
    closingOrDate: txt(3),
    organizationOrValue: txt(4),
  };
}

function describe(row: ParsedRow): { subtitle?: string; snippet?: string } {
  const labelByType = {
    tender: 'Open tender',
    award: 'Award notice',
    contract: 'Contract history',
  } as const;
  const subtitle = `${labelByType[row.recordType]}${
    row.organizationOrValue ? ` · ${row.organizationOrValue}` : ''
  }`;
  // CanadaBuys uses placeholder dates `9999/12/31` and `2040/12/31` to mean
  // "no closing date set"; suppress those so they don't look like real values.
  const realDate = (d: string | undefined) =>
    d && !/^9999|^2040\/12\/31/.test(d) ? d : undefined;
  const parts: string[] = [];
  if (row.recordType === 'tender') {
    const closing = realDate(row.closingOrDate);
    if (closing) parts.push(`Closes ${closing}`);
    if (row.categoryOrRef) parts.push(row.categoryOrRef);
  } else if (row.recordType === 'award') {
    const pub = realDate(row.closingOrDate);
    if (pub) parts.push(`Awarded ${pub}`);
    if (row.categoryOrRef) parts.push(row.categoryOrRef);
  } else {
    // contract history
    if (row.categoryOrRef) parts.push(`Ref ${row.categoryOrRef}`);
    if (row.openedOrAmended) parts.push(row.openedOrAmended);
    const dt = realDate(row.closingOrDate);
    if (dt) parts.push(dt);
  }
  return { subtitle, snippet: parts.length ? parts.join(' · ') : undefined };
}

export const canadabuys: Source = {
  id: 'canadabuys',
  name: 'CanadaBuys — federal procurement (tenders + awards + contracts)',
  mode: 'money',
  format: 'html-search',
  category: 'Open opportunities — Federal bids',
  homepage: 'https://canadabuys.canada.ca/',
  indigenousFilter: 'keyword-or',
  description:
    'The Government of Canada procurement portal — successor to buyandsell.gc.ca. Searches open tender notices, award notices, and contract history in one query.',
  searchUrl: (q, opts) => buildUrl(opts.indigenousOnly ? indigenousOrQuery(q) : q),
  async scrape(q, opts): Promise<ScrapeResult> {
    const query = opts.indigenousOnly ? indigenousOrQuery(q) : q;
    const url = buildUrl(query);
    let html = '';
    try {
      html = await getText(url);
    } catch (e) {
      return {
        items: [],
        searchUrl: url,
        warnings: [`CanadaBuys fetch failed (${(e as Error).message}); link only.`],
      };
    }
    const $ = cheerio.load(html);
    const rows: ParsedRow[] = [];
    $('table tbody tr').each((_, el) => {
      const row = parseRow($(el), $);
      if (row) rows.push(row);
    });
    // Dedupe by URL (the listing occasionally repeats a tender when it has been
    // amended).
    const seen = new Set<string>();
    const unique = rows.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
    // Tender notices first (active opportunities are what most users want),
    // then awards, then contract history.
    const typeOrder = { tender: 0, award: 1, contract: 2 } as const;
    unique.sort((a, b) => typeOrder[a.recordType] - typeOrder[b.recordType]);
    const items: SourceItem[] = unique.slice(0, 25).map((r) => {
      const { subtitle, snippet } = describe(r);
      return {
        title: r.title,
        subtitle,
        url: r.url,
        snippet,
        fields: {
          record_type: r.recordType,
          ...(r.categoryOrRef ? { category_or_ref: r.categoryOrRef } : {}),
          ...(r.openedOrAmended ? { opened_or_amended: r.openedOrAmended } : {}),
          ...(r.closingOrDate ? { closing_or_date: r.closingOrDate } : {}),
          ...(r.organizationOrValue ? { organization_or_value: r.organizationOrValue } : {}),
        },
      };
    });
    const counts = {
      tender: unique.filter((r) => r.recordType === 'tender').length,
      award: unique.filter((r) => r.recordType === 'award').length,
      contract: unique.filter((r) => r.recordType === 'contract').length,
    };
    return {
      items,
      searchUrl: url,
      notes: [
        `CanadaBuys: ${counts.tender} open tenders · ${counts.award} award notices · ${counts.contract} contract-history rows (first page).`,
      ],
    };
  },
};
