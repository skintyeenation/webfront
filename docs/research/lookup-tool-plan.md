# Skin Tyee Lookup — tool plan

> **Plan rev — RN-app pivot (2026-05-23).** Per feedback, the lookup is now a
> *full app* matching the look & feel of [`@skintyee/app`](../../app), backed by
> a separate API service. Two pnpm workspaces:
> - **`lookup/api`** → `@skintyee/lookup-api` — CLI (`commander`) +
>   HTTP/SSE server + scrapers + report writer.
> - **`lookup/app`** → `@skintyee/lookup-app` — **React Native + Expo** frontend
>   mirroring the band app's stack (React Native Paper `MD2DarkTheme`
>   cyan/orange, Redux Toolkit `makeActions`, React Navigation stack +
>   `material-bottom-tabs`, same theme tokens / `sansSerif` font stack,
>   `lookup/*` path alias).
> The earlier "vanilla HTML web UI" plan is superseded; the CLI piece is kept.

### Source scrape strategy (current)

| Source | Strategy | Notes |
|---|---|---|
| OrgBook BC | JSON API | `/api/v4/search/topic` |
| MRAS | JSON API | Solr behind the SPA at `/cbr/srch/api/v1/search` |
| BC Indigenous Business Listings | CKAN datastore | `/api/3/action/datastore_search` |
| Open Canada CKAN | CKAN API | `package_search` |
| BC Open Data CKAN | CKAN API | `package_search` |
| Open Canada contracts | HTML scrape (fetch + cheerio) | WAF returns 4xx-with-body; selector targets `a[href*="/contracts/record/"]` |
| Open Canada grants | HTML scrape | same WET layout as contracts |
| MERX | HTML scrape | open + awarded solicitations |
| Generic company website | HTML scrape | homepage + /about + /contact for emails/phones |
| FN FMB | HTML scrape | regex-extract Nation names off the certified-Nations page |
| **ISC Indigenous Business Directory** | **puppeteer** | needs session via `/REA-IBD/eng/reset`, `#frm1` form post |
| **CCAB** | **puppeteer** | rebranded to `ccib.ca`; directory is JS-filtered |
| Corporations Canada, CRA Charities, ISC FN Profiles, WorkSafeBC, BCFSC SAFE, BCCSA COR, CSO, OpenCorporates (free tier), SEDAR+, BC Bid, CivicInfo BC, contracts/grants bulk CSVs | link-only | every other source. Each still emits a deep search URL the user can open. |

Puppeteer is loaded via `puppeteer-core` and drives the user's **installed
Chrome** (no bundled chromium) — same model as `docs/scripts/shoot.mjs`. The
helper lives in `lookup/api/src/util/puppet.ts` (singleton browser +
`withPage<T>` runner).

### End-to-end smoke test

`pnpm --filter @skintyee/lookup-api test:e2e` runs every catalogued source
against a known-good query and asserts `items.length > 0` (scrapers) or that
a valid `http(s)` URL is emitted (link-only).


**Purpose:** A small dual-mode research tool that automates the lookups in
[`canadian-business-lookups.md`](canadian-business-lookups.md) using the
endpoints in [`lookup-endpoints.md`](lookup-endpoints.md). Two questions the
tool answers:

1. **Business lookup** — *"Who is this company / org?"* Search by name across
   business registries (federal, BC, Indigenous, charities, safety
   certifications).
2. **Money lookup** — *"Where can I find money, and who currently has the
   contracts and bids?"* Keyword search across federal/provincial **contracts,
   grants, funding agreements, and bid solicitations**.

A single **"Indigenous-only"** checkbox flips the appropriate filter on each
source (PSIB/CLCAA on contracts, ISC/CIRNAC on grants, keyword OR on bids,
Indigenous-only directories selected by default in business mode).

---

## 1. Deliverables

- A new pnpm workspace package **`lookup/`** in the webfront monorepo.
- **CLI** (`@skintyee/lookup`) via `commander` + `@inquirer/prompts` (interactive
  checkbox selection of sources).
- **Web UI** — a small Express + vanilla-HTML page with the same checkboxes,
  Indigenous-only toggle, target input, and live progress (SSE).
- **Output writer** — every run writes a self-contained folder under
  `./out/<slug>/<timestamp>/` with a `report.md`, per-source JSON, and raw
  HTML where applicable.

---

### Architecture decisions (updated)

- **Minimal new deps.** The webfront workspace already has React (via the RN
  app). Add only **three new pnpm deps**: `commander`, `@inquirer/prompts`,
  `cheerio`. Everything else uses Node 20 stdlib (`http`, `fs`, `fetch`).
