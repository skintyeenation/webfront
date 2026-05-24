# BC Crown land + Indigenous land-use plan spatial datasets

Local-only mirror of three BC Open Data spatial datasets used to
cross-reference reserve boundaries against provincial planning regions.
**Downloads land in `lookup/api/data/bc-spatial/` and are gitignored**
(too large + freshness matters more than commit history).

Refresh with:

```bash
cd lookup/api
pnpm fetch:bc-spatial                   # download every dataset (~130 MB)
pnpm fetch:bc-spatial slrp              # Strategic Land and Resource Plans
pnpm fetch:bc-spatial public-lup        # publicly-available LUPs
pnpm fetch:bc-spatial recreation        # Rec sites/reserves/interpretive forests
pnpm fetch:bc-spatial mineral-profiles  # BC mineral deposit type reference table (CSV)
```

The script lives at `lookup/api/scripts/fetch-bc-spatial.sh`.

---

## 1. Strategic Land and Resource Plans (SLRP)

**CKAN packages:**
- `strategic-land-and-resource-plans-current` (id `4b142d4c-83d6-4ecc-b66c-66601ae65992`)
- `strategic-land-and-resource-plans-all` (id `298d1034-c1be-4fd1-ad4b-d00ad5ab4b88`)

**WFS layer:** `pub:WHSE_LAND_USE_PLANNING.RMP_STRGC_LAND_RSRCE_PLAN_SVW`
on `https://openmaps.gov.bc.ca/geo/pub/wfs`.

**Owner:** Collaborative Stewardship and Cumulative Effects Management
(GeoBC / BC Ministry of Water, Land and Resource Stewardship).

### What it is

> SLRPs provide direction for Crown land use through the establishment
> of broad land use goals, planning zone designations, objectives and
> strategies. SLRP planning is an integrated regional consensus-based
> process, which **requires First Nations and public participation** to
> produce a Strategic Land and Resource Plan for review and approval by
> government.

Historical plan types include SRMPs (Sustainable Resource Mgmt), LRMPs
(Land and Resource Mgmt), RLUPs (Regional Land Use), and coastal plans.

### What we fetch

The CKAN dataset splits "Current" vs "All", but both list the **same
WFS layer URL**. The retirement filter lives at the BC Geographic
Warehouse level (registration-walled Custom Download), not in the
public WFS schema — PLAN_STATUS exposes only `Legal`/`Approved`/`NA`/
`Draft`. So we fetch the unified WFS layer as `slrp.geojson`.

**Size:** ~130 MB GeoJSON, 101 features (FY 2026).

### Sample features (random 8)

| Name | Status | Type |
|---|---|---|
| Okanagan Shuswap Land and Resource Management Plan | Legal | LRMP |
| Muskwa-Kechika Management Plan | Legal | SRMP |
| Vanderhoof Access Management Plan | Approved | LRMP |
| Southern Rocky Mountain Management Plan | Approved | SRMP |
| Kootenay Boundary Land Use Plan Implementation Strategy | Approved | RLUP |
| Kowesas Sustainable Resource Management Plan | Draft | SRMP |
| Baynes Sound Coastal Plan | Approved | CMP |
| Kispiox Sustainable Resource Management Plan | Legal | SRMP |

### Per-feature schema

```
STRGC_LAND_RSRCE_PLAN_ID            (numeric ID)
STRGC_LAND_RSRCE_PLAN_PROVID        (provincial ID)
STRGC_LAND_RSRCE_PLAN_NAME          (human name)
STRGC_LAND_RSRCE_ABRVN              (abbreviation)
PLAN_TYPE                            (SRMP | LRMP | LUP | CMP | RLUP | HLP | SLRP | STUDY AREA | EXTENT | CORE)
PLAN_STATUS                          (Legal | Approved | Draft | NA)
APPROVAL_DATE
APPROVAL_LAST_AMEND_DATE
LEGALIZATION_DATE
LEGALIZATION_LAST_AMEND_DATE
GIS_CHANGE_DATE
ENABLING_DOCUMENT_TITLE
ENABLING_DOCUMENT_URL
GEOMETRY                             (Polygon / MultiPolygon)
```

