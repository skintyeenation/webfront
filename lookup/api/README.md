# `@skintyee/lookup-api`

Backend for the Skin Tyee Lookup tool. Two things:

- A **CLI** (`commander` + `@inquirer/prompts`) for ad-hoc lookups in the
  terminal.
- An **HTTP/SSE server** (Node `http` stdlib, no framework) that the RN
  frontend [`@skintyee/lookup-app`](../app) talks to.

The catalogue + endpoints follow
[`docs/research/lookup-endpoints.md`](../../docs/research/lookup-endpoints.md);
the design is in
[`docs/research/lookup-tool-plan.md`](../../docs/research/lookup-tool-plan.md).

## Run

```sh
# From the repo root:
pnpm lookup sources                                # list known sources
pnpm lookup business "Birdco Industrial Resources Ltd" --indigenous-only
pnpm lookup money "First Nation infrastructure" --indigenous-only --all
pnpm lookup:serve                                  # start http://127.0.0.1:5050
```

## End-to-end test (`pnpm lookup:test`)

Runs every catalogued source against a known-good query and asserts the
scrapers return ≥1 item / the link-only sources emit a valid URL. Writes a
proof report at [`test/results/E2E.md`](test/results/E2E.md) with one
section per source — extracted items + an embedded screenshot of the live
search URL.

```sh
pnpm lookup:test
# → test/results/E2E.md
# → test/results/screenshots/<source-id>.png × 25
```

## Bulk federal CSV downloads (`pnpm lookup:fetch:bulk`)

The federal Proactive Disclosure datasets ship as **~100MB CSV files** for
**contracts** (`d8f85d91-…`) and **grants & contributions**
(`432527ab-…`). They're too big to bundle into the e2e screenshot capture
(puppeteer hangs trying to render a 100MB download) and are gitignored.

Fetch them on demand:

```sh
pnpm lookup:fetch:bulk                       # both → lookup/api/out/bulk/
pnpm lookup:fetch:bulk contracts             # contracts only
pnpm lookup:fetch:bulk grants                # grants only
pnpm lookup:fetch:bulk contracts "First Nation"   # also greps for keyword
```

Once downloaded, the CSVs are local — `grep`/`awk`/`csvkit` against them for
offline keyword/vendor scans that are too broad for the HTML search portal.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/sources?mode=business\|money&indigenousOnly=1` | catalogue + defaults |
| POST | `/api/run` | `{ mode, target, sourceIds?, indigenousOnly?, website?, vendor?, fromYear?, toYear?, minValue?, maxValue? }` → `{ jobId, sourceIds }` |
| GET | `/api/jobs/:id` | full state (status, events backlog, result) |
| GET | `/api/jobs/:id/stream` | **SSE** progress (`source-start`, `source-done`, `job-done`, …) |
| GET | `/api/jobs/:id/report` | rendered markdown report |

## Output

Each run writes a self-contained folder:

```
out/
└── <slug>/<timestamp>/
    ├── report.md
    ├── inputs.json
    └── sources/
        ├── <source-id>.json
        └── <source-id>.raw.html (or .raw.json)
```

`out/` is gitignored.
