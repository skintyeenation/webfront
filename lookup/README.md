# Skin Tyee Lookup

A full-blown lookup tool — built like a band-app counterpart — that automates
the search across Canadian business registries (BC, federal, Indigenous-only,
charities, safety certifications) and government **money** (federal contracts,
grants & contributions, provincial bids, funding agreements).

Two pnpm packages:

| Package | What it is |
|---|---|
| [`lookup/api`](api) — `@skintyee/lookup-api` | CLI + HTTP/SSE server + scrapers |
| [`lookup/app`](app) — `@skintyee/lookup-app` | React Native + Expo frontend (same theme as `@skintyee/app`) |

Docs:
- [Endpoints reference](../docs/research/lookup-endpoints.md)
- [Tool plan](../docs/research/lookup-tool-plan.md)
- [Lookup catalogue (background)](../docs/research/canadian-business-lookups.md)

## Run

```sh
# CLI (no app needed)
pnpm lookup sources
pnpm lookup business "Birdco Industrial Resources Ltd" --indigenous-only
pnpm lookup money "First Nation infrastructure" --indigenous-only --all

# App (RN + Expo) talking to the local API
pnpm lookup:serve         # in one terminal — backend on :5050
pnpm lookup:app:web       # in another — web build of the RN app
# (or `pnpm lookup:app` for the full Expo dev menu: iOS / Android / web)
```

## Indigenous-only

A single switch in both the CLI (`--indigenous-only`) and the app flips:

- **PSIB / CLCAA** flags on federal contracts (`procurement_strategy_indigenous_business=Y`).
- **ISC + CIRNAC org-filter** on federal grants.
- **Indigenous keyword OR** on MERX / CivicInfo / BC Bid (no dedicated flag).
- Auto-checks inherently-Indigenous directories (ISC IBD, CCAB, FN Profiles, BC Indigenous Business Listings).

## Output

Every run writes to `lookup/api/out/<slug>/<timestamp>/`:

```
report.md
inputs.json
sources/
  <source-id>.json
  <source-id>.raw.html (or .raw.json)
```