### Useful for

Cross-referencing a band's reserve(s) and traditional territory against
the regional resource-use plan governing that geography. Skin Tyee falls
inside the **Lakes North Sustainable Resource Management Plan** (Legal).

---

## 2. Publicly Available Land Use Plans

**CKAN package:** `publicly-available-land-use-plans` (id
`bf6d36c9-2588-42d9-8b1d-29bf4054275c`).

**Download:** direct shapefile zip from BC COMS API:
`https://coms.api.gov.bc.ca/api/v1/object/b2a2af52-130c-4412-abfb-320d66cd95a6`

**Owner:** GeoBC Branch.

### What it is

A small but important dataset — **6 records, every one a First
Nation–BC government co-led land use plan boundary**. These represent
the newer generation of BC land planning (post-2018), distinct from the
broader SLRPs above.

### Records (all 6)

| # | Name | Type | Region |
|---|---|---|---|
| 1 | Gwa'ni Land Use Plan | Land Use Plan | West Coast |
| 2 | Kaska-BC Land Use Planning | Land Use Plan | Northeast, Omineca, Skeena |
| 3 | Meziadin River Watershed Salmon Habitat Conservation | Land Use Plan | Skeena |
| 4 | shíshálh-BC Land Use Planning | Land Use Plan | South Coast |
| 5 | TRT-BC Tlatsini Planning Project | Land Use Plan | Skeena |
| 6 | Tahltan-BC Land Stewardship Planning | Land Use Plan | Skeena |

### Per-feature schema (.dbf)

```
UNIQUE_ID     numeric, length 10
NAME          char, length 80
TYPE          char, length 254
SUB_TYPE      char, length 254
REGION        char, length 100
```

Geometry: polygon (multi-polygon possible).

### Useful for

Identifying which Nation-led modern land use plan covers a given
geography. Several of these explicitly **codify shared decision-making**
between the BC government and the originating Nation.

---

## 3. Recreation Sites, Reserves, and Interpretive Forests Details and Closures

**CKAN package:** `recreation-sites-reserves-and-interpretive-forests-details-and-closures` (id `b0f23ae8-e0aa-449c-a806-653ba37f100a`).

**WFS layer:** `pub:WHSE_FOREST_TENURE.FTEN_REC_DTAILS_CLOSURES_SV`
on `https://openmaps.gov.bc.ca/geo/pub/wfs`.

**Owner:** Recreation Sites and Trails BC (Ministry of Forests).

### ⚠️ "Reserves" disambiguation

This dataset's **"Reserves"** are **Crown Recreation Reserves** under
**Forest Tenure Administration (FTA)** — NOT Indigenous reserves under
the Indian Act. PROJECT_TYPE codes include:

- `RR — Recreation Reserve` (Crown land set aside for future
  recreational use)
- `RTR — Recreation Trail Reserve` (the trail right-of-way reservation)
- Plus regular Recreation Sites, Interpretive Forests, and closures.

Indigenous reserve polygons are sourced separately by
`band-detail.ts` from the **NRCan CLSS Aboriginal Lands** ArcGIS layer
(see `lookup/api/src/sources/nations/band-detail.ts`).

### What it is

> The data contained within this spatial layer is an amalgamation of
> information for trails, Sites, Reserves, and Interpretive Forests
> derived from Forest Tenure Administration (FTA). The point is derived
> from the coordinates linked to each recreation number example
> (REC1567). That coordinate will identify either the trail head or the
> camping location or access point to the area. Larger areas will be a
> central point to the polygon.

Public closure list: `https://www.sitesandtrailsbc.ca/closures.aspx`.

### Size

3.2 MB GeoJSON, 2,268 features.

### Per-feature schema (selected)

