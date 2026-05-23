# Nations tab — plan

**Purpose:** Carve First Nation lookup out of the business-search flow into a
dedicated feature, with its own bottom tab, adapter set, and detail screen.

---

## 0. Baseline — current e2e proof

Latest run of `pnpm lookup:test` (full proof + screenshots committed under
[`lookup/api/test/results/`](../../lookup/api/test/results/)):

| Source | Mode | Strategy | Query | Status | Result | Proof |
|---|---|---|---|:---:|---|---|
| OrgBook BC | business | scrape | `Birdco` | ✅ | **7 items** — top: *BIRDCO ENVIRONMENTAL* | [screenshot](../../lookup/api/test/results/screenshots/orgbook-bc.png) |
| MRAS Canadian Business Registry | business | scrape | `Two Worlds Consulting` | ✅ | **5 items** — top: *TWO WORLD'S CONSULTING LTD.* | [screenshot](../../lookup/api/test/results/screenshots/mras.png) |
| OpenCorporates | business | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/opencorporates.png) |
| Corporations Canada (federal) | business | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/corporations-canada.png) |
| CRA Charities Listings (T3010) | business | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/cra-charities.png) |
| ISC Indigenous Business Directory | business | scrape (puppeteer) | `Cambium` | ✅ | **1 item** — *Cambium Indigenous Professional Services (CIPS) Inc.* | [screenshot](../../lookup/api/test/results/screenshots/isc-ibd.png) |
| CCAB CAB directory | business | scrape (puppeteer) | `consulting` | ✅ | **25 items** — top: *Takoda Consulting* (footer-credit false-positive now filtered out) | [screenshot](../../lookup/api/test/results/screenshots/ccab.png) |
| BC Indigenous Business Listings | business | CKAN | `consulting` | ✅ | **25 items** — top: *Strategis Consulting Group Inc.* | [screenshot](../../lookup/api/test/results/screenshots/bc-indigenous-listings.png) |
| WorkSafeBC clearance | business | link | — | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/worksafebc.png) |
| BCFSC SAFE Companies | business | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/bcfsc-safe.png) |
| BCCSA COR / equivalency | business | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/bccsa-cor.png) |
| Court Services Online (BC) | business | link | — | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/cso.png) |
| **ISC First Nation Profiles** | business | scrape (puppeteer) | `Skin Tyee` | **❌** | **0 items** — *parser doesn't see the result rows; fix planned in §5* | [screenshot](../../lookup/api/test/results/screenshots/fn-profiles.png) |
| FN Financial Management Board | business | scrape | `Tsleil` | ✅ | **1 item** — *Tsleil-Waututh Nation* | [screenshot](../../lookup/api/test/results/screenshots/fn-fma.png) |
| Company website | business | scrape | `Birdco Industrial Resources Ltd` | ✅ | **1 item** — *Birdco Industrial Resources · birdcoirl.ca* with email/phones extracted | [screenshot](../../lookup/api/test/results/screenshots/website.png) |
| Open Canada — Federal contracts | money | scrape | `First Nation` | ✅ | **10 items** — vendor, value, dept, dates | [screenshot](../../lookup/api/test/results/screenshots/open-canada-contracts.png) |
| Open Canada — Federal grants | money | scrape | `First Nation` | ✅ | **11 items** | [screenshot](../../lookup/api/test/results/screenshots/open-canada-grants.png) |
| Open Canada CKAN | money | CKAN | `Indigenous` | ✅ | **10 datasets** | [screenshot](../../lookup/api/test/results/screenshots/open-canada-ckan.png) |
| BC Open Data CKAN | money | CKAN | `Indigenous` | ✅ | **10 datasets** | [screenshot](../../lookup/api/test/results/screenshots/bc-open-data-ckan.png) |
| MERX | money | scrape | `First Nation` | ✅ | **25 items** — top: *Snaw-Naw-As Multi Use Trail (Phase 2)* | [screenshot](../../lookup/api/test/results/screenshots/merx.png) |
| BC Bid | money | link | — | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/bc-bid.png) |
| CivicInfo BC | money | link | `Indigenous` | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/civicinfo-bc.png) |
| SEDAR+ | money | link | — | ✅ | link URL emitted | [screenshot](../../lookup/api/test/results/screenshots/sedar-plus.png) |
| Federal Contracts (bulk CSV) | money | csv-bulk | — | ✅ | bulk-download URL (use `pnpm lookup:fetch:bulk`) | _no screenshot (download)_ |
| Federal Grants (bulk CSV) | money | csv-bulk | — | ✅ | bulk-download URL | [screenshot](../../lookup/api/test/results/screenshots/grants-csv.png) |

