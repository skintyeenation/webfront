# Where Indigenous funding comes from in Canada

A research overview of the funding ecosystem available to First Nations,
Métis, and Inuit governments, communities, organisations, and businesses
in Canada — with a BC bias because Skin Tyee First Nation sits in BC.

For the per-endpoint reference see [`lookup-endpoints.md`](./lookup-endpoints.md),
and for how the Lookup tool exposes these sources see
[`lookup-funding-architecture.md`](./lookup-funding-architecture.md).

**Annotation key on each entry below:**

- 🟢 **Searchable in app** — a real scraper / API returns inline results in
  the Lookup tool.
- 🔵 **Link-only in app** — the Lookup tool emits a deep search URL but the
  source itself runs in your browser (often because of CAPTCHA, login, or
  bot-protection on the original site).
- ⚪ **Not yet in app** — known funding source, listed here for completeness
  but no Lookup source has been built. Candidate for the next round of
  additions (§ 7).

---

## 1. Federal — by department

### 1.1 The big two (~80% of dollars)

#### Indigenous Services Canada (ISC) — <https://www.sac-isc.gc.ca/>

Service-delivery to First Nations communities. Largest programs:

- 🔵 **First Nations Infrastructure Fund (FNIF)** — water, schools,
  community buildings, roads.
  <https://www.sac-isc.gc.ca/eng/1100100010656/1533645154710>
- 🔵 **Community Economic Development Program (CEDP)** — core funding to
  band economic-development officers + projects.
  <https://www.sac-isc.gc.ca/eng/1100100033423/1533125720602>
- 🔵 **Community Opportunity Readiness Program (CORP)** — project-stage
  capital + capacity for new ventures.
  <https://www.sac-isc.gc.ca/eng/1410204192201/1611601954610>
- 🔵 **Income Assistance** — on-reserve.
  <https://www.sac-isc.gc.ca/eng/1100100035256/1533307180220>
- 🔵 **Non-Insured Health Benefits (NIHB)** — drugs, dental, vision,
  medical transportation for First Nations and Inuit clients.
  <https://www.sac-isc.gc.ca/eng/1572537161086/1572537234517>
- 🔵 **First Nations and Inuit Health Branch (FNIHB)** programs — Mental
  Wellness Continuum, Maternal Child Health, Health Human Resources.
  <https://www.sac-isc.gc.ca/eng/1531317169084/1531317237295>
- 🔵 **Post-secondary student support** — K-12 funding, post-secondary
  student support, special education.
  <https://www.sac-isc.gc.ca/eng/1100100033601/1521124611239>
- 🔵 **First Nations Child and Family Services** — block funding for
  delegated Indigenous Child and Family Services agencies.
  <https://www.sac-isc.gc.ca/eng/1100100035204/1533307858805>
- 🟢 **Indigenous Early Learning and Child Care — Quality Improvement
  Projects** (ESDC + ISC co-delivered) — picked up by `available-grants`.

#### Crown-Indigenous Relations and Northern Affairs (CIRNAC) — <https://www.rcaanc-cirnac.gc.ca/>

Treaty, self-government, reconciliation:

- 🟢 **CIRNAC Calls for Proposals** — single live page listing all
  currently-open ISC + CIRNAC rounds. Drilled into by `available-grants`.
  <https://www.rcaanc-cirnac.gc.ca/eng/1611847555503/1611847585249>
- 🟢 **Modern treaty and self-government policy and awareness funding** —
  current.
- 🟢 **Supporting Indigenous Women's and 2SLGBTQI+ Organizations program** —
  current.
- 🟢 **Food Security Research Grant** — current.
- 🟢 **Federal Interlocutor's Contribution Program** — Métis and
  off-reserve Indigenous organisations.
- 🟢 **Call for art submissions by Indigenous artists in Canada** — current.
- 🔵 **Comprehensive land claims** settlements + implementation.
  <https://www.rcaanc-cirnac.gc.ca/eng/1100100030578/1542191417074>
