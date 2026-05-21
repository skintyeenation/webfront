# webfront

Web presence for **Skintyee First Nation** — the public website (`skintyee.ca`)
and a placeholder application, managed together as a pnpm workspace.

The site is a self-hosted WordPress install migrated from the previous
Site123-hosted `skintyeefirstnation.org`.

## Layout

```
.                      # webfront repo root + pnpm workspace
├── app/               # @skintyee/app — placeholder app package (not yet scaffolded)
├── website/           # WordPress site + migration tooling (git subtree)
├── docs/              # project docs (hosting costs / decisions)
├── package.json       # pnpm workspace root
└── pnpm-workspace.yaml
```

`website/` is vendored as a **git subtree** (not an npm package). Pull/push it
with `git subtree pull|push --prefix=website <remote> <branch>`.

## Getting started

```bash
pnpm install            # install workspace dependencies

# Run the WordPress site locally (Docker)
cd website && docker compose up -d   # http://localhost:8080  (admin/admin, dev only)
```

See [`website/README.md`](website/README.md) for the full scrape → import →
export migration workflow.

## Deployment

`website/azure-pipelines.yml` deploys the WordPress stack via Azure DevOps over
SSH (`develop` → staging, `master` → production), using a **managed Azure
Database for MySQL – Flexible Server** in production
([`website/docker-compose.prod.yml`](website/docker-compose.prod.yml)).

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — workspace overview, conventions, and decisions
- [`docs/hosting-costs.md`](docs/hosting-costs.md) — hosting cost basis + rationale
- [`website/README.md`](website/README.md) — WordPress migration tooling

## Conventions

Default branch is `master`. Work on `feature/*` branches and merge with
`git merge --no-ff` using the subject
`Merge branch 'feature/<name>' into '<target>'`.