**Totals: 24 / 25 pass** · 1 fail (fn-profiles) · 180.3 s wall-clock.

The full sample of **extracted items** (top 5 per source, with every
key/value field) is in [`E2E.md`](../../lookup/api/test/results/E2E.md);
the next `pnpm lookup:test` run overwrites both that file and the
`screenshots/` folder.

> This plan is the place to document what **a Nation lookup** should
> produce. The baseline above is the state we're starting from on the
> business side, and the fn-profiles row is the proximate failure that
> motivates carving Nations out into its own surface.

---

> A **Nation is not a business.** Putting FN Profiles + FN FMB under the
> "Business" tab confused both the UX (the user couldn't find a band by
> searching for it the way they search a company) and the scraper plumbing
> (the federal IBD has nothing about Skin Tyee because the band itself isn't a
> business — its member-owned ventures might be, but the Nation itself
> belongs in the FN registry). This plan moves them and adds the right
> companion sources.

---

## 1. Scope

In:

- New **`Nations`** tab in the RN bottom-tab nav (between Money and History).
- New `mode: 'nations'` in the API and the catalogue.
- Move existing **FN Profiles** + **FN Financial Management Board** sources
  into the Nations mode.
- Add complementary Nation sources that are useless for business search but
  highly relevant for a Nation:
  - **FNFTA disclosures** (audited consolidated financial statements +
    schedule of remuneration & expenses — per-Nation PDFs published under
    Indigenous Services Canada).
  - **BC Treaty Commission status** (per-Nation treaty stage).
  - **BCAFN First Nation directory** (per-Nation overview).
  - **Federal funding to the Nation** — re-query the federal Grants &
    Contributions dataset filtered by recipient name / business number that
    matches the band.
- New **Nation Detail** screen that drills into a single band:
  - General info (Official Name, Number, Address, Phone, …)
  - Governance (Chief + council from FNGovernance.aspx)
  - Reserves (FNReserves.aspx)
  - Registered population (FNRegPopulation.aspx)
  - Federal funds the Nation receives (FederalFundsMain.aspx + open data
    grants endpoint)
- Fix the **FN Profiles scraper** so it actually returns results.

Out of scope (deferred):

- Editing/CRUDing Nation records.
- Reconciling FNFTA PDFs into structured numbers (we link to the PDF; parsing
  PDFs is a separate effort).
- Mapping every Nation to its member-owned business ventures (cross-link
  but not auto-join).

---

## 2. Source catalogue — Nations mode

| Source | Strategy | Indigenous filter | Notes |
|---|---|---|---|
| **ISC First Nation Profiles** | puppeteer (rewritten) | inherent | The primary source — per-band record, links to governance/reserves/population/federal-funds. |
| **First Nations Financial Management Board (FMB)** | HTML scrape (already done) | inherent | Lists certified Nations. Move from business → nations. |
| **First Nations Financial Transparency Act (FNFTA) disclosures** | link-only at first | inherent | Per-Nation audited statements + remuneration schedule. Link out to the ISC FNFTA page; second pass can parse the per-band PDFs. |
| **BC Treaty Commission directory** | HTML scrape | inherent | Treaty stage by Nation (BC only). |
| **BCAFN First Nation directory** | HTML scrape | inherent | Per-region BC AFN listings. |
| **Indigenous Services Canada — Funding by recipient** | reuse Open Canada CKAN grants | n/a | Same backend as Money mode, scoped to `recipient_legal_name LIKE %band%` + `owner_org=isc-sac`. |