- 🔵 **Modern Treaty Implementation Office** — ongoing flows to
  treaty-holding Nations.
- 🔵 **Strategic Partnerships Initiative (SPI)** — multi-departmental
  Indigenous-led economic projects.
  <https://www.sac-isc.gc.ca/eng/1330016561558/1594122175504>
- 🔵 **Residential schools settlement implementation**,
  **MMIWG National Action Plan implementation**.

### 1.2 Smaller but program-specific (federal)

| Department | Notable programs | Searchable in app |
|---|---|---|
| **Canadian Heritage (PCH)** — <https://www.canada.ca/en/canadian-heritage/services/funding.html> | Indigenous Languages and Cultures Program (~$117 M/yr since 2024) — <https://www.canada.ca/en/canadian-heritage/services/funding/indigenous-languages.html> · Building Communities Through Arts and Heritage · Canada Arts Presentation Fund · Aboriginal Sport Circle | 🟢 39 programs aggregated by `available-grants` |
| **Employment and Social Development (ESDC)** — <https://www.canada.ca/en/employment-social-development/services/funding/programs.html> | Indigenous Skills and Employment Training (**ISET**, ~$2 B over 10 yrs) — <https://www.canada.ca/en/employment-social-development/services/indigenous/training.html> · Reaching Home (homelessness) — <https://www.infrastructure.gc.ca/homelessness-sans-abri/index-eng.html> · Skills for Success · Canada Summer Jobs | 🟢 95 programs aggregated by `available-grants` |
| **Environment and Climate Change (ECCC)** — <https://www.canada.ca/en/environment-climate-change/services/environmental-funding.html> | Indigenous Guardians Program · Aboriginal Fund for Species at Risk (AFSAR) · Indigenous Climate Leadership | 🟢 ECCC hub aggregated by `available-grants` |
| **Natural Resources Canada (NRCan)** — <https://natural-resources.canada.ca/funding-partnerships> | Clean Energy for Rural and Remote Communities (CERRC) · Smart Renewables and Electrification Pathways Program (SREPs) · Indigenous Forestry Initiative | 🟢 NRCan hub aggregated by `available-grants` |
| **Fisheries and Oceans (DFO)** — <https://www.dfo-mpo.gc.ca/fm-gp/aboriginal-autochtones/index-eng.htm> | Aboriginal Aquatic Resource and Oceans Management (AAROM) · Indigenous Habitat Participation Program (IHPP) · Indigenous Marine Conservation | 🟢 DFO Indigenous hub aggregated by `available-grants` |
| **Infrastructure Canada** — <https://housing-infrastructure.canada.ca/index-eng.html> | Indigenous Community Infrastructure Fund (ICIF) · Investing in Canada Infrastructure Program — Indigenous stream | 🟢 Infrastructure hub aggregated by `available-grants` |
| **Innovation, Science and Economic Development (ISED)** | Innovative Solutions Canada — <https://ised-isde.canada.ca/site/innovative-solutions-canada/en> · Aboriginal Entrepreneurship Program (via NACCA) · Indigenous Communities Internet Connectivity | 🔵 `isc-challenges` link-only |
| **Research councils — NRC / NSERC / SSHRC / CIHR** | Indigenous-targeted research streams · Strategic Partnership Grants · IRAP — <https://nrc.canada.ca/en/support-technology-innovation/about-nrc-irap> | ⚪ |
| **PacifiCan** (BC regional) — <https://www.canada.ca/en/pacific-economic-development.html> | Regional Economic Growth through Innovation (REGI) Indigenous stream · Jobs and Growth Fund · Tourism Relief Fund Indigenous stream | 🟢 `pacifican` link-only + hub aggregated by `available-grants` |
| **PrairiesCan** — <https://www.canada.ca/en/prairies-economic-development.html> | Same REGI Indigenous-business streams | 🟢 `prairiescan` link-only + hub aggregated by `available-grants` |
| **ACOA** (Atlantic) — <https://www.canada.ca/en/atlantic-canada-opportunities.html> | Atlantic Canada Opportunities Agency Indigenous business stream | 🟢 `acoa` link-only + hub aggregated by `available-grants` |
| **CanNor** (Northern) — <https://www.cannor.gc.ca/eng/1381325363616/1381325380355> | Northern Indigenous economic development (NIEOP, IDEANorth, NICI Fund, Tourism Growth Program, etc.) | 🟢 `cannor` link-only + hub aggregated by `available-grants` |
| **FedDev Ontario / FedNor** | Ontario regional variants of REGI | ⚪ (different sub-domains; planned next round) |
| **National Defence (DND/PSPC)** | Indigenous procurement set-asides via PSIB — <https://www.sac-isc.gc.ca/eng/1100100032779/1610723194465> · Innovation for Defence Excellence and Security (IDEaS) — <https://www.canada.ca/en/department-national-defence/programs/defence-ideas.html> | 🔵 `psib` + `defence-procurement` link-only |
| **Department of Justice** | Indigenous Justice Program · Indigenous Courtwork Program — <https://www.justice.gc.ca/eng/fund-fina/index.html> | 🟢 Justice hub aggregated by `available-grants` |

