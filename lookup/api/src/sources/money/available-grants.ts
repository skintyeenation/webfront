/**
 * Available grants — federal & provincial programs accepting applications.
 *
 * The user asked: "how do I find *available* grants, not grants that have been
 * funded for an entity already?" Open Canada's grants Solr search is
 * historical-only (it's the Proactive Disclosure of past payouts). The
 * federal-level open-applications inventory is fragmented across departmental
 * funding-hub HTML pages — there is no single JSON catalogue. Verified options:
 *
 *   - canada.ca/en/services/funding.html — 404 with any keyword (the page is
 *     a portal landing, not a search).
 *   - innovation.ised-isde.canada.ca — Innovation Canada's program finder, but
 *     it requires Salesforce login (401 on the API endpoint).
 *
 * What works: departmental funding-hub pages list 20–95 program anchors each.
 * Puppeteer-render the hub, extract <main> anchors with usable text, cache 24h.
 * Then in-memory keyword-filter on every search.
 *
 * Hubs we scrape (in this order):
 *
 *   - CIRNAC (Crown-Indigenous Relations) Calls for Proposals — current ones
 *     ISC + CIRNAC are actively calling for
 *   - Canadian Heritage funding — arts, culture, sport, heritage stewardship,
 *     incl. the Indigenous Languages and Cultures Program
 *   - ESDC (Employment and Social Development Canada) — jobs, skills,
 *     community-building, incl. ISET (Indigenous Skills and Employment
 *     Training) and Reaching Home
 *
 * Each program shows up as one Item with `agency` + `apply_url` fields.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { withPage } from '../../util/puppet.js';
import { BUCKETS, ageMs, get as storeGet, put as storePut } from '../../util/store.js';

interface HubProgram {
  /** Department / agency that runs the program (e.g. "Canadian Heritage"). */
  agency: string;
  /** Hub URL (where we found the link). */
  hubUrl: string;
  /** Program name as it appears on the hub. */
  name: string;
  /** Absolute apply URL. */
  applyUrl: string;
}

interface HubDef {
  agency: string;
  url: string;
  /** Heuristic: only keep anchors with text in this length range. Filters out
   *  "Skip to main content" and the like. */
  minTextLen: number;
  maxTextLen: number;
}

const HUBS: HubDef[] = [
  {
    agency: 'CIRNAC — Crown-Indigenous Relations & Northern Affairs',
    url: 'https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249',
    minTextLen: 8,
    maxTextLen: 120,
  },
  {
    agency: 'Canadian Heritage',
    url: 'https://www.canada.ca/en/canadian-heritage/services/funding.html',
    minTextLen: 8,
    maxTextLen: 120,
  },
  {
    agency: 'ESDC — Employment and Social Development Canada',
    url: 'https://www.canada.ca/en/employment-social-development/services/funding/programs.html',
    minTextLen: 12,
    maxTextLen: 120,
  },
];

const CACHE_KEY = 'all-hubs';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function scrapeHub(hub: HubDef): Promise<HubProgram[]> {
  return withPage(async (page) => {
    await page.goto(hub.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    // Settle for any deferred content blocks (Akamai serves a stale shell
    // first, then hydrates).
    await new Promise((r) => setTimeout(r, 1500));
    const items = await page.evaluate(
      ({ agency, hubUrl, min, max }) => {
        // Restrict to the main content region — canada.ca + rcaanc both use
        // <main> or [property="mainContentOfPage"] for the page body.
        const root =
          document.querySelector("[property='mainContentOfPage']") || document.querySelector('main') || document.body;
        const seen = new Set<string>();
        const out: Array<{ agency: string; hubUrl: string; name: string; applyUrl: string }> = [];
        const anchors = root.querySelectorAll('a');
        for (const a of Array.from(anchors)) {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
          const href = a.getAttribute('href');
          if (!text || !href || href.startsWith('#')) continue;
          if (text.length < min || text.length > max) continue;
          // Skip nav-y / breadcrumb words.
          if (/^(home|menu|skip|search|main|government|sign\s*in|sign\s*up|français|english|share|print)$/i.test(text))
            continue;
          if (/canada.ca home page|government of canada|contact the government/i.test(text)) continue;
          if (/^canada\.ca$/i.test(text)) continue;
          // Build absolute URL.
          const applyUrl = new URL(href, location.href).toString();
          // Dedupe by URL.
          if (seen.has(applyUrl)) continue;
          seen.add(applyUrl);
          out.push({ agency: agency as string, hubUrl: hubUrl as string, name: text, applyUrl });
        }
        return out;
      },
      { agency: hub.agency, hubUrl: hub.url, min: hub.minTextLen, max: hub.maxTextLen },
    );
    return items;
  });
}

async function ensureCatalogue(forceRefresh = false): Promise<HubProgram[]> {
  const cached = storeGet<HubProgram[]>(BUCKETS.availableGrants, CACHE_KEY);
  if (cached && !forceRefresh && ageMs(cached) < CACHE_TTL_MS) {
    return cached.data;
  }
  const all: HubProgram[] = [];
  for (const hub of HUBS) {
    try {
      const programs = await scrapeHub(hub);
      all.push(...programs);
    } catch (err) {
      // One bad hub shouldn't kill the catalogue — log and continue.
      // eslint-disable-next-line no-console
      console.warn(`[available-grants] hub ${hub.agency} failed: ${(err as Error).message}`);
    }
  }
  if (all.length === 0) {
    if (cached) return cached.data; // serve stale rather than fail
    throw new Error('All funding hubs failed and no cache available');
  }
  storePut(BUCKETS.availableGrants, CACHE_KEY, all);
  return all;
}

const HUMAN_URL = 'https://www.canada.ca/en/services/funding.html';
const buildHumanUrl = (q: string): string =>
  q.trim() ? `${HUMAN_URL}?q=${encodeURIComponent(q)}` : HUMAN_URL;

export const availableGrants: Source = {
  id: 'available-grants',
  name: 'Available federal grants & programs (accepting applications)',
  // Available in both Funding *and* Business modes — knowing what programs are
  // open to apply to is useful for both "where's the money" and "what should
  // this business apply for".
  mode: ['money', 'business'],
  format: 'html-search',
  category: 'Open opportunities — Federal grants',
  homepage: HUMAN_URL,
  indigenousFilter: 'keyword-or',
  description:
    'Searchable list of federal grant + funding programs currently accepting applications. Aggregated from three departmental funding hubs (CIRNAC, Canadian Heritage, ESDC). Cached 24h.',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const programs = await ensureCatalogue(false);
      const needle = q.trim().toLowerCase();
      const matched = needle
        ? programs.filter(
            (p) => p.name.toLowerCase().includes(needle) || p.agency.toLowerCase().includes(needle),
          )
        : programs;
      const items: SourceItem[] = matched.slice(0, 30).map((p) => ({
        title: p.name,
        subtitle: p.agency,
        url: p.applyUrl,
        fields: {
          agency: p.agency,
          apply_url: p.applyUrl,
          source_hub: p.hubUrl,
        },
      }));
      return {
        items,
        searchUrl: buildHumanUrl(q),
        notes: [
          `Searched ${programs.length} federal funding programs across ${HUBS.length} departmental hubs (CIRNAC + Canadian Heritage + ESDC). Cache TTL 24h.`,
        ],
      };
    } catch (err) {
      return {
        items: [],
        searchUrl: buildHumanUrl(q),
        warnings: [`Available-grants fetch failed (${(err as Error).message}); link only.`],
      };
    }
  },
};