---

## 3. API changes (`@skintyee/lookup-api`)

### Types

Extend `SourceMode`:

```ts
export type SourceMode = 'business' | 'money' | 'nations';
```

### Catalogue

`lookup/api/src/sources/index.ts` — move `fnProfiles` and `fnFma` exports
from `business/` to a new `nations/` directory. Add the new ones:

```
sources/
  nations/
    fn-profiles.ts            # rewritten (see §5)
    fn-fma.ts                 # moved from business/
    fnfta.ts                  # NEW — link-only first
    bc-treaty-commission.ts   # NEW — HTML scrape
    bcafn.ts                  # NEW — HTML scrape
    nation-funding.ts         # NEW — reuses Open Canada CKAN/grants
    band-detail.ts            # NEW — pulls per-band sub-pages on demand
```

`ALL_SOURCES` keeps the same flat list; the picker filters by `mode`.

### Server

`/api/sources?mode=nations` already works (it accepts any mode). No protocol
change needed — but the runner / report writer will inherit the new mode
automatically.

### Detail endpoint (new)

For the **Nation Detail** screen we want one HTTP call to enrich a band:

```
GET /api/nations/:bandNumber?include=governance,reserves,population,funds
```

Backed by a new `nations/band-detail.ts` that wraps puppeteer calls to:

- `FNMain.aspx?BAND_NUMBER=<n>` → official name, number, address, phone
- `FNGovernance.aspx?BAND_NUMBER=<n>` → chief + council
- `FNReserves.aspx?BAND_NUMBER=<n>` → reserves
- `FNRegPopulation.aspx?BAND_NUMBER=<n>` → registered population
- `FederalFundsMain.aspx?BAND_NUMBER=<n>` → ISC funding programs

---

## 4. App changes (`@skintyee/lookup-app`)

### Navigation

Add a fourth content tab between Money and History:

```
Home · Business · Money · Nations · History
```

Bottom-tab icon (`MaterialCommunityIcons`): `feather` or `account-group` (TBD).

### Pages

```
src/components/pages/
  NationsLookup.tsx          # mirrors BusinessLookup — name input + source picker
  NationDetail.tsx           # tap a result → drill-in screen
```

Both pages render via the same `PageContainer` and `SourcePicker` shells.
`NationsLookup.tsx` reuses the `loadSources({ mode: 'nations' })` Redux thunk.

### Detail screen layout

```
┌───────────────────────────────────────────────────┐
│ ◀ Skin Tyee                                  ⟳     │
│ Band #729 · Southbank, BC · V0J 2P0               │
│                                                    │
│ [General] [Governance] [Reserves] [Population]    │
│ [Federal funds] [FNFTA] [Map]                     │
│                                                    │
│  ──  general selected  ──                         │
│  Official Name: Skin Tyee                          │
│  Phone: (250) 694-3517                             │
│  Fax:   (250) 694-3268                             │
│  Address: PO BOX 131, SOUTHBANK, BC V0J 2P0        │
└───────────────────────────────────────────────────┘
```

Each panel pulls from `GET /api/nations/729?include=<panel>`.

### Redux

- `store/modules/sources.ts` already handles arbitrary mode — no change.
- `store/modules/nations.ts` (new) — caches per-band detail data so tab
  switches don't re-fetch.

---

## 5. Fixing FN Profiles

Current symptom: `pnpm lookup business "Skin Tyee" -s fn-profiles` puppeteer
fills `#plcMain_txtName`, clicks `form#form1` submit, but lands on a page
where my selector `a[href*="FNMain.aspx"]` matches zero links.

Plan to crack it:

1. **Capture the response URL and full DOM** after submit. Likely candidates:
   - `/fnp/Main/Search/FNListGrid.aspx?lang=eng` (grid of all FN matching)
   - Direct redirect to `/fnp/Main/Search/FNMain.aspx?BAND_NUMBER=…` when
     the query uniquely matches.