---

## 2. Federal — flow-through via Indigenous-controlled bodies

### 2.1 NACCA — National Aboriginal Capital Corporations Association

🔵 **Lookup source:** `nacca` (link-only) — <https://nacca.ca/>

Federates **50+ regional Aboriginal Financial Institutions (AFIs)** and
administers federal programs on behalf of ISED:

- **Aboriginal Entrepreneurship Program (AEP)** — <https://nacca.ca/aep/>
- **Indigenous Growth Fund (IGF)** — ~$150 M evergreen capital pool —
  <https://nacca.ca/igf/>
- **Indigenous Women Entrepreneurship (IWE) Initiative** —
  <https://nacca.ca/iwe/>
- **Indigenous Tourism Stimulus Development Fund** (joint with ITAC)

AFIs relevant to Skin Tyee and the broader BC north (all ⚪ — none
indexed individually yet):

- **All Nations Trust Company (ANTCO)** — Kamloops — <https://www.antco.ca/>
- **Tale'Awtxw Aboriginal Capital Corporation** — Coast Salish —
  <https://www.taccfn.com/>
- **Nuu-chah-nulth Economic Development Corporation** — Vancouver Island
  west coast — <https://nedc.info/>
- **Métis Capital Corporation BC** — <https://mfbc.ca/about-us/mcc-bc/>
- **Tribal Resources Investment Corporation (TRICORP)** — Skeena —
  <https://tricorp.ca/>

### 2.2 BCAFN / AFN regional offices

🔵 **Lookup source:** `bcafn` (link-only) — <https://www.bcafn.ca/>

The **BC Assembly of First Nations** routes federal envelopes to member
Nations: governance training, treaty negotiation support, sector
roundtables. Not a primary grant funder but a major intermediary.

---

## 3. Provincial — BC specifically

### 3.1 BC Government — direct flows

🟢 **Lookup source:** `bc-crf-transfers` (real CKAN datastore search) —
<https://catalogue.data.gov.bc.ca/dataset/crf-detailed-schedules-of-payments-government-transfers>

Every BC payment ≥$25K published in the Public Accounts. From FYE 2023:

| Recipient | Ministry | Amount |
|---|---|---|
| First Nations Health Authority | Health | $56,695,325 |
| First Nations Health Authority | (other) | $24M+ in other ministries |
| BC First Nations Gaming Revenue Sharing LP | Indigenous Relations and Reconciliation | $74,006,791 |
| Blueberry River First Nations | Indigenous Relations and Reconciliation | $55,022,500 |
| Fort Nelson First Nation | Indigenous Relations and Reconciliation | $19,730,000 |
| Lake Babine Nation | Indigenous Relations and Reconciliation | $11,931,919 |
| **Skin Tyee Nation** | Indigenous Relations and Reconciliation | $2,235,122 |
| **Skin Tyee Nation** | Post-Secondary Education and Future Skills | $169,197 |
| **Skin Tyee Nation** | Children and Family Development | $30,000 |

