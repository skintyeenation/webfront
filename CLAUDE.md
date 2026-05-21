# Skintyee — webfront

Migration and rebuild of the Skintyee First Nation web presence: moving the
existing Site123-hosted **skintyeefirstnation.org** to a self-hosted stack at
**skintyee.ca**.

This repo is **`webfront`** (`github.com/skintyeenation/webfront.git`). The
local `skintyee/` working directory *is* the webfront repo — a **pnpm
workspace** holding the application and the website:

```
skintyee/                  # webfront repo root + pnpm workspace
  package.json             # workspace root (private), pnpm scripts
  pnpm-workspace.yaml       # members: app, packages/*  (website is NOT a member)
  app/                     # @skintyee/app — placeholder app package (empty)
  website/                 # WordPress site + migration tooling (git subtree)
```

## website/ — WordPress site & migration tooling (git subtree)

`website/` was a standalone local git repo and is now vendored into webfront as
a **git subtree** (full `develop` history preserved as ancestors of master). It
is *not* a pnpm workspace member — it's a WordPress + Docker + PHP/Python
project. Its complete original history (all branches) is archived in
`../skintyee-website-all.bundle` (outside the repo).

To pull future changes from / push back to a website remote, use
`git subtree pull --prefix=website <remote> <branch>` /
`git subtree push --prefix=website <remote> <branch>`.

**Stack:** Docker Compose (WordPress 6.7 + MySQL 8 + WP-CLI), Python 3.11
scraper, PHP/WP-CLI importer, Bash backup/restore/export scripts.

- Local WP: <http://localhost:8080> (admin/admin — local dev only)
- Crawler: `scraper/crawl.py` → `scraped/`
- Importer: `importer/import.sh` (auto-backs up first) → `importer/import.php`
- Snapshots: `backup.sh` / `restore.sh` / `wipe.sh` → `backups/`
- Production export: `export.sh` → `exports/skintyee-export.xml` (WXR)
- Source: `skintyeefirstnation.org` (Site123) → target: `skintyee.ca`

See `website/README.md` for the full workflow.

## Deployment

`website/azure-pipelines.yml` — Azure DevOps pipeline deploying the WordPress
stack over SSH (`develop` → staging, `master` → production).

- **Managed database:** production uses a **managed Azure Database for MySQL –
  Flexible Server** (no local `db` container in prod). Azure provides automated
  backups + point-in-time restore, so the DB is durable independently of the
  pipeline and is never recreated by a routine deploy. Prod runs from
  `website/docker-compose.prod.yml`, connecting over TLS.
- Each deploy snapshots wp-content (files) + an optional logical `wp db export`
  before changes; snapshots can be archived to Azure Blob.
- **Destructive DB seeding is opt-in** behind the `seedDatabase` parameter +
  environment approval.
- Setup expected: variable group `skintyee-website` (SSH_HOST, SSH_USER,
  DEPLOY_PATH, DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, optional
  AZURE_STORAGE_SAS) and SSH service connection `skintyee-host`.

**Hosting decision:** managed DB chosen because Skintyee is an **NGO** — hosting
is a tax-deductible expense, and the priority is **easy backups + auditability
over cost**. Cost basis + rationale (kept as tax-claim evidence):
[`docs/hosting-costs.md`](docs/hosting-costs.md).

## app/ — application

`@skintyee/app`, a private pnpm workspace package. Empty placeholder; nothing
scaffolded yet.

## Git conventions

Within the **`website/`** subproject history (and inherited as the team default,
see `website/CLAUDE.md`): work on `feature/*`, merge with `git merge --no-ff`
using the subject `Merge branch 'feature/<name>' into '<target>'` followed by a
blank line and a description. Default branch is `master` (not `main`).