2. **Determine the result container.** It may be `.wb-tables tbody tr`,
   `gridview` table, or a series of `<a href="FNMain.aspx?BAND_NUMBER=…">`
   anchors inside a results section.
3. **Try the partial-match leading `%`** (already in code). If still 0,
   verify by re-running with the diagnostic harness used for ISC IBD.
4. **Switch to listing-grid mode** if direct search hits zero: navigate to
   `/fnp/Main/Search/FNListGrid.aspx?lang=eng` (full alphabetical list) and
   substring-match `q` against rendered Nation names. This is a viable
   fallback because the list isn't huge (~600 Nations).
5. **Cookie/session check:** the ASP.NET app may need an initial GET to
   establish session state before POST. Add a warm-up GET to `/fnp/Main/Index.aspx?lang=eng`.

Expected output items:

```ts
{
  title: "Skin Tyee",
  subtitle: "Band 729",
  url: "https://.../FNMain.aspx?BAND_NUMBER=729&lang=eng",
  snippet: "Southbank, BC · V0J 2P0",
  fields: {
    band_number: "729",
    address: "PO BOX 131, SOUTHBANK, BC",
    postal_code: "V0J 2P0",
    phone: "(250) 694-3517",
  },
}
```

---

## 6. ISC Indigenous Business Directory note

Independent of this work, the IBD page sometimes returns the "An error
occurred" canada.ca page when the puppeteer session token is not seeded by
`/reset`. Our scraper already does the `/reset` warm-up, so the error
should only surface when the federal site is itself flaking. If the user
sees it persistently, we can:

- Tighten the wait for the `#frm1` form to be visible before clicking.
- Add a single retry after the error page is detected.

This is a fix in the existing `business/isc-ibd.ts`, not in scope for the
Nations carve-out.

---

## 7. Test changes

`test/e2e-sources.ts`:

- Add a `QUERIES` mapping for the new Nations sources:
  - `'fn-profiles': '%Skin Tyee'`
  - `'fnfta': 'Skin Tyee'`
  - `'bc-treaty-commission': 'Lheidli'`
  - `'bcafn': 'Lheidli'`
  - `'nation-funding': 'Skin Tyee'`
  - `'band-detail': '729'` (band number, via the dedicated endpoint)
- E2E proof report now has three "modes" implicit in the strategy column;
  no change needed (already groups by source order).

---

## 8. Phasing

**Phase A — carve-out (small change, ship first):**

1. Add `'nations'` to `SourceMode`.
2. Move `fn-profiles` + `fn-fma` source modules from `business/` to
   `nations/`.
3. App: add the Nations tab + `NationsLookup.tsx` page (clone of
   `BusinessLookup.tsx`).
4. Fix the FN Profiles scraper (see §5) so the Nations tab returns real
   results from day one.
5. Update e2e proof.

**Phase B — companion sources:**

- FNFTA link-only entry.
- BC Treaty Commission + BCAFN HTML scrapes.
- Nation-funding adapter (Open Canada grants filtered by recipient name).

**Phase C — Nation Detail screen + endpoint:**

- `GET /api/nations/:bandNumber` aggregating the FNMain / Governance /
  Reserves / Population / FederalFunds sub-pages.
- `NationDetail.tsx` with tabbed panels.

---

## 9. Risks & open questions

- FN Profiles SearchFN form: may use a JS-driven postback that doesn't
  match my submit-button click. Mitigated by §5's listing-grid fallback.
- Per-band sub-pages each cost a puppeteer page-load (~3–5s). A full Nation
  Detail fetch is ~25s. Cache aggressively (band data changes rarely).
- The FNFTA dataset is mostly PDFs; structured extraction is a separate
  effort and not in scope.

---

## 10. Deliverables

- Docs: this plan + an update to
  [`lookup-endpoints.md`](lookup-endpoints.md) adding the Nations sources.
- API: `lookup/api/src/sources/nations/*` + extended `SourceMode`.
- App: `Nations` tab + `NationsLookup.tsx` (Phase A); `NationDetail.tsx`
  (Phase C).
- E2E: green run with Nation queries verified, screenshots committed.
