# Funding lookup — architecture

How the Funding tab is structured today (post the May 2026 sub-tab refactor).
Companion to [lookup-endpoints.md](./lookup-endpoints.md) which catalogues
the per-source endpoints; this doc describes the **UX shape** and the
**multi-mode source model** that powers it.

---

## 1. Three sub-tabs

The Funding tab opens with a pill row above the source picker:

```
( Contracts & bids 0/10 )   ( Grants & funding 0/9 )   ( Reference 0/3 )
```

Each pill shows `selected / total` for its sub-tab. The active pill is filled
with the accent (orange) colour. Tapping switches the visible source list.

**Why three?** The Funding domain has three semantically distinct kinds of
data, and most sources only cover one of them. Mixing them in one list was
confusing — searching for "indigenous infrastructure" with all defaults
selected would fire `bc-ministry-contracts` alongside `available-grants` and
the user would scratch their head wondering why a contracts source returned
zero items on a grants question.

### Sub-tab membership

Source membership is implicit from the `category` prefix on each source.
A small helper `subtabOf(s)` (in
`lookup/app/src/components/pages/MoneyLookup.tsx`) does:

| Category prefix | Sub-tab |
|---|---|
| `Reference — *` | Reference |
| matches `grant\|transfer` (case-insensitive) | Grants & funding |
| anything else (Open opportunities — Federal/Provincial bids; Historical disclosures — *contracts*) | Contracts & bids |

| Sub-tab | Sources (id) |
|---|---|
| **Contracts & bids** | canadabuys, merx, psib, isc-challenges, defence-procurement, bc-bid, bc-hydro-tenders, civicinfo-bc, open-canada-contracts, contracts-csv, bc-ministry-contracts |
| **Grants & funding** | available-grants, fed-funding-finder, isc-funding, ch-indigenous-languages, nacca, fpcc, bcafn, open-canada-grants, grants-csv, bc-crf-transfers |
| **Reference** | open-canada-ckan, bc-open-data-ckan, sedar-plus |

### Scoped "Run lookup"

When the user runs a search, only sources from the **active sub-tab** are
sent to the API — the run is **scoped to the visible sub-tab**. The button
label makes this concrete:

```
Run grants & funding lookup (5)
Run contracts & bids lookup (3)
Run reference lookup (2)
```

The number in parens is `selected ∩ visibleSources`. This avoids the
"contracts source fires on a grants query" footgun while still allowing the
user to keep selections in multiple tabs.

`canRun` uses the scoped count, so disabling every source in the current
tab greys out Run even if other tabs still have selections.

---

## 2. Optional keyword (browse mode)

The keyword input is labelled `Keyword (optional)`. Every Funding source
handles an empty query gracefully and returns its default browse view:

| Source | Empty-query behaviour |
|---|---|
| canadabuys | Latest tender notices + award notices (~50 + 10) |
| merx | Latest open solicitations |
| open-canada-contracts | Latest contract awards |
| open-canada-grants | Latest grant payouts |
| bc-ministry-contracts | All contract awards from the most recent 4 quarters (newest first) |
| bc-crf-transfers | Top-dollar transfers from the 2 most recent fiscal years |
| available-grants | All 138 indexed federal funding programs |
| bc-open-data-ckan / open-canada-ckan | Top dataset matches |
| (link-only sources) | Just emit the search URL |

Server side, `POST /api/run` is mode-aware:

- `business` / `nations` — empty target rejected (`400 {mode} mode requires
  a target`); those searches are for-a-specific-thing.
- `money` — empty target accepted; body's target is normalised to `""`
  so downstream code never sees `undefined`.

The Results page header renders `Browsing (no keyword)` in italic muted
text when the target is empty.

---

## 3. Multi-mode sources

`Source.mode` was widened from a single `SourceMode` to
`SourceMode | SourceMode[]`. A source with `mode: ['money', 'business']`
appears under both tabs and is run by the same scraper. Today two sources
use this:

| Source | Modes | Why both? |
|---|---|---|
| `open-canada-grants` | money + business | Money tab: "what grants exist". Business tab: vendor-diligence flow — has this entity received federal grants? |
| `available-grants` | money + business | Money tab: "what's open to apply to". Business tab: "what should this business apply for". |

App-side: `sourceInMode(meta, mode)` in `lookup/app/src/models.ts` handles
both shapes (single value or array). The three lookup pages
(`BusinessLookup`, `MoneyLookup`, `NationsLookup`) call this helper instead
of `s.mode === 'x'`.

API-side: `sourcesByMode(mode)` in `lookup/api/src/sources/index.ts` uses
the equivalent `inMode(s, mode)` helper.

---

## 4. The `available-grants` scraper

The flagship "Open opportunities — Federal grants" source. Real scraper that
indexes 138 federal funding programs across three departmental hubs.

### Why we built it