```
FTEN_RPD_SYSID                (numeric ID)
FOREST_FILE_ID                (REC#### identifier — e.g. REC6233)
PROJECT_NAME                  (human name — e.g. Pilot Peninsula)
PROJECT_TYPE                  (RR / RTR / RS / IF / RTR etc.)
CLOSURE_IND                   (Y/N)
CLOSURE_DATE
CLOSURE_TYPE
SITE_LOCATION                 (nearest town/area)
DEFINED_CAMPSITES             (integer)
RECREATION_DISTRICT_CODE / _NAME
ORG_UNIT_NAME                 (Natural Resource District)
SITE_DESCRIPTION              (free-text description)
DRIVING_DIRECTIONS            (long form, often multi-paragraph)
LATITUDE / LONGITUDE
```

Geometry is point (per dataset description: trailhead / camping
location / area centroid).

### Sister dataset

`recreation-sites-reserves-and-interpretive-forests-details-and-closures-fully-attributed`
— a "Full" attributed version with additional fields. Not yet
downloaded; same WFS family.

---

## 4. Mineral Deposit Profiles (reference table — not spatial)

**CKAN package:** `mineral-deposit-profiles` (id `83195f0a-ebc7-4bed-a99c-9edcff96f445`).

**Download:** CSV (76 KB, 185 rows) — direct from
`https://catalogue.data.gov.bc.ca/dataset/.../mineraldepositprofiles.csv`.

**Owner:** BC Geological Survey.

### What it is

> Mineral Deposit Profiles provide brief summaries of the types of
> mineral deposits found in British Columbia. They include descriptions
> of host rocks, mineralogy, alteration, tectonic setting, associations,
> genetic models, and exploration guides, and give typical examples with
> grades and tonnages. Of the 160 profiles for metal, coal deposits and
> industrial minerals, 120 profile descriptions are in a compiled
> Geofile 2020-11.

This is a **reference table** of deposit *types* — not spatial. There
is no geometry. To answer "what minerals are in this geographic area"
you cross-reference this against **MINFILE** (BC Mineral Inventory
point dataset) which we don't yet mirror.

### Columns

```
BC_Profile_Code                       (A01, A02, …)
Mineral_Deposit_GROUP_or_Profile_Name (Peat, Placer Au, Porphyry Cu-Mo, …)
Alternate_Deposit_Names
Deposit_Synonyms
USGS_Model_#                          (cross-reference to USGS classification)
BC_Examples                           (named BC deposits of this type)
Global_Examples
Authors_Year
Reference                             (bibliographic citation)
URL                                   (PDF chapter in Geofile 2020-11)
```

The URL column points at per-profile chapters within
`http://cmscontent.nrs.gov.bc.ca/geoscience/PublicationCatalogue/GeoFile/BCGS_GF2020-11.pdf`
which is a single 1,000-page compendium.

### Why it matters for Skin Tyee

Skin Tyee territory borders the **Babine Lake porphyry copper belt**;
this profile table is the key to understanding which deposit types are
relevant to any future resource-extraction proposal on or near the
band's traditional territory.

---

## 5. (Not downloaded) Nation-specific LUP boundary datasets

The CKAN catalogue also publishes individual Nation-led plan boundaries
as standalone datasets, e.g.:

| Dataset | Package ID |
|---|---|
| shíshálh–BC Land Use Planning Boundary | `sh-sh-lh-bc-land-use-planning-boundary` |
| Gwa'ni Land Use Plan Boundary | `gwa-ni-land-use-plan-boundary` |
| Kaska-BC Land Use Plan Boundary | `kaska-bc-land-use-plan-boundary` |

These are higher-fidelity than the consolidated `Publicly Available
Land Use Plans` above. Pull them by package ID via CKAN
`package_show` → resource URL if needed for a specific Nation.

---

## Refresh schedule

These datasets update infrequently (~quarterly for SLRPs, less often
for LUPs). Re-running `pnpm fetch:bc-spatial` is safe — outputs
overwrite. No automatic refresh; manual on need.