### 3.2 BC ministries with Indigenous-funding lines

| Ministry | What it funds | Searchable in app |
|---|---|---|
| **Indigenous Relations and Reconciliation** — <https://www2.gov.bc.ca/gov/content/governments/organizational-structure/ministries-organizations/ministries/indigenous-relations-reconciliation> | Gov-to-gov fiscal arrangements; biggest provincial Indigenous flow | 🟢 via `bc-crf-transfers` |
| **BC First Nations Gaming Revenue Sharing LP** — <https://www2.gov.bc.ca/gov/content/governments/indigenous-people/new-relationship/gaming-revenue-sharing> | 7% of net BC Lottery gaming revenue, distributed to 203 BC First Nations on a published formula. ~$74M in FYE 2023. | 🟢 via `bc-crf-transfers` |
| **Ministry of Health → First Nations Health Authority** — <https://www.fnha.ca/> | Federal + provincial block funding to FNHA, which disburses to member Nations | 🟢 via `bc-crf-transfers` (FNHA-level only) |
| **Ministry of Forests — Forest Consultation Revenue Sharing** — <https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/consulting-with-first-nations/first-nations-negotiations/forest-consultation-and-revenue-sharing-agreements> | Stumpage and harvest receipts shared with affected Nations | 🟢 via `bc-crf-transfers` |
| **Ministry of Children and Family Development** — delegated Indigenous CFS agencies | Block funding | 🟢 via `bc-crf-transfers` |

### 3.3 BC Indigenous-led / arm's-length funders

| Funder | What it funds | Searchable in app |
|---|---|---|
| **First Peoples' Cultural Council (FPCC)** — <https://fpcc.ca/grants/> | BC Crown corp, Indigenous-controlled board. BC Language Initiative, Cultural Heritage Stewardship Program, Indigenous Arts Program, Mentor-Apprentice Program | 🔵 `fpcc` link-only |
| **New Relationship Trust** — <https://www.newrelationshiptrust.ca/funding/> | ~$135M independent endowment (2006), grants to BC First Nations for capacity building, language, economic development | 🔵 `new-relationship-trust` link-only |
| **Indigenous Tourism BC** — <https://indigenoustourismbc.com/funding/> | Sector-specific stream tied to Destination BC | 🔵 `indigenous-tourism-bc` link-only |
| **First Nations Health Authority (FNHA)** — <https://www.fnha.ca/> | Runs grants to member Nations for health programs, mental wellness, harm reduction, healthy living | 🔵 `fnha` link-only |
| **Indigenous Tourism Association of Canada (ITAC)** — <https://indigenoustourism.ca/> | National + Indigenous Tourism Stimulus Fund (with NACCA) | 🔵 `itac` link-only |
| **BC Funding Opportunities (Province-wide)** — <https://www2.gov.bc.ca/gov/content/funding> | BC government cross-ministry funding-opportunities hub (the `employment-business/business/funding-and-grants-for-business` path is 404 — this is the canonical) | 🔵 `bc-funding-finder` link-only |

---

## 4. Private + philanthropic

| Funder | Focus | Searchable in app |
|---|---|---|
| **Indspire** — <https://indspire.ca/> | Indigenous-led, ~$22M/yr in education bursaries | 🔵 `indspire` link-only |
| **Inspirit Foundation** — <https://inspiritfoundation.org/> | Indigenous youth + intercultural grants | 🔵 `inspirit-foundation` link-only |
| **Suncor Energy Foundation — Indigenous stream** — <https://www.suncor.com/en-ca/sustainability/social-investment/indigenous-relations> | Corporate foundation | ⚪ |
| **RBC Future Launch — Indigenous stream** — <https://www.rbc.com/community-social-impact/future-launch/indigenous.html> | Youth employment | ⚪ |
| **TD Indigenous Communities Program** — <https://www.td.com/ca/en/about-td/ready-commitment/indigenous-communities> | Community + cultural grants | ⚪ |
| **Bell Let's Talk Indigenous Mental Health** — <https://letstalk.bell.ca/indigenous-mental-health/> | Mental health programs | ⚪ |
| **Vancouver Foundation** — <https://www.vancouverfoundation.ca/grants> | BC community foundation; Indigenous-priority stream | 🔵 `vancouver-foundation` link-only |
| **McConnell Foundation, J.W. McConnell Family Foundation, Catherine Donnelly Foundation, McLean Foundation** | Indigenous-priority streams within broader portfolios | ⚪ |
| **Imagine Canada — Grant Connect** — <https://grantconnect.ca/> | Paid charity-funding database (~$1k/yr) | 🔵 `grant-connect` link-only (paid API for inline) |

