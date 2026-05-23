# Lookup endpoints — search URLs & API params

> **Tool implementation status** (2026-05-23):
> - **JSON / REST API (best path, used directly):** OrgBook BC, MRAS, Open
>   Canada CKAN, BC Open Data CKAN, BC Indigenous Business Listings (datastore).
> - **HTML scrape via `fetch` + `cheerio`:** Open Canada contracts, Open Canada
>   grants, MERX, generic company website, FN FMB list.
> - **HTML scrape via puppeteer-core (driving installed Chrome):** ISC
>   Indigenous Business Directory, CCAB CAB directory. Both reach the search
>   results page after session/form setup; row-parsing is brittle and may
>   need per-update tweaks.
> - **Link-only** (deep search URL only): Corporations Canada, CRA Charities,
>   ISC First Nation Profiles, WorkSafeBC, BCFSC SAFE, BCCSA COR, CSO,
>   OpenCorporates (free API needs a token), SEDAR+, BC Bid, CivicInfo BC,
>   plus the bulk CSV downloads.


**Purpose:** Concrete, verified search endpoints and query parameters for every
source listed in [`canadian-business-lookups.md`](canadian-business-lookups.md),
split into two practical lookups:

1. **Business lookup** — search by *name* (or BN) → company / org records
2. **Money lookup** — search by *keyword / vendor / recipient* → contracts,
   grants, funding agreements, bid solicitations

Each entry notes the **endpoint shape** (REST API / HTML / form / dataset), the
**parameters**, the **Indigenous filter** (if any), and **auth / rate
constraints**.

> Verified endpoints are marked ✅ (test-fetched 2026-05-23). Other entries are
> documented from the public site / dataset metadata but should be re-checked
> when implementing.

---

## 1. Business lookup endpoints

### 1.1 OrgBook BC — JSON API ✅

The cleanest API in the bunch. Public, no auth, JSON.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.orgbook.gov.bc.ca/api/v4/search/topic` | GET | Search registered BC orgs |
| `https://www.orgbook.gov.bc.ca/api/v4/topic/{id}/formatted` | GET | Full profile for a topic |
| `https://www.orgbook.gov.bc.ca/api/v4/topic/{id}/credentialset` | GET | All credentials (incorporation, name, address…) |
| `https://www.orgbook.gov.bc.ca/api/v4/credential` | GET | Credential search/listing |
| `https://www.orgbook.gov.bc.ca/api/v4/name/autocomplete` | GET | Name autocomplete |

