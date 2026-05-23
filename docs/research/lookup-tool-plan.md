# `@skintyee/lookup` — tool plan

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

## 2. Layout

```
lookup/
├── README.md
├── package.json            # @skintyee/lookup, bin: "lookup"
├── tsconfig.json
├── .gitignore              # out/, node_modules/, .env
├── src/
│   ├── cli.ts              # commander entry — `lookup business`, `lookup money`, `lookup serve`, `lookup sources`
│   ├── serve.ts            # Express server (web UI + /api/run)
│   ├── runner.ts           # orchestrates scrapers, emits progress events
│   ├── report.ts           # writes ./out/<slug>/<ts>/
│   ├── sources/
│   │   ├── index.ts        # full source catalogue (typed)
│   │   ├── business/
│   │   │   ├── orgbook-bc.ts
│   │   │   ├── opencorporates.ts
│   │   │   ├── mras.ts
│   │   │   ├── corporations-canada.ts
│   │   │   ├── cra-charities.ts
│   │   │   ├── isc-ibd.ts
│   │   │   ├── ccab.ts
│   │   │   ├── bc-indigenous-listings.ts
│   │   │   ├── worksafebc.ts
│   │   │   ├── bcfsc-safe.ts
│   │   │   ├── bccsa-cor.ts
│   │   │   ├── cso.ts                  # link-only
│   │   │   └── fn-profiles.ts
│   │   └── money/
│   │       ├── open-canada-contracts.ts
│   │       ├── open-canada-grants.ts
│   │       ├── open-canada-ckan.ts
│   │       ├── bc-open-data-ckan.ts
│   │       ├── bc-bid.ts               # link-only (no JSON API)
│   │       ├── merx.ts
│   │       ├── civicinfo-bc.ts
│   │       ├── contracts-csv.ts        # bulk CSV scan
│   │       └── grants-csv.ts           # bulk CSV scan
│   ├── util/
│   │   ├── http.ts         # fetch wrapper, retry, UA, polite delay
│   │   ├── cheerio.ts      # html → typed extracts
│   │   ├── csv.ts          # streaming CSV scan (large files)
│   │   ├── slug.ts
│   │   ├── fs.ts
│   │   └── log.ts          # chalk + ora-style progress
│   └── web/
│       ├── index.html      # checkbox UI, Indigenous-only toggle, target input, results
│       ├── main.js
│       └── style.css       # match the Skin Tyee dark palette
└── out/                    # gitignored
```

Add `lookup` to `pnpm-workspace.yaml` members.

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