### Resource-sector Impact-Benefit Agreements (IBAs)

Not "grants" technically, but a major and growing funding source for
Nations near major projects:

- **LNG Canada** (Kitimat) — IBAs with Haisla Nation and Coastal First
  Nations — <https://www.lngcanada.ca/about-us/indigenous-engagement/>
- **Site C dam** — IBAs with West Moberly, Halfway River, Saulteau,
  others — <https://www.sitecproject.com/about-site-c/first-nations>
- **Trans Mountain Expansion** — IBAs with 70+ Nations along the route —
  <https://www.transmountain.com/indigenous-relations>
- **TMX Indigenous Loan Guarantee Program** — federal loan-guarantee
  vehicle to help Nations equity-acquire infrastructure —
  <https://www.canada.ca/en/department-finance/programs/financial-sector-policy/indigenous-loan-guarantee-program.html>
  · 🔵 `tmx-loan-guarantee` link-only.

⚪ Project-specific IBAs themselves aren't indexed in the Lookup tool —
they're private contracts between proponents and Nations, not publicly
published. The TMX Loan Guarantee Program above is the **public**
federal mechanism that backs Nation equity participation.

---

## 5. International

⚪ None indexed in the Lookup tool. For completeness:

- **United Nations Development Programme — Equator Initiative** — small
  grants to Indigenous-led conservation —
  <https://www.equatorinitiative.org/>
- **First Nations Development Institute (US)** — occasional cross-border
  grants for Indigenous food sovereignty — <https://www.firstnations.org/>
- **Ford Foundation Indigenous Rights** —
  <https://www.fordfoundation.org/work/our-grants/build/>
- **Open Society Foundations — Indigenous rights programs** —
  <https://www.opensocietyfoundations.org/>

---

## 6. What the Lookup tool surfaces today

### Federal — Open opportunities

| Where the money is | Source ID | Status |
|---|---|---|
| 12 federal department program hubs (CIRNAC + Canadian Heritage + ESDC + NRCan + ECCC + DFO + Justice + PacifiCan + PrairiesCan + ACOA + CanNor + Infrastructure Canada) — 330 programs indexed | `available-grants` | 🟢 Puppeteer + 24h cache |
| Canada Business Benefits Finder (cross-departmental + provincial) | `fed-funding-finder` | 🔵 link-only |
| ISC + CIRNAC current calls for proposals | `isc-funding` | 🔵 link-only |
| Canadian Heritage Indigenous Languages | `ch-indigenous-languages` | 🔵 link-only |
| NACCA + 50 AFIs + Indigenous Growth Fund | `nacca` | 🔵 link-only |
| Innovative Solutions Canada R&D | `isc-challenges` | 🔵 link-only |
| ITAC — Indigenous Tourism Association of Canada | `itac` | 🔵 link-only |
| Indspire — Indigenous education bursaries | `indspire` | 🔵 link-only |
| Inspirit Foundation | `inspirit-foundation` | 🔵 link-only |
| Canada Indigenous Loan Guarantee Corporation (CILGC) | `tmx-loan-guarantee` | 🔵 link-only |
| **PacifiCan** (BC + Yukon regional dev) | `pacifican` | 🔵 link-only |
| **PrairiesCan** (MB/SK/AB regional dev) | `prairiescan` | 🔵 link-only |
| **ACOA** (Atlantic regional dev) | `acoa` | 🔵 link-only |
| **CanNor** (Northern regional dev) | `cannor` | 🔵 link-only |
| **NRCan** funding hub | `nrcan-funding` | 🔵 link-only |
| **ECCC** funding hub | `eccc-funding` | 🔵 link-only |
| **DFO** Indigenous funding | `dfo-indigenous` | 🔵 link-only |
| **Justice Canada** funding | `justice-funding` | 🔵 link-only |
| **Infrastructure Canada** | `infrastructure-canada` | 🔵 link-only |
| PSIB Indigenous business set-aside contracts | `psib` | 🔵 link-only |
| Defence procurement (DND/PSPC) | `defence-procurement` | 🔵 link-only |
| CanadaBuys (federal procurement) | `canadabuys` | 🟢 HTML scrape |
| MERX (multi-province tenders) | `merx` | 🟢 HTML scrape |