**Search params (`/search/topic`):**
- `q` — query string (name or incorporation #)
- `inactive=any` (default: only active)
- `revoked=true` (include revoked credentials)
- `ordering` — one of `effective_date,-effective_date,revoked_date,-revoked_date,score,-score`
- `page`, `page_size`

**Response shape:** `{ total, page, page_size, first_index, last_index, next, previous, results: [...] }`. Each result has `id`, `source_id` (incorporation #), `type`, `names`, `addresses`, `attributes`, `credential_set`.

**Indigenous filter:** none built-in; cross-reference with ISC IBD / CCAB.

---

### 1.2 OpenCorporates — REST API (key required) ✅ (returns 401 without key)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://api.opencorporates.com/v0.4/companies/search` | GET | Cross-jurisdiction company search |
| `https://api.opencorporates.com/v0.4/companies/{jurisdiction_code}/{company_number}` | GET | Company detail |
| `https://api.opencorporates.com/v0.4/officers/search` | GET | Officer / director search |

**Params:** `q`, `jurisdiction_code` (e.g. `ca_bc`, `ca`), `country_code=ca`, `current_status`, `inactive`, `registered_address`, `page`, `per_page`, `api_token`.

**Auth:** Free tier needs an API token (header or `?api_token=`); higher volumes are paid.

**Indigenous filter:** none.

---

### 1.3 Corporations Canada — Federal Corporations Search

Form/HTML; no JSON API.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html` | GET | Search federally-incorporated companies |
| `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?p=0&corpId={id}&V_TOKEN=...&crpNm=...&crpNmbr=...&bsNmbr=...` | GET | Company detail page |

**Params:** `V_SEARCH.command=navigate`, `V_TOKEN`, `crpNm` (name), `crpNmbr` (corp #), `bsNmbr` (BN), `V_SEARCH.docsStart=0`.

**Indigenous filter:** none.

---

### 1.4 MRAS Canadian Business Registry — cross-jurisdiction

| Endpoint | Method | Purpose |
|---|---|---|
| `https://ised-isde.canada.ca/cbr-rec/en/search/results?search={query}` | GET | Name / number search across BC, federal, AB, ON… |
| `https://ised-isde.canada.ca/cbr-rec/en/search/details?jurisdiction={code}&identifier={id}` | GET | Profile redirect |

**Indigenous filter:** none.

---

### 1.5 BC Corporate Registry / Corporate Online — paid, gated

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.corporateonline.gov.bc.ca/` | UI | Search & purchase Company Summary, certified copies |

No automatable public endpoint. Use OrgBook BC for free reads; this is for the paid Company Summary.

---

### 1.6 CRA Charities Listings — T3010 returns

| Endpoint | Method | Purpose |
|---|---|---|
| `https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch?request_locale=en` | GET (form POST) | Search registered charities |
| `https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/t3010/v23/t3010Schdl1-eng.action?b={BN}&fpe={fiscal_period_end}` | GET | T3010 schedule by BN + fiscal period |

**Params (form):** `dsrdPg` (page #), `bsnssNm` (charity name), `bn` (BN/registration #), `cty` (city), `prv` (province), `cntry` (country), `chrtyStts` (status: registered, revoked).

**Returns:** revenue, expenses, salaries, donations, programs, directors.

**Indigenous filter:** none built-in (but many Indigenous orgs file T3010 if charitable).

---

### 1.7 CRA — GST/HST Registry confirmation

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.businessregistration-inscriptionentreprise.gc.ca/ebci/brom/registry/registrySearch.action` | POST (form) | Confirm a GST/HST # is valid for a name + transaction date |

**Params:** `gstNumber`, `bsnssNm`, `trnsctnDt`. Returns `valid`/`invalid` only — no financials.

---

### 1.8 ISC — Indigenous Business Directory (IBD)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.sac-isc.gc.ca/REA-IBD/eng/search` | GET (form) | Detailed search |
| `https://www.sac-isc.gc.ca/REA-IBD/eng/profile?id={profile_id}&index={n}` | GET | Business profile |
| `https://www.sac-isc.gc.ca/REA-IBD/eng/reset` | GET | Reset session (use before each search) |

**Params (form):** `bsnssNm`, `cty`, `prv`, `naics`, `ndgnsGrp` (First Nations / Inuit / Métis), `cprtRgstrtnNmbr`. **Inherently Indigenous-only.**

**Note:** session-dependent — needs cookie jar. Profile IDs are stable.

---

### 1.9 CCAB — Certified Aboriginal Business directory

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.ccab.com/cab-directory/` | GET | Filterable directory of audited CAB-certified businesses |

**Params:** UI-driven (`industry`, `province`, `level` = CAB1/CAB2/CAB3, `keyword`); URL params expose these as query string.

**Inherently Indigenous-only.**

---

### 1.10 BC Indigenous Business Listings — Open Data dataset

| Endpoint | Method | Purpose |
|---|---|---|
| `https://catalogue.data.gov.bc.ca/dataset/bc-indigenous-business-listings` | GET | Dataset landing |
| `https://catalogue.data.gov.bc.ca/api/3/action/package_show?id=bc-indigenous-business-listings` | GET | CKAN metadata |
| `https://catalogue.data.gov.bc.ca/api/3/action/datastore_search?resource_id={resource_id}&q={query}` | GET | CKAN datastore query (when resource is in datastore) |

**Inherently Indigenous-only.**

---

### 1.11 WorkSafeBC — Clearance Letter

| Endpoint | Method | Purpose |
|---|---|---|
| `https://online.worksafebc.com/anonymous/clearance/` | GET (form) | Verify a contractor's WSBC account is in good standing |

**Params:** `accountNumber` or business name. Returns clearance letter PDF / status. No financials, just compliance.

---

### 1.12 BC Forest Safety Council — SAFE Companies list

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.bcforestsafe.org/safe-companies/safe-program/safe-companies-list/` | GET | Browse / search SAFE-certified companies |

---

### 1.13 BCCSA — COR / equivalency company search

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.bccsa.ca/find-a-cor-cor-equivalency-company/` | GET | Search COR / COR-equivalent BC construction safety certifications |

---

### 1.14 Court Services Online (CSO) BC — civil/Supreme court files

| Endpoint | Method | Purpose |
|---|---|---|
| `https://justice.gov.bc.ca/cso/esearch/civil/partySearch.do` | POST (form) | Search civil court party files (litigation by/against a company) |

**Params:** `lastName`, `firstName` / `organizationName`, `partyType`, `courtClass`, etc. Documents are paywalled; search index is free.

---

### 1.15 BC Personal Property Registry (PPSA) — liens

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.bcregistry.gov.bc.ca/ppr/` | UI | Search secured-interests filings against a debtor |

Paid only — no scrape path.

---

### 1.16 ISC — First Nation Profiles

| Endpoint | Method | Purpose |
|---|---|---|
| `https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/SearchFN.aspx?lang=eng` | GET (form) | Search First Nation by name / province / band # |
| `https://fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/FNMain.aspx?BAND_NUMBER={band#}&lang=eng` | GET | Full FN profile (council, demographics, lands, FNFTA links) |

**Inherently First-Nation-only.**

---

### 1.17 First Nations Financial Transparency Act records

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.sac-isc.gc.ca/eng/1322056355024/1571080676226` | GET | Hub page listing audited consolidated statements + Schedule of Remuneration and Expenses (where filed) |

No index API; individual band PDFs linked from FN Profile pages.

---

### 1.18 First Nations Financial Management Board (FMB)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://fnfmb.com/en/our-work/financial-management-system-certification` | GET | List of FMA-certified First Nations |

---

## 2. Money lookup endpoints — grants, contracts, bids, funding agreements

### 2.1 search.open.canada.ca/contracts — Federal Proactive Disclosure of Contracts ✅

> The single most useful "who currently has the contracts" endpoint.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://search.open.canada.ca/contracts/?search_text={query}` | GET | HTML search across all federal contracts > $10K |
| `https://search.open.canada.ca/contracts/record/{owner_org},{contract_id},{status}` | GET | Individual contract detail |

**Params (verified):**
- `search_text` — keyword (vendor name, scope, anything)
- `sort` — `best_match`, `contract_date_desc`, `contract_value_desc`
- `page` — pagination
- `contract_year`, `contract_month`
- `owner_org` — department (e.g. `pspc`, `isc-sac`, `cirnac-rcaanc`)
- `total_contract_value`, `original_contract_value`, `amendment_value` — value buckets
- `trade_agreements`, `country_of_vendor`, `intellectual_property`
- `solicitation_procedure`, `instrument_type`, `commodity`
- `limited_tendering_reason`, `trade_agreement_exceptions`
- `former_public_servant`, `standing_offer`, `ministers_office_contracts`
- **`procurement_strategy_indigenous_business`** — PSIB indicator → **Indigenous-only filter**
- **`comprehensive_land_claims_agreement`** — CLCAA indicator → set-aside contracts under modern treaties

**Bulk dataset (CSV download):**
- Main file: `https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv`
- Legacy: `…/resource/7f9b18ca-…/download/load-contracts-2020-10-01.csv`
- Nil reports: `…/resource/fa4ff6c4-…/download/contracts-nil.csv`
- Aggregated ≤$10K: `…/resource/2e9a82e2-…/download/contractsa.csv`
- Schema (JSON): `https://open.canada.ca/data/recombinant-published-schema/contracts.json`

> The HTML search is a thin wrapper over a Solr index — easy to scrape;
> downloading the CSV is more reliable for keyword scans at scale.

---

### 2.2 search.open.canada.ca/grants — Federal Grants & Contributions ✅

> The single most useful "where can I find money" endpoint.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://search.open.canada.ca/grants/?search_text={query}` | GET | HTML search of federal grants & contributions |
| `https://search.open.canada.ca/grants/record/{owner_org},{agreement_number},{status}` | GET | Individual grant detail (e.g. `pc%2C154-2025-2026-Q3-00089%2Ccurrent`) |
| `…?amendments` | GET | Amendments view of an agreement |

**Params (verified):**
- `search_text`
- `sort` — `best_match`, `agreement_start_date+desc`, `agreement_value+desc`
- `page`
- `owner_org` — funding department (`isc-sac`, `cirnac-rcaanc`, `ised-isde`, `pacifican`, `prairiescan`…)
- `fiscal_year` / `calendar_year`
- `agreement_value` — value buckets
- `agreement_type` — `grant`, `contribution`, `other_transfer_payment`
- `recipient_province`
- `recipient_business_number`

**Indigenous filter:** no single flag — filter by `owner_org=isc-sac` / `cirnac-rcaanc`, or by `search_text` keywords ("Indigenous", "First Nation", "Métis", "Inuit").

**Bulk dataset:** federal grants CSV under <https://open.canada.ca/data/en/dataset/432527ab-7aac-45b5-81d6-7597107a7013>.

---

### 2.3 Open Canada — CKAN dataset search API ✅

| Endpoint | Method | Purpose |
|---|---|---|
| `https://open.canada.ca/data/api/3/action/package_search?q={query}&rows={n}&start={offset}` | GET | Federal CKAN dataset search |
| `https://open.canada.ca/data/api/3/action/package_show?id={dataset_id}` | GET | Dataset metadata |
| `https://open.canada.ca/data/api/3/action/datastore_search?resource_id={resource_id}&q={query}` | GET | Query in-CKAN-datastore resources |

**Response:** standard CKAN — `success`, `result.count`, `result.results[]`, `result.facets`, `result.facet_ranges`.

**Useful sorts:** `score desc, metadata_modified desc`.

---

### 2.4 BC Open Data Catalogue (CKAN) ✅

| Endpoint | Method | Purpose |
|---|---|---|
| `https://catalogue.data.gov.bc.ca/api/3/action/package_search?q={query}&rows={n}` | GET | BC CKAN dataset search |
| `https://catalogue.data.gov.bc.ca/api/3/action/datastore_search?resource_id={resource_id}&q={query}` | GET | Datastore search where available |

Use to find provincial grant / contract / Indigenous datasets (e.g. BC Indigenous Business Listings, NEB/EAO/MNR datasets).

---

### 2.5 BC Bid — Contract Awards & opportunities

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.bcbid.gov.bc.ca/page.aspx/en/buy/homepage` | UI | Bid portal homepage |
| `https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/contract_award_list_public` | UI | Public contract awards list |
| `https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/public_award_view/{award_id}` | UI | Individual award detail |

Session-/JS-heavy SciQuest portal; scraping needs Puppeteer or the export-CSV from the awards list. No public JSON API.

**Indigenous filter:** no portal-level toggle; search by keyword and by Indigenous-set-aside language in the solicitation title/scope.

---

### 2.6 MERX — federal & multi-province tenders ✅

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.merx.com/public/solicitations/open?keywords={query}&pageNumber={n}&language=EN` | GET | Public open-solicitations search |
| `https://www.merx.com/public/solicitations/awards?keywords={query}` | GET | Awarded solicitations |
| `https://www.merx.com/public/supplier/interception/view-notice/{notice_id}?origin=0` | GET | Notice detail |

**Params:** `keywords`, `pageNumber`, `language`, plus filterable `category`, `region`, `status` (`Open Solicitations`, `Closed Solicitations`, `Bid Results`, `Awarded Solicitations`), `timeRange`.

**Indigenous filter:** filter `keywords=Indigenous` (or `First Nation`, `Métis`, `Inuit`) — no dedicated flag.

---

### 2.7 CivicInfo BC — Bids opportunities (BC municipal & local-government)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.civicinfo.bc.ca/bids` | GET | Browse / keyword search current municipal opportunities |
| `https://www.civicinfo.bc.ca/bids/results?keyword={query}&category={cat}&region={region}` | GET | Filtered results |

HTML scrape. Awards disclosure varies by municipality.

---

### 2.8 ISC / CIRNAC — funding & program pages (non-search)

These departments publish program landing pages with eligibility & application
links. Useful as catalogue, not a search index:

- `https://www.sac-isc.gc.ca/eng/1100100013700/1611348789750` — ISC funding programs index
- `https://www.rcaanc-cirnac.gc.ca/eng/1100100013785/1611333770320` — CIRNAC funding
- Federal grants for any of these flow through #2.2 above.

---

### 2.9 First Nations Tax Commission — laws / property tax filings

| Endpoint | Method | Purpose |
|---|---|---|
| `https://fntc.ca/laws/` | GET | Search FN-enacted laws (FMA/Indian Act s.83) |

---

### 2.10 BC Treaty Commission — treaty negotiations status

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.bctreaty.ca/first-nations` | GET | Per-Nation treaty status |

---

### 2.11 SEDAR+ — public-company filings

| Endpoint | Method | Purpose |
|---|---|---|
| `https://www.sedarplus.ca/csa-party/service/create?targetUrl=…` | UI | Search a public issuer's filings (financials, MD&A, AIF) |

Only relevant for *publicly-traded* counterparties — not private contractors.

---

## 3. Indigenous-only filter — how each source supports it

| Source | Indigenous filter mechanism |
|---|---|
| ISC Indigenous Business Directory | Inherently Indigenous-only; `ndgnsGrp` selects First Nations / Inuit / Métis |
| CCAB CAB directory | Inherently Indigenous-only (audited CAB certification) |
| BC Indigenous Business Listings (open data) | Inherently Indigenous-only dataset |
| ISC First Nation Profiles | Inherently First-Nation-only |
| FNFMB certified list | Inherently First-Nation-only |
| BCAFN directory | Inherently First-Nation-only |
| search.open.canada.ca/contracts | `procurement_strategy_indigenous_business=Y` and/or `comprehensive_land_claims_agreement=Y` |
| search.open.canada.ca/grants | Filter by `owner_org=isc-sac` or `cirnac-rcaanc`, plus keyword filter |
| MERX, CivicInfo BC, BC Bid | No dedicated flag — keyword filter only (`Indigenous`, `First Nation`, `Métis`, `Inuit`) |
| OrgBook BC, OpenCorporates, Corporations Canada, MRAS, CRA Charities, CSO, PPSA | No filter; cross-reference results against ISC IBD / CCAB / FN Profiles |

**Tool implementation:** a single **"Indigenous-only"** checkbox flips the
appropriate flag on each source: PSIB/CLCAA on contracts, ISC/CIRNAC org-filter on
grants, keyword OR on MERX/CivicInfo/BC Bid, and excludes sources whose results
can't be filtered (or routes them through ISC IBD / CCAB as the seed list).

---

## 4. Endpoint cheat-sheet (for the tool)

| Mode | Source | Endpoint shape | Format |
|---|---|---|---|
| Business | OrgBook BC | `…/api/v4/search/topic?q={q}` | JSON |
| Business | OpenCorporates | `…/v0.4/companies/search?q={q}&jurisdiction_code=ca_bc&api_token=…` | JSON (key) |
| Business | MRAS | `…/cbr-rec/en/search/results?search={q}` | HTML |
| Business | Corporations Canada | `…/fdrlCrpSrch.html?crpNm={q}` | HTML |
| Business | CRA Charities | `…/dsplyBscSrch?bsnssNm={q}` (form) | HTML |
| Business | ISC IBD | `…/REA-IBD/eng/search?bsnssNm={q}` (form, session) | HTML |
| Business | CCAB | `…/cab-directory/?keyword={q}` | HTML |
| Business | WorkSafeBC | `…/anonymous/clearance/?accountNumber={n}` (form) | HTML/PDF |
| Business | BC Open Data — Indigenous biz | CKAN datastore | JSON |
| Business | First Nation Profiles | `…/SearchFN.aspx?bsnssNm={q}` (form) | HTML |
| Money | Open Canada Contracts | `…/contracts/?search_text={q}[&procurement_strategy_indigenous_business=Y]` | HTML (Solr) |
| Money | Open Canada Grants | `…/grants/?search_text={q}[&owner_org=isc-sac]` | HTML (Solr) |
| Money | Open Canada CKAN | `…/api/3/action/package_search?q={q}` | JSON |
| Money | BC Open Data CKAN | `…/api/3/action/package_search?q={q}` | JSON |
| Money | MERX | `…/public/solicitations/{open|awards}?keywords={q}` | HTML |
| Money | BC Bid | portal UI (no JSON API) | HTML/CSV export |
| Money | CivicInfo BC | `…/bids/results?keyword={q}` | HTML |
| Money | Contracts CSV | `…/contracts.csv` (bulk) | CSV |
| Money | Grants CSV | `…/grants.csv` (bulk) | CSV |

---

## Notes

- HTML-scrape endpoints can change layout — keep a single `cheerio` selector
  module per source to localize breakage.
- For the federal contracts/grants Solr search, the **CSV bulk download** is
  more durable than scraping the HTML (no selectors, just `csv-parse`). For
  freshness, the HTML search is the real-time view.
- OpenCorporates needs an **API token** even on the free tier — sign up at
  <https://opencorporates.com/api_accounts/new>.
- Several sources (PPSA, BC Corporate Online paid summary, CSO documents,
  ISNetworld) are **paywalled** and excluded from automation by design.
