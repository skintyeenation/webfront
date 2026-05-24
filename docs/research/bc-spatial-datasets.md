# BC Crown land + Indigenous land-use plan spatial datasets

Local-only mirror of three BC Open Data spatial datasets used to
cross-reference reserve boundaries against provincial planning regions.
**Downloads land in `lookup/api/data/bc-spatial/` and are gitignored**
(too large + freshness matters more than commit history).

Refresh with:

```bash
cd lookup/api
pnpm fetch:bc-spatial            # download everything (~130 MB)
pnpm fetch:bc-spatial slrp       # SLRP only
pnpm fetch:bc-spatial public-lup # publicly-available LUPs only
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

## 3. (Not downloaded) Nation-specific LUP boundary datasets

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