### Federal — Historical disclosures

| Where the money is | Source ID | Status |
|---|---|---|
| Federal grants paid (who got money) | `open-canada-grants` | 🟢 Solr scraper (also in Business mode) |
| Federal grants bulk CSV (~100 MB) | `grants-csv` | 🔵 link-only |
| Federal contracts paid | `open-canada-contracts` | 🟢 Solr scraper |
| Federal contracts bulk CSV (~100 MB) | `contracts-csv` | 🔵 link-only |

### Provincial — BC

| Where the money is | Source ID | Status |
|---|---|---|
| FPCC (BC language/arts grants) | `fpcc` | 🔵 link-only |
| BCAFN — BC Assembly of First Nations | `bcafn` | 🔵 link-only |
| New Relationship Trust | `new-relationship-trust` | 🔵 link-only |
| First Nations Health Authority | `fnha` | 🔵 link-only |
| Indigenous Tourism BC | `indigenous-tourism-bc` | 🔵 link-only |
| BC Funding & Grants for Business | `bc-funding-finder` | 🔵 link-only |
| Vancouver Foundation | `vancouver-foundation` | 🔵 link-only |
| BC ministry contract awards (BC Bid replacement) | `bc-ministry-contracts` | 🟢 CKAN datastore |
| BC government transfers ≥$25K (Public Accounts) | `bc-crf-transfers` | 🟢 CKAN datastore |
| BC Bid public opportunities | `bc-bid` | 🔵 link-only (CAPTCHA) |
| BC Hydro tenders | `bc-hydro-tenders` | 🔵 link-only |
| CivicInfo BC municipal bids | `civicinfo-bc` | 🔵 link-only (Cloudflare) |

### Reference / catalogues

| Where the money is | Source ID | Status |
|---|---|---|
| Open Canada CKAN datasets | `open-canada-ckan` | 🟢 CKAN search |
| BC Open Data catalogue | `bc-open-data-ckan` | 🟢 CKAN search |
| SEDAR+ public-company filings | `sedar-plus` | 🔵 link-only |
| Imagine Canada Grant Connect (paid) | `grant-connect` | 🔵 link-only |

**Total: 43 funding sources in the app today.**
**Counts:** 11 🟢 real scrapers + 32 🔵 link-only. The 🟢 scrapers cover
the highest-volume + most-structured data sources (federal Solr, CKAN
datastores, CanadaBuys, MERX, the `available-grants` hub aggregator
covering 12 federal departments → 330 indexed programs). The 🔵
link-only entries cover the regional dev agencies, Indigenous-led / BC
funders, philanthropic foundations, and sector-specific bodies.

---

## 7. Remaining gaps

The 2026-05 expansion added 11 federal department hubs to
`available-grants` and 10 new link-only entries covering the BC
Indigenous-led / provincial / philanthropic layer. What's still
unindexed:

1. **FedDev Ontario / FedNor** — Ontario regional dev agencies on
   different sub-domains (not the canada.ca template). Would need a
   per-hub scraper variant.
