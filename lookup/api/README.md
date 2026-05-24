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

## Nation Detail + automatic PDF OCR via Claude

`GET /api/nations/:bandNumber` aggregates the federal **First Nation Profiles**
sub-pages (general, governance, reserves, population, Schedule of Federal
Funding, FNFTA, geo) into a single JSON document cached to
`lookup/api/data/nations/<bandNumber>.json` (24-hour TTL; pass `?refresh=1` to
re-pull).

### Schedule of Federal Funding — PDF → structured JSON

The fiscal-year PDFs at
`/fnp/Main/Search/DisplayBinaryData.aspx?BAND_NUMBER=…&FY=YYYY-YYYY` are
**scanned image submissions** — `pdftotext` returns nothing. We OCR them
automatically through the Anthropic Messages API's PDF document input
(`@anthropic-ai/sdk` — added as a dep) and extract per-line transfer payments:

```json
{
  "fiscalYear": "2006-2007",
  "bandNumber": "729",
  "bandName": "Skin Tyee",
  "transfers": [
    { "department": "Indian and Northern Affairs Canada", "program": "Capital", "amount": 412345 },
    …
  ],
  "declaredTotal": 1234567,
  "computedTotal": 1230000
}
```

Gated by `ANTHROPIC_API_KEY`. Without the key the rest of the band detail
flow proceeds unchanged; the funds rows just show the original PDF link
with a hint to set the key. Set it in a **gitignored** `.env` at
`lookup/.env`:

```
ANTHROPIC_API_KEY=sk-ant-…
# optional override:
# ANTHROPIC_MODEL=claude-sonnet-4-6
```

Per-PDF results are cached at
`lookup/api/data/nations-funds/<band>_<fy>.json` so we only spend tokens
once per (band, fiscal year). The cache is gitignored along with `data/`.

### Federal cross-check

Independently, we also fetch the **federal Proactive Disclosure of Grants &
Contributions** records for the same Nation via the existing
`open-canada-grants` adapter and aggregate them by fiscal year + department.
The grants HTML search is keyword-matched and doesn't expose a recipient-only
filter, so we **strict-filter results post-fetch** by requiring the band name
to appear in the recipient (title). This drops a lot of false positives at
the cost of missing records whose recipient name doesn't include the band
name verbatim.

A `comparison.byYear` array surfaces the per-year delta between the two
sources — PDF audited submissions vs federal disclosure — so users can spot
where one report covers payments the other doesn't.

> **Caveat:** the two sources are not directly comparable. The Schedule of
> Federal Funding PDFs are audited band submissions covering all federal
> transfers. Federal Grants & Contributions only includes agreements over
> the disclosure threshold and is keyed by recipient legal name, which can
> drift from the band name a lot of agreements were signed under. Treat the
> comparison directionally — not as a strict reconciliation. A stricter
> cross-check via the bulk grants CSV (`pnpm lookup:fetch:bulk grants`) is
> on the roadmap.

The Nation Detail "Funding" tab renders three panels:

1. **Year-over-year** stacked bars: PDF total (orange) vs Federal total (cyan).
2. **By department** pie (from OCR'd PDFs).
3. **Cross-check table** showing Δ per year, with a note that the two
   sources rarely align perfectly (different thresholds, dates, scopes).

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