- **Server** uses Node's built-in `http` module (no Express, no Vite). It serves
  static files from `src/web/` and `/api/*` endpoints with **SSE** for progress.
- **Frontend** is React **without a bundler** — React and `htm` are loaded as
  ESM modules from a vendored copy or `esm.sh` CDN, written as a single
  `main.js`. Theme & colors match the Skin Tyee app (cyan/orange dark palette,
  sans-serif system stack).
- **No build step required** to use the tool: `pnpm lookup …` runs the CLI via
  `tsx`; `pnpm lookup:serve` starts the web UI on `http://localhost:5050`.

## 2. Layout

```
lookup/
├── api/                                # @skintyee/lookup-api
│   ├── package.json                    # deps: commander, @inquirer/prompts, cheerio (3 new)
│   ├── tsconfig.json
│   └── src/
│       ├── cli.ts                      # commander — `business`, `money`, `serve`, `sources`
│       ├── serve.ts                    # Node http stdlib + SSE (no Express)
│       ├── runner.ts                   # orchestrates scrapers; emits progress events
│       ├── report.ts                   # writes ./out/<slug>/<ts>/report.md + per-source files
│       ├── types.ts                    # SourceMode, Source, ScrapeResult, ProgressEvent, …
│       ├── util/{http,slug,fs,log}.ts  # native fetch, polite-pace, ANSI logger
│       └── sources/
│           ├── index.ts                # catalogue (single source of truth for picker)
│           ├── helpers.ts              # indigenousOrQuery, qs(…)
│           ├── business/
│           │   ├── orgbook-bc.ts       # ✅ JSON API
│           │   ├── mras.ts             # HTML scrape
│           │   ├── website.ts          # generic website probe
│           │   └── link-only.ts        # opencorporates, corporations-canada, cra-charities, isc-ibd, ccab, bc-indigenous-listings, worksafebc, bcfsc-safe, bccsa-cor, cso, fn-profiles, fn-fma
│           └── money/
│               ├── open-canada-contracts.ts   # ✅ HTML Solr w/ PSIB/CLCAA
│               ├── open-canada-grants.ts      # ✅ HTML Solr w/ ISC/CIRNAC org-filter
│               ├── open-canada-ckan.ts        # ✅ CKAN package_search
│               ├── bc-open-data-ckan.ts       # ✅ CKAN package_search
│               ├── merx.ts                    # HTML scrape
│               └── link-only.ts               # bc-bid, civicinfo-bc, sedar+
└── app/                                # @skintyee/lookup-app (RN + Expo)
    ├── App.tsx                         # init shell (mirrors @skintyee/app)
    ├── index.js                        # registerRootComponent
    ├── app.config.js                   # apiServer env (default http://localhost:5050)
    ├── babel.config.js                 # module-resolver alias `lookup/*` → `src/*`
    ├── metro.config.js                 # monorepo watchFolders + hoisted resolution
    ├── tsconfig.json                   # paths: lookup/* → src/*
    └── src/
        ├── main.tsx                    # exposes init() → wraps Application in Provider + Paper
        ├── Application.tsx             # NavigationContainer + material-bottom-tabs + stacks
        ├── routes.tsx                  # route name + screen options registry
        ├── styles.tsx                  # copies @skintyee/app theme (cyan/orange dark, sansSerif)
        ├── models.ts                   # Mode = 'business'|'money'; SourceItem; Job; etc.
        ├── config.ts                   # API base URL (from expo-constants)
        ├── core/utils/string.ts        # snake↔camel (matches @skintyee/app)
        ├── store/
        │   ├── index.ts                # configureStore + AppDispatch + hooks
        │   ├── factory.ts              # makeActions snake→camel factory
        │   ├── reducers.ts
        │   ├── apis.ts                 # apiFactory; resolves real or mock LookupApi
        │   └── modules/
        │       ├── appState.ts
        │       ├── sources.ts          # GET /sources → catalogue
        │       ├── lookup.ts           # POST /run + SSE subscription state
        │       └── history.ts          # past lookups (in-memory + AsyncStorage)
        ├── services/lookupApi.ts       # fetch wrappers for /sources, /run, /jobs/:id, SSE stream
        └── components/
            ├── layout/
            │   ├── AppHeader.tsx       # mirrors @skintyee/app — Skin Tyee wordmark + Account stub
            │   ├── PageContainer.tsx
            │   ├── SourcePicker.tsx    # grouped checkboxes (Card + Checkbox + Chip)
            │   ├── IndigenousChip.tsx  # toggle pill (orange when on)
            │   ├── ResultCard.tsx      # one SourceItem rendered as Paper Card
            │   └── ProgressList.tsx    # live source-by-source status
            └── pages/
                ├── Home.tsx            # mode selector + "Recent lookups"
                ├── BusinessLookup.tsx  # form: target, indigenous-only, --website, source picker
                ├── MoneyLookup.tsx     # form: keyword, indigenous-only, vendor, years, value bounds, sources
                ├── Run.tsx             # subscribes to SSE; renders ProgressList
                ├── Results.tsx         # per-source results with ResultCards + raw payload link
                └── History.tsx         # list of past runs (tap → Results)

(util/csv.ts, contracts-csv.ts, grants-csv.ts — deferred bulk-CSV scan
moved to Phase 4)
```

Add **both** `lookup/api` and `lookup/app` to `pnpm-workspace.yaml` members.
Root scripts:
- `pnpm lookup …` → `pnpm --filter @skintyee/lookup-api exec tsx src/cli.ts …`
- `pnpm lookup:serve` → start the API server on `:5050`
- `pnpm lookup:app` → start the Expo RN app (web/iOS/Android)

---

## 3. Source catalogue (typed)

```ts
type SourceMode = 'business' | 'money';
type SourceFormat = 'json-api' | 'html-search' | 'ckan' | 'csv-bulk' | 'link-only';

interface Source {
  id: string;                 // e.g. 'orgbook-bc'
  name: string;               // 'OrgBook BC'
  mode: SourceMode;
  format: SourceFormat;
  category: string;           // matches headings in lookup-endpoints.md
  homepage: string;
  // Build the human-clickable search URL (always works, even if scrape fails)
  searchUrl: (q: string, opts: { indigenousOnly: boolean }) => string;
  // Optional automated scraper
  scrape?: (q: string, opts: { indigenousOnly: boolean; ctx: Ctx }) =>
    Promise<{ items: SourceItem[]; raw?: string }>;
  // Honors --indigenous-only? Some sources are inherently Indigenous;
  // others have explicit flags; others can only filter by keyword OR.
  indigenousFilter: 'inherent' | 'flag' | 'keyword-or' | 'none';
  requiresAuth?: 'api-key' | 'paid' | false;
}
```

The catalogue is the single source of truth for both the CLI choices and the
web UI checkboxes.

---

## 4. CLI design (commander + inquirer)

### Commands

```
$ lookup --help
Usage: lookup [options] [command]

  business <target>     Business / org lookup by name
  money <keyword>       Grant / contract / bid lookup by keyword
  serve                 Start the web UI on http://localhost:5050
  sources [--mode=…]    List available sources
```

### `lookup business <target>` flags

| Flag | Notes |
|---|---|
| `-i, --interactive` | Prompt for source selection via `@inquirer/prompts` checkbox |
| `-s, --sources <ids>` | Comma-separated source ids (`orgbook-bc,ccab,isc-ibd`) |
| `--all` | Use all scrapable business sources |
| `--indigenous-only` | Filter / restrict to Indigenous sources & Indigenous-flagged records |
| `--website <url>` | Optional company website to also scrape (homepage + /about + /contact) |
| `--out <dir>` | Output directory (default `./out`) |
| `--no-fetch` | Only emit search URLs; don't hit the network |
| `--api-token <token>` | OpenCorporates API token (or `OPENCORPORATES_TOKEN` env) |

### `lookup money <keyword>` flags

| Flag | Notes |
|---|---|
| `-i, --interactive` | Prompt for source selection |
| `-s, --sources <ids>` | Comma-separated source ids |
| `--all` | All scrapable money sources |
| `--indigenous-only` | PSIB/CLCAA on contracts; ISC/CIRNAC on grants; OR with Indigenous keywords on bids |
| `--vendor <name>` | Restrict contract/grant results to a specific recipient (uses `vendor_name` / `recipient_business_number` where supported) |
| `--from <YYYY>` / `--to <YYYY>` | Year window |
| `--min-value <n>` / `--max-value <n>` | Value range filter |
| `--out <dir>` |  |

Examples:

```bash
$ lookup business "Birdco Industrial Resources Ltd" --indigenous-only -i
$ lookup money "First Nation" --indigenous-only --from 2023 --min-value 100000 --all
$ lookup money "infrastructure" --indigenous-only -s open-canada-contracts,open-canada-grants,merx
$ lookup serve
```

### Interactive prompt

When `-i` (or no flags) is passed:

```
? Mode: (Use arrow keys)
❯ business — search registries by name
  money — search contracts/grants/bids by keyword
? Target / keyword: Birdco Industrial Resources Ltd
? Indigenous-only filter: (y/N)
? Sources (space to select, a to toggle all):
 ◉ OrgBook BC ⚡ JSON API
 ◯ OpenCorporates (API token required)
 ◉ Indigenous Business Directory (ISC) — Indigenous
 ◉ CCAB CAB directory — Indigenous
 ◉ MRAS Canadian Business Registry
 ◯ Corporations Canada (federal)
 ◯ CRA Charities Listings
 ◉ WorkSafeBC clearance
 ◯ Court Services Online (link only)
? Output directory: ./out
```

---

## 5. Web UI

A single page served by Express at `http://localhost:5050`.

```
┌──────────────────────────────────────────────────────────────┐
│ Skin Tyee — Lookup                                           │
│ ( ◉ business   ◯ money )                                     │
│                                                              │
│  Target / keyword:  [ Birdco Industrial Resources Ltd     ]  │
│  ☑ Indigenous-only                                           │
│  Optional website:  [ https://…                            ] │
│                                                              │
│  Sources (Select all in: Business · Indigenous · Safety)     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Federal / cross-jurisdiction                           │  │
│  │ ☑ OrgBook BC (JSON API)                                │  │
│  │ ☐ OpenCorporates (API key required)                    │  │
│  │ ☐ Corporations Canada                                  │  │
│  │ ☑ MRAS Canadian Business Registry                      │  │
│  │ Indigenous-only directories                            │  │
│  │ ☑ ISC Indigenous Business Directory                    │  │
│  │ ☑ CCAB CAB directory                                   │  │
│  │ ☑ BC Indigenous Business Listings                      │  │
│  │ Safety / certification                                 │  │
│  │ ☑ WorkSafeBC clearance                                 │  │
│  │ ☐ BCFSC SAFE Companies                                 │  │
│  │ ☐ BCCSA COR                                            │  │
│  │ Litigation / public records                            │  │
│  │ ☐ Court Services Online (link only)                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [ Run lookup ]                                              │
│                                                              │
│  Progress (SSE)…                                             │
│  ▸ OrgBook BC      ✔ 3 results                               │
│  ▸ ISC IBD         ✔ 1 result                                │
│  ▸ CCAB            ✔ 0 results                               │
│  ▸ MRAS            ✔ 12 results (link to filtered set)       │
│                                                              │
│  📁 Report saved to ./out/birdco-industrial/2026-05-23T…/    │
│     [ Open report.md ]                                       │
└──────────────────────────────────────────────────────────────┘
```

- Same checkbox state machine for both modes (business / money).
- "Indigenous-only" auto-checks the inherently-Indigenous directories and
  flips the PSIB/CLCAA filter on contracts / Indigenous-org filter on grants.
- Server streams progress events via `EventSource` (SSE) — one event per
  source, plus a final `done` with the report path.

---

## 6. Output format

`./out/<slug>/<timestamp>/`:

```
report.md                 ← master human-readable report (links + scraped facts)
sources/
  orgbook-bc.json
  orgbook-bc.html         ← raw HTML if we fetched a search page
  isc-ibd.json
  ccab.json
  open-canada-contracts.json   ← list of disclosed contracts matching the keyword
  open-canada-grants.json
  merx.json
  …
inputs.json               ← echo of CLI options for reproducibility
```

**`report.md`** structure:

```markdown
# Lookup — "Birdco Industrial Resources Ltd"

Mode: business · Indigenous-only: yes · Run: 2026-05-23T18:42:11Z

## Summary
- OrgBook BC: 1 BC-registered entity (incorporation #BC1234567), active
- ISC IBD: 1 match
- CCAB: 0
- MRAS: 12 hits across jurisdictions
- WorkSafeBC clearance: clear / outstanding ($)

## OrgBook BC
…structured per-source section…

## Sources without automated scraping
- Corporations Canada → [search URL](…)
- Court Services Online → [search URL](…)
```

---

## 7. Implementation phases

### Phase 0 — scaffold (~½ day)
- Add `lookup` to `pnpm-workspace.yaml`.
- `package.json` (`@skintyee/lookup`), `tsconfig.json`, `.gitignore`.
- Bin entry `lookup` → `dist/cli.js` (or `tsx src/cli.ts`).
- Deps: `commander`, `@inquirer/prompts`, `express`, `cheerio`, `csv-parse`,
  `chalk`, `ora`, `undici` (or native `fetch`), `dotenv`.
- Dev deps: `typescript`, `tsx`, `@types/express`, `@types/node`.

### Phase 1 — business mode MVP (~1 day)
Scrapers that **work today, no auth needed:**
- ✅ OrgBook BC (JSON API — pagination, formatted endpoint)
- ✅ MRAS (HTML scrape, cheerio)
- ✅ Generic website (fetch homepage + `/about` + `/contact`)
- Link-only emit for all others (Corporations Canada, OpenCorporates,
  ISC IBD, CCAB, CRA Charities, WorkSafeBC, BCFSC, BCCSA, CSO, PPSA).

### Phase 2 — money mode MVP (~1 day)
- ✅ Open Canada Contracts (HTML Solr scrape) — with PSIB/CLCAA filter for `--indigenous-only`
- ✅ Open Canada Grants (HTML Solr scrape) — filter `owner_org=isc-sac,cirnac-rcaanc` for `--indigenous-only`
- ✅ Open Canada CKAN (`package_search`) — JSON
- ✅ BC Open Data CKAN — JSON
- ✅ MERX (HTML scrape — open + awarded)
- Bulk-CSV scanner option (`--use-csv`) for contracts & grants — for offline
  large-keyword runs (downloads + greps in-memory with `csv-parse` streaming).

### Phase 3 — web UI (~½ day)
- Express server, static `src/web/`.
- `POST /api/run` → starts a job, returns `jobId`.
- `GET /api/jobs/:id/stream` → SSE per-source events.
- `GET /api/jobs/:id/report` → serves the generated `report.md` (rendered) and
  the folder listing.
- Page styling matches Skin Tyee dark palette (cyan + orange, MD2-ish).

### Phase 4 — polish
- ISC IBD scraper (form + session cookie).
- CCAB scraper (filter URL params).
- WorkSafeBC clearance (form POST + PDF download).
- Optional Puppeteer fallback for BC Bid (only if a stakeholder asks).
- E2E test: run the tool against "Birdco Industrial Resources Ltd" + keyword
  "First Nation infrastructure" and snapshot the report shape.

### Out of scope
- Paid registries (BC Company Summary, PPSA, CSO documents, ISNetworld) —
  link-only.
- SEDAR+ scraping (only relevant for public-company counterparties).
- Building a database — every run is a self-contained folder; no DB.

---

## 8. Engineering notes

- **Be a polite scraper.** Use a clear `User-Agent` (`skintyee-lookup/0.1 (info@skintyeenation.org)`), 1 req/sec per host, exponential backoff on 429/5xx.
- **Cache the raw HTML** under `sources/*.html`. Re-runs use `?--no-cache` to refresh.
- **Type each scraper's output.** A single `SourceItem` union with a per-source `details` shape keeps the report renderer simple.
- **Never store secrets.** `OPENCORPORATES_TOKEN` from `.env` (gitignored).
- **Reproducibility.** `inputs.json` lets a reviewer re-run the same query.
- **Failure mode.** A scraper that fails logs `⚠ orgbook-bc — HTTP 503` but does **not** kill the run; report.md notes the failure inline.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Site layouts change (cheerio selectors brittle) | One file per source; selectors localized; smoke-test against fixed fixtures |
| Rate-limiting / IP blocks | Per-host throttle + retries; document polite UA |
| ISC IBD session/cookie flakiness | Implement as link-only first; promote to scrape only if needed |
| OpenCorporates needs API key | Skip by default; warn user if requested without a token |
| BC Bid is JS-heavy | Link-only in MVP; Puppeteer is a stretch goal |
| Endpoint params change (Solr facets) | Document params in `lookup-endpoints.md`; CI smoke-test that re-fetches a known query and checks `count > 0` |

---

## 10. What I'm proposing to build (vs. defer)

**Build now (Phases 0–3, ~3 days):**

- pnpm workspace `lookup/` with CLI + web UI + report writer.
- Business mode scrapers: **OrgBook BC, MRAS, generic website**; link-only for the rest.
- Money mode scrapers: **Open Canada Contracts, Open Canada Grants, Open Canada CKAN, BC Open Data CKAN, MERX**; link-only for BC Bid + CivicInfo BC.
- Indigenous-only checkbox wired to PSIB/CLCAA + ISC/CIRNAC + inherent directories.
- Self-contained `./out/<slug>/<timestamp>/` reports.

**Defer (Phase 4):**

- ISC IBD form-session scraper.
- WorkSafeBC clearance form.
- CCAB filtered scrape.
- Puppeteer-based BC Bid scrape.

**Out of scope:**

- Paid registries (link-only forever).
- SEDAR+, ISNetworld.
- A persistent DB / multi-user workflow.

> Awaiting go/no-go before scaffolding `lookup/` and writing scrapers.