2. **NSERC / SSHRC / CIHR / NRC IRAP** — research-council funding;
   different application portals than the policy hubs.
3. **Suncor / RBC / TD / Bell corporate Indigenous foundations** —
   corporate-philanthropy programs without a unified search; link-only
   could be added but each lives on a different brand page.
4. **McConnell / Catherine Donnelly / McLean / Vancouver foundations**
   (other than the Vancouver Foundation main grants page) — private
   foundations with rolling calls.
5. **BC First Nations Gaming Revenue Sharing per-Nation table** —
   published annually as a PDF; OCR + cache could surface the
   per-Nation allocation as structured rows.
6. **BC Knowledge Development Fund (BCKDF)** — already on CKAN with
   `datastore_active=true`; could be a real-scraper add similar to
   `bc-crf-transfers`.
7. **Project-specific IBAs** — private contracts between proponents
   and Nations, not publicly published. Out of scope by nature.
8. **International funders** (UNDP Equator, Ford, Open Society, First
   Nations Development Institute US) — could be link-only if needed,
   but rarely the right fit for a BC band's day-to-day funding mix.

If captcha-solving becomes worth the cost, **BC Bid** and **CivicInfo
BC** would join — but the BC Ministry Contracts CKAN dataset already
covers BC Bid's award side by ministerial policy (in force since
July 2014).

---

## 8. Are all of these searchable in the app?

**Short answer:** the major federal flows are 🟢 inline-searchable today,
most of the Indigenous-led / provincial / philanthropic ones are 🔵
link-only (one click opens the source's own search), and a handful are
⚪ unindexed (listed in § 7).

**More precisely:**

- Of the **24 funding sources our Lookup tool currently exposes**, 11
  return inline results via real scrapers and 13 are clickable
  link-only entries (deep search URLs the user opens in the browser).
- Of the **~50 funders catalogued in this doc**, the ones not yet
  reachable through the tool (whether scraped or as a link-only deep
  URL) are listed in § 7 as gaps. They are mostly:
  - Department-specific hubs at NRCan / ECCC / DFO / regional agencies
    — would be straightforward to add by adding their URLs to
    `available-grants`' `HUBS` array.
  - Individual Aboriginal Financial Institutions (the AFIs federated
    by NACCA) — the `nacca` link covers them collectively.
  - BC-specific funders (New Relationship Trust, Indigenous Tourism
    BC, FNHA grants) — link-only entries would be the easy first step.
  - Private philanthropic foundations — these don't have public APIs;
    link-only is the realistic best case.
  - IBAs (resource-sector Impact-Benefit Agreements) — by their nature
    private contracts; not publicly indexable.

The fastest way to close the gap on the BC-region grants question is to
add the **PacifiCan hub** URL to `available-grants` (one line in
`lookup/api/src/sources/money/available-grants.ts`). It uses the same
canada.ca Drupal-WET template that ESDC and Canadian Heritage use, so
the existing scraper's `<main> a` extraction already works on it.

---

## 9. Funding cycle quick reference

| Phase | Typical timeframe | What to watch |
|---|---|---|
| **Federal Budget tabling** | Late March / early April | New programs announced, multi-year envelopes |
| **Treasury Board approval** | 3–6 months after Budget | Program details published |
| **Calls for Proposals** | Year-round but cluster post-TB approval | `available-grants` source |
| **Application deadlines** | Often 60–90 days from posting | Track per-program |
| **Awards announced** | 2–6 months post-deadline | `open-canada-grants` (historical) |
| **Funding agreement signed** | Same fiscal year as award | Disclosure |
| **Proactive Disclosure publishing** | Quarterly | Open Canada Solr + bulk CSV |

For BC provincial flows: the **Public Accounts** publish each fiscal
year's complete transfer list (every payee ≥$25K) ~9 months after the
fiscal-year-end (March 31). FYE 2023 data was published in early 2024
and is in the CKAN datastore today. The `bc-crf-transfers` source
queries the two most recent fiscal years by default.
