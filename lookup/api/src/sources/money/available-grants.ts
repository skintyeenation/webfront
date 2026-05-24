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
  /** Additional per-hub anchor-text skip patterns (case-insensitive). Used to
   *  drop site-specific nav cruft that survives the base filter — e.g.
   *  NACCA's "Meet the Team" or NRT's "About Us" links. */
  skipPatterns?: RegExp[];
  /** Optional CSS selector to scope the anchor harvest. Defaults to the chain
   *  `[property='mainContentOfPage']` → `main` → `body`. Override for sites
   *  that don't use the canada.ca WET template — e.g. the BC government's
   *  React-based funding search uses `.right-column`. */
  rootSelector?: string;
}

const HUBS: HubDef[] = [
  // Original three (verified, > 95% of hits today).
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
  // Federal department hubs added 2026-05 in response to the
  // "make all these searchable" ask. Same Drupal-WET template as the
  // first three, so the existing <main> anchor extraction works.
  // Some return only a handful of program anchors — that's fine; the
  // catalogue is the union of all of them.
  {
    agency: 'NRCan — Natural Resources Canada',
    // Verified live 2026-05 (the older /funding-opportunities path 404s).
    url: 'https://natural-resources.canada.ca/funding-partnerships',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'ECCC — Environment and Climate Change Canada',
    url: 'https://www.canada.ca/en/environment-climate-change/services/environmental-funding.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'DFO — Fisheries and Oceans (Indigenous programs)',
    // Note: .htm (not .html). The .html variant serves a 200-status
    // "Page not found" rendering.
    url: 'https://www.dfo-mpo.gc.ca/fm-gp/aboriginal-autochtones/index-eng.htm',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'Justice Canada',
    url: 'https://www.justice.gc.ca/eng/fund-fina/index.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  // Regional development agencies — BC focus first.
  {
    agency: 'PacifiCan — Pacific Economic Development Canada (BC)',
    url: 'https://www.canada.ca/en/pacific-economic-development.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'PrairiesCan — Prairies Economic Development',
    url: 'https://www.canada.ca/en/prairies-economic-development.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'ACOA — Atlantic Canada Opportunities Agency',
    url: 'https://www.canada.ca/en/atlantic-canada-opportunities.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'CanNor — Canadian Northern Economic Development',
    // Use the canonical "Our Programs and Services" deep-link
    // (verified 2026-05; lists Northern Indigenous Economic Opportunities
    // Program, IDEANorth, NICI Fund, Tourism Growth Program, etc.).
    url: 'https://www.cannor.gc.ca/eng/1381325363616/1381325380355',
    minTextLen: 10,
    maxTextLen: 140,
  },
  {
    agency: 'Infrastructure Canada',
    url: 'https://housing-infrastructure.canada.ca/index-eng.html',
    minTextLen: 10,
    maxTextLen: 140,
  },
  // BC + Indigenous-controlled funders (verified scrapable 2026-05).
  // These don't use the canada.ca WET template — different markup, more
  // site-specific nav cruft — so they each get a `skipPatterns` list.
  {
    agency: 'New Relationship Trust (BC)',
    url: 'https://www.newrelationshiptrust.ca/funding/',
    minTextLen: 8,
    maxTextLen: 120,
    skipPatterns: [
      /^(about|contact|news|board|team|home|donate|annual report)/i,
      /facebook|twitter|linkedin|instagram/i,
    ],
  },
  {
    // NACCA's `/programs/` URL 404s in the browser (verified 2026-05) even
    // though it renders some content. The homepage links to each real
    // program page (IWE, IYE, Indigenous Growth Fund, AEP).
    agency: 'NACCA — Aboriginal Financial Institutions',
    url: 'https://nacca.ca/',
    minTextLen: 8,
    maxTextLen: 120,
    skipPatterns: [
      /^(meet the team|history|membership|partnerships|news|contact|about|home|donate)/i,
      /facebook|twitter|linkedin|instagram/i,
    ],
  },
  {
    agency: 'Indspire (Indigenous education bursaries)',
    url: 'https://indspire.ca/programs/students/',
    minTextLen: 8,
    maxTextLen: 120,
    skipPatterns: [
      /^(accessing your t4a|eft instructions|guidelines|thank you letter|words of encouragement|supporters)/i,
    ],
  },
  {
    agency: 'First Peoples\' Cultural Council (BC)',
    url: 'https://fpcc.ca/grants/',
    minTextLen: 8,
    maxTextLen: 120,
    skipPatterns: [
      /^(about|contact|news|board|team|home|funding application process|grant portal|program staff|funding guidelines)/i,
    ],
  },
  {
    // BC government Funding Search page with the Aboriginal People facet
    // pre-applied (returns ~22 Indigenous-eligible BC programs: Indigenous
    // Entrepreneur Loan, First Citizens Fund, First Nations Clean Energy
    // Business Fund, NRT Equity Match Grant, etc.). React-based — class
    // names are hashed but `.right-column` is the stable container.
    agency: 'BC Government — Funding Search (Aboriginal facet)',
    url: 'https://www2.gov.bc.ca/gov/search?id=06772BB02F5D4E5C9A15E9CA4B0146AC&q=indigenous%2Binmeta%3Abcgov_fundingSubject%3DAboriginal+People&tab=1',
    minTextLen: 8,
    maxTextLen: 120,
    rootSelector: '.right-column',
    skipPatterns: [
      /^(search entire site|searching the entire site|subject:|find ways to contact)/i,
    ],
  },
];

const CACHE_KEY = 'all-hubs';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function scrapeHub(hub: HubDef): Promise<HubProgram[]> {
  return withPage(async (page) => {
    await page.goto(hub.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Settle for any deferred content blocks. React-rendered pages
    // (e.g. the BC funding search) take a few seconds to populate; the
    // canada.ca + rcaanc Drupal-WET pages are ready almost immediately.
    await new Promise((r) => setTimeout(r, hub.rootSelector ? 5000 : 1500));
    const skipPatternSources = (hub.skipPatterns || []).map((re) => re.source);
    const rootSelector = hub.rootSelector || '';
    const items = await page.evaluate(
      ({ agency, hubUrl, min, max, skipSrcs, rootSel }) => {
        // Per-hub root selector takes precedence; otherwise fall back to the
        // canada.ca + rcaanc default chain.
        const root =
          (rootSel && document.querySelector(rootSel as string)) ||
          document.querySelector("[property='mainContentOfPage']") ||
          document.querySelector('main') ||
          document.body;
        const seen = new Set<string>();
        const out: Array<{ agency: string; hubUrl: string; name: string; applyUrl: string }> = [];
        const skipRegexes = (skipSrcs as string[]).map((s) => new RegExp(s, 'i'));
        const anchors = root.querySelectorAll('a');
        for (const a of Array.from(anchors)) {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
          const href = a.getAttribute('href');
          if (!text || !href || href.startsWith('#')) continue;
          if (text.length < min || text.length > max) continue;
          // Skip nav-y / breadcrumb words.
          if (/^(home|menu|skip|search|main|government|sign\s*in|sign\s*up|français|english|share|print)$/i.test(text))
            continue;
          // Per-hub skip patterns.
          if (skipRegexes.some((re) => re.test(text))) continue;
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
      {
        agency: hub.agency,
        hubUrl: hub.url,
        min: hub.minTextLen,
        max: hub.maxTextLen,
        skipSrcs: skipPatternSources,
        rootSel: rootSelector,
      },
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

/**
 * Convert raw HubProgram rows into SourceItems with consistent shape.
 */
function toSourceItems(matched: HubProgram[], limit = 30): SourceItem[] {
  return matched.slice(0, limit).map((p) => ({
    title: p.name,
    subtitle: p.agency,
    url: p.applyUrl,
    fields: {
      agency: p.agency,
      apply_url: p.applyUrl,
      source_hub: p.hubUrl,
    },
  }));
}

/**
 * Filter the cached program catalogue. `agencyMatch` (optional) narrows to a
 * single hub; the keyword `needle` matches the program name and the agency
 * name. An empty needle returns the full (agency-narrowed) catalogue so the
 * "browse mode" search Just Works.
 */
async function searchCatalogue(needle: string, agencyMatch?: RegExp): Promise<HubProgram[]> {
  const programs = await ensureCatalogue(false);
  const filtered = agencyMatch ? programs.filter((p) => agencyMatch.test(p.agency)) : programs;
  const lower = needle.trim().toLowerCase();
  if (!lower) return filtered;
  return filtered.filter(
    (p) => p.name.toLowerCase().includes(lower) || p.agency.toLowerCase().includes(lower),
  );
}

/**
 * Per-agency Source factory — each one is a *real* scraper that shares the
 * `available-grants` cache and filters to the matching hub. This is what the
 * picker UI shows as "scrape" instead of "link only": users see PacifiCan,
 * CanNor, NACCA, etc. each as a scrapable source with its real program count,
 * not as a clickable-only landing.
 */
interface AgencySourceOpts {
  id: string;
  name: string;
  /** Regex tested against `HubProgram.agency`. Determines which hub's items
   *  show up under this source. */
  agencyMatch: RegExp;
  /** Page users land on when clicking "Open search ↗" — the hub URL. */
  homepage: string;
  description: string;
  category?: string;
  /** Whether the source auto-selects when the Indigenous-only chip is on. */
  autoIndigenous?: boolean;
}

function mkAgencyScraper(opts: AgencySourceOpts): Source {
  return {
    id: opts.id,
    name: opts.name,
    mode: 'money',
    format: 'html-search',
    category: opts.category || 'Open opportunities — Federal grants',
    homepage: opts.homepage,
    indigenousFilter: opts.autoIndigenous ? 'inherent' : 'keyword-or',
    autoSelectOnIndigenous: opts.autoIndigenous,
    description: opts.description,
    searchUrl: () => opts.homepage,
    async scrape(q): Promise<ScrapeResult> {
      try {
        const matched = await searchCatalogue(q, opts.agencyMatch);
        return {
          items: toSourceItems(matched),
          searchUrl: opts.homepage,
          notes: [`${matched.length} program${matched.length === 1 ? '' : 's'} from the cached funding catalogue (24h TTL).`],
        };
      } catch (err) {
        return {
          items: [],
          searchUrl: opts.homepage,
          warnings: [`Catalogue fetch failed (${(err as Error).message}); link only.`],
        };
      }
    },
  };
}

/**
 * The cross-hub aggregator — searches across every hub in the cache. Same
 * cache that the per-agency scrapers use; this just doesn't filter by agency.
 */
export const availableGrants: Source = {
  id: 'available-grants',
  name: 'Available federal grants & programs (all hubs)',
  // Available in both Funding *and* Business modes — knowing what programs are
  // open to apply to is useful for both "where's the money" and "what should
  // this business apply for".
  mode: ['money', 'business'],
  format: 'html-search',
  category: 'Open opportunities — Federal grants',
  homepage: HUMAN_URL,
  indigenousFilter: 'keyword-or',
  description:
    'Searchable list of grant + funding programs currently accepting applications. Aggregated from 17 hubs — 12 federal departments (CIRNAC, Canadian Heritage, ESDC, NRCan, ECCC, DFO, Justice, PacifiCan, PrairiesCan, ACOA, CanNor, Infrastructure Canada), 4 Indigenous-controlled / BC funders (New Relationship Trust, NACCA, Indspire, FPCC), and the BC Government Funding Search with the Aboriginal facet pre-applied. Per-hub scrapers also exposed individually. Cached 24h.',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    try {
      const matched = await searchCatalogue(q);
      return {
        items: toSourceItems(matched),
        searchUrl: buildHumanUrl(q),
        notes: [
          `Searched ${matched.length} matching of all programs cached, across ${HUBS.length} hubs (${HUBS.map((h) => h.agency.split(' — ')[0]).join(' · ')}). Cache TTL 24h.`,
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

// =============================================================================
// Per-agency scrapable sources. Each pulls from the shared catalogue cache.
// =============================================================================

export const pacifiCanGrants: Source = mkAgencyScraper({
  id: 'pacifican',
  name: 'PacifiCan — Pacific Economic Development Canada (BC)',
  agencyMatch: /^PacifiCan/i,
  homepage: 'https://www.canada.ca/en/pacific-economic-development.html',
  description:
    'BC + Yukon regional development agency. REGI Indigenous-business stream, Jobs and Growth Fund, Tourism Relief Fund Indigenous stream. Programs harvested live; cached 24h.',
});

export const prairiesCanGrants: Source = mkAgencyScraper({
  id: 'prairiescan',
  name: 'PrairiesCan — Prairies Economic Development Canada',
  agencyMatch: /^PrairiesCan/i,
  homepage: 'https://www.canada.ca/en/prairies-economic-development.html',
  description:
    'MB/SK/AB regional development agency. REGI Indigenous-business stream, Jobs and Growth Fund. Programs harvested live; cached 24h.',
});

export const acoaGrants: Source = mkAgencyScraper({
  id: 'acoa',
  name: 'ACOA — Atlantic Canada Opportunities Agency',
  agencyMatch: /^ACOA/i,
  homepage: 'https://www.canada.ca/en/atlantic-canada-opportunities.html',
  description:
    'Atlantic Canada regional development. REGI Indigenous-business stream, Atlantic Innovation Fund. Programs harvested live; cached 24h.',
});

export const cannorGrants: Source = mkAgencyScraper({
  id: 'cannor',
  name: 'CanNor — Canadian Northern Economic Development',
  agencyMatch: /^CanNor/i,
  homepage: 'https://www.cannor.gc.ca/eng/1381325363616/1381325380355',
  description:
    'Yukon/NWT/Nunavut regional agency. NIEOP, IDEANorth, NICI Fund, Tourism Growth Program, NPMO. Programs harvested live; cached 24h.',
  autoIndigenous: true,
});

export const nrcanGrants: Source = mkAgencyScraper({
  id: 'nrcan-funding',
  name: 'NRCan — Natural Resources Canada funding',
  agencyMatch: /^NRCan/i,
  homepage: 'https://natural-resources.canada.ca/funding-partnerships',
  description:
    'CERRC, SREPs Indigenous stream, Indigenous Forestry Initiative. Programs harvested live; cached 24h.',
});

export const ecccGrants: Source = mkAgencyScraper({
  id: 'eccc-funding',
  name: 'ECCC — Environment and Climate Change Canada funding',
  agencyMatch: /^ECCC/i,
  homepage:
    'https://www.canada.ca/en/environment-climate-change/services/environmental-funding.html',
  description:
    'Indigenous Guardians Program, Aboriginal Fund for Species at Risk (AFSAR), Indigenous Climate Leadership. Programs harvested live; cached 24h.',
});

export const dfoIndigenousGrants: Source = mkAgencyScraper({
  id: 'dfo-indigenous',
  name: 'DFO — Fisheries & Oceans (Indigenous programs)',
  agencyMatch: /^DFO/i,
  homepage: 'https://www.dfo-mpo.gc.ca/fm-gp/aboriginal-autochtones/index-eng.htm',
  description:
    'AAROM, Indigenous Habitat Participation Program (IHPP), Indigenous Marine Conservation. Programs harvested live; cached 24h.',
  autoIndigenous: true,
});

export const justiceGrants: Source = mkAgencyScraper({
  id: 'justice-funding',
  name: 'Justice Canada — funding programs',
  agencyMatch: /^Justice Canada/i,
  homepage: 'https://www.justice.gc.ca/eng/fund-fina/index.html',
  description:
    'Indigenous Justice Program, Indigenous Courtwork Program, Family Violence Initiative, Victims Fund. Programs harvested live; cached 24h.',
});

export const infrastructureCanadaGrants: Source = mkAgencyScraper({
  id: 'infrastructure-canada',
  name: 'Infrastructure Canada — housing & community',
  agencyMatch: /^Infrastructure Canada/i,
  homepage: 'https://housing-infrastructure.canada.ca/index-eng.html',
  description:
    'ICIF, Investing in Canada Infrastructure Program Indigenous stream, Reaching Home Indigenous Homelessness. Programs harvested live; cached 24h.',
});

export const cirnacGrants: Source = mkAgencyScraper({
  id: 'cirnac-calls',
  name: 'CIRNAC — Calls for Proposals',
  agencyMatch: /^CIRNAC/i,
  homepage: 'https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249',
  description:
    'Current CIRNAC + ISC funding rounds (Modern treaty, Indigenous Women & 2SLGBTQI+, Food Security Research, Federal Interlocutor, ISC Calls). Programs harvested live; cached 24h.',
  autoIndigenous: true,
});

export const canadianHeritageGrants: Source = mkAgencyScraper({
  id: 'canadian-heritage-funding',
  name: 'Canadian Heritage — funding',
  agencyMatch: /^Canadian Heritage/i,
  homepage: 'https://www.canada.ca/en/canadian-heritage/services/funding.html',
  description:
    'Arts, culture, sport, heritage stewardship; Indigenous Languages and Cultures Program, Building Communities Through Arts and Heritage. Programs harvested live; cached 24h.',
});

export const esdcGrants: Source = mkAgencyScraper({
  id: 'esdc-funding',
  name: 'ESDC — Employment and Social Development Canada',
  agencyMatch: /^ESDC/i,
  homepage:
    'https://www.canada.ca/en/employment-social-development/services/funding/programs.html',
  description:
    'ISET, Reaching Home, Skills for Success Indigenous Stream, Canada Summer Jobs. Programs harvested live; cached 24h.',
});

export const naccaGrants: Source = mkAgencyScraper({
  id: 'nacca',
  name: 'NACCA — Aboriginal Financial Institutions network',
  agencyMatch: /^NACCA/i,
  homepage: 'https://nacca.ca/',
  description:
    '50+ AFI network; Indigenous Growth Fund (~$150M evergreen), IWE Program, IYE Program, Aboriginal Entrepreneurship Program. Programs harvested live; cached 24h.',
  autoIndigenous: true,
});

export const fpccGrants: Source = mkAgencyScraper({
  id: 'fpcc',
  name: "First Peoples' Cultural Council (BC) — language & arts",
  agencyMatch: /First Peoples/i,
  homepage: 'https://fpcc.ca/grants/',
  description:
    'BC Crown corp, Indigenous-controlled. BC Language Initiative, Cultural Heritage Stewardship, Indigenous Arts Program, Mentor-Apprentice Program. Programs harvested live; cached 24h.',
  category: 'Open opportunities — Provincial grants',
  autoIndigenous: true,
});

export const newRelationshipTrustGrants: Source = mkAgencyScraper({
  id: 'new-relationship-trust',
  name: 'New Relationship Trust (BC)',
  agencyMatch: /New Relationship Trust/i,
  homepage: 'https://www.newrelationshiptrust.ca/funding/',
  description:
    '~$135M independent BC endowment (est. 2006). Nation Building, Declaration Act Engagement Grant, BC Indigenous Clean Energy, CEDR, Youth/Elder/Language/Education Grants. Programs harvested live; cached 24h.',
  category: 'Open opportunities — Provincial grants',
  autoIndigenous: true,
});

export const indspireGrants: Source = mkAgencyScraper({
  id: 'indspire',
  name: 'Indspire — Indigenous education bursaries',
  agencyMatch: /Indspire/i,
  homepage: 'https://indspire.ca/programs/students/',
  description:
    'Indigenous-led national education foundation. ~$22M/yr in bursaries: Building Brighter Futures, Rivers to Success, Teach for Tomorrow. Programs harvested live; cached 24h.',
  autoIndigenous: true,
});

export const bcFundingSearchGrants: Source = mkAgencyScraper({
  id: 'bc-funding-finder',
  name: 'BC Funding Search — Aboriginal facet',
  agencyMatch: /^BC Government/i,
  homepage:
    'https://www2.gov.bc.ca/gov/search?id=06772BB02F5D4E5C9A15E9CA4B0146AC&q=indigenous%2Binmeta%3Abcgov_fundingSubject%3DAboriginal+People&tab=1',
  description:
    'BC government Funding Search with the Aboriginal People facet pre-applied. ~22 Indigenous-eligible BC programs (Indigenous Entrepreneur Loan, First Citizens Fund, First Nations Clean Energy Business Fund, NRT Equity Match Grant, etc.). Programs harvested live; cached 24h.',
  category: 'Open opportunities — Provincial grants',
  autoIndigenous: true,
});
