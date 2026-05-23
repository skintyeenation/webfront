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