The user asked: "how do I find *available* grants, not grants that have
been funded for an entity already?" Open Canada's grants Solr search is
**historical disclosures** of past payouts — wrong shape for that
question. The federal centralised "Find a Program" tool
(<https://innovation.ised-isde.canada.ca>) sits behind a Salesforce login
(401 on the API). `canada.ca/en/services/funding.html?q=...` returns 404
with any keyword (it's a portal landing, not a search).

What works: **departmental funding-hub HTML pages** list 20–95 program
anchors each, fetchable via Puppeteer (curl hits the Akamai 404 trap).

### Hubs we scrape

| Agency | URL | Programs |
|---|---|---|
| **CIRNAC — Crown-Indigenous Relations & Northern Affairs** | <https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249> | ~6 current calls (Modern treaty, Indigenous Women & 2SLGBTQI+, Food Security Research, Federal Interlocutor, ISC Calls for Proposals, Indigenous artists call) |
| **Canadian Heritage** | <https://www.canada.ca/en/canadian-heritage/services/funding.html> | ~39 programs (Indigenous Languages and Cultures, Canada Arts Presentation Fund, Building Communities Through Arts and Heritage, etc.) |
| **ESDC — Employment and Social Development Canada** | <https://www.canada.ca/en/employment-social-development/services/funding/programs.html> | ~95 programs (Indigenous Skills and Employment Training, Reaching Home, Canada Summer Jobs, etc.) |

### Scraping & caching

- Puppeteer-renders each hub in sequence, harvests program-link anchors
  inside `<main>`.
- Per-anchor filter: text length 8–120 chars, drop nav/breadcrumb words.
- Dedupes by absolute apply URL.
- Cached at `data/available-grants/all-hubs.json` for 24h. After warm-up,
  every keyword search is an in-memory filter — ~0 ms.
- If a hub fails mid-scrape we keep going and log; if every hub fails we
  serve stale cache rather than fail.

### Returned shape

Each item carries:

- `title` — program name as it appears on the hub
- `subtitle` — agency (CIRNAC / Canadian Heritage / ESDC)
- `url` — absolute apply-to-program URL
- `fields.agency` / `fields.apply_url` / `fields.source_hub`

Smoke-test results (`q=indigenous` from a cold start):

```
First run: 8680ms, 10 items indexed across 138 programs
 • ISC Calls for proposals (CIRNAC)
 • Modern treaty and self-government policy and awareness funding (CIRNAC)
 • Supporting Indigenous Women's and 2SLGBTQI+ Organizations program (CIRNAC)
 • Food Security Research Grant (CIRNAC)
 • Federal Interlocutor's Contribution Program (CIRNAC)
 • Call for art submissions by Indigenous artists in Canada (CIRNAC)
 • Indigenous Languages and Cultures Program (Canadian Heritage)
 • Indigenous Early Learning and Child Care - Quality Improvement Projects (ESDC)
```

Cached run for `q=languages`: **0 ms**, 2 hits (Indigenous Languages and
Cultures Program; Official Languages Support Programs).

---

## 5. Category taxonomy

Every money source's `category` is one of:

```
Open opportunities — Federal bids
Open opportunities — Federal grants
Open opportunities — Provincial bids
Open opportunities — Provincial grants
Historical disclosures — Federal contracts
Historical disclosures — Federal contracts (bulk CSV)
Historical disclosures — Federal grants
Historical disclosures — Federal grants (bulk CSV)
Historical disclosures — BC ministry contracts
Historical disclosures — BC government transfers
Reference — Open-data catalogues
Reference — Public-company filings
```

The SourcePicker already groups by `category`, so this taxonomy is what the
user sees as the second-level grouping inside each sub-tab — e.g. inside
**Grants & funding** they see two cards titled
"Open opportunities — Federal grants" (5 sources) and
"Historical disclosures — Federal grants" (with its bulk-CSV sibling).

---

## 6. Why BC Bid + CivicInfo BC stay link-only

Both BC Bid (SciQuest browser_check) and CivicInfo BC (Cloudflare) are
gated by anti-automation systems we can't pass without a paid
CAPTCHA-solving service (2captcha or similar) — verified via three
Puppeteer probes (default headless, new headless, headless + webdriver
mask + homepage pre-warm; all received "Wrong captcha answer" in the
SciQuest body). That's intentional vendor policy on the BC side.

What we did instead: the
[BC Ministry Contract Awards](https://catalogue.data.gov.bc.ca/dataset/ministry-contract-awards-province-of-british-columbia)
CKAN dataset is the **structured back-door** for BC Bid — by Procurement
Services policy (in force since July 2014) ministries are required to
publish every BC Bid contract award summary into that dataset. That's the
`bc-ministry-contracts` source, and it's where the real BC contract
results come from now.

If captcha solving becomes worth the cost later, the wire-up point is
`bc-bid` (currently link-only) in
`lookup/api/src/sources/money/link-only.ts`. See the TODO in
[lookup-endpoints.md § Notes](./lookup-endpoints.md#todos).

---

## 7. Data flow summary

```
User on Funding tab
  ↓
Subtab pill row [Contracts & bids | Grants & funding | Reference]
  ↓
SourcePicker (filtered to active sub-tab; grouped by category)
  ↓
Run button — fires sourceIds = selected ∩ visibleSources
  ↓
POST /api/run {mode:'money', target, sourceIds, indigenousOnly, ...}
  ↓
Server fans out:
  - CKAN datastore_search (bc-ministry-contracts, bc-crf-transfers,
    open-canada-ckan, bc-open-data-ckan)
  - HTML Solr scrape (open-canada-contracts, open-canada-grants)
  - HTML table parse (canadabuys, merx)
  - Puppeteer hub scrape (available-grants — first call only; 24h cache)
  - Link-only emit (everything else)
  ↓
SSE progress events → Results page
  ↓
Per-source cards with inline items, "View report" → modal, "Show all N →"
  for compact lists
```

Restart the API with `pnpm --filter @skintyee/lookup-api serve` to pick up
new sources after any commit that touches `lookup/api/src/sources/`.
