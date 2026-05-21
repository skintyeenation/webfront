# Skin Tyee — webfront

Migration and rebuild of the Skin Tyee First Nation web presence: moving the
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

**Hosting decision:** managed DB chosen because Skin Tyee is an **NGO** — hosting
is a tax-deductible expense, and the priority is **easy backups + auditability
over cost**. Cost basis + rationale (kept as tax-claim evidence):
[`docs/hosting-costs.md`](docs/hosting-costs.md).

## app/ — application

`@skintyee/app`, a private pnpm workspace package: the Skin Tyee community mobile
+ web app. **React Native + Expo**, reusing the **ppt (Mediashare / PocketPT)**
app's stack, theme, and conventions — React Native Paper (Material UI,
`MD2DarkTheme` cyan/orange dark theme), Redux Toolkit `createAsyncThunk` via the
`makeActions` snake_case factory, React Navigation 6. Path alias `skintyee/*` →
`app/src/*`.

It is a **single self-contained package** — there is **no** ppt-style shared
source library + app-shell/git-submodule split (that exists only to white-label
multiple apps; Skin Tyee is one app).

**Features** (role-gated for Public / Band Member / Admin+Staff, from
`docs/SkinTyee.drawio.pdf`): a charts **Dashboard**, Directory, Community Events,
**Notifications** (categories mirror the skintyee.ca WordPress taxonomy —
Health/Safety/Council/Events/Programs/News/Announcements; Events+Notifications
are centered in the tab bar), Band Meetings, **Public Records → Transparency**
(band expenditures by program area with drill-down breakdowns of how much was
spent and where), Time Keeping, Financial Records, Polling/Surveys. Charts use a
dependency-free in-house `BarChart`.

Financial/program data is sourced (when integrated) from the **Ferrus ASAP Suite
+ Adagio / Sage 300** (program areas map to ASAP modules); notifications from the
**skintyee.ca WordPress** feed. Both are mocked in the POC.

**This is a proof-of-concept** for a proposal (3-month engagement). All backend
access is **mocked** behind a typed `ApiService` (`src/services/api/`); auth is a
**stubbed dev role switcher** (`src/store/modules/auth.ts` + the Account screen).
Every stub is catalogued in **`app/STUBS.md`**.

**Intended real services are Azure** (not the AWS services ppt used): Microsoft
**Entra ID** for auth (not Cognito), **Azure Blob Storage** for files (not S3),
**Azure Cloud DB** + an API Server. Distribution via **TestFlight** (iOS) and
**Google Play** (Android) using EAS Build.

**Docs** (`docs/`): `app-plan.md` (build plan), `architecture-decisions.md`
(service ADRs), `roadmap.md` (3-month timeline), `testing-strategy.md`,
`Skintyee-App-Proposal.pptx` (proposal deck).

Run: `pnpm --filter @skintyee/app start` (Expo). Work on branch `feature/app`.

## Git conventions

Within the **`website/`** subproject history (and inherited as the team default,
see `website/CLAUDE.md`): work on `feature/*`, merge with `git merge --no-ff`
using the subject `Merge branch 'feature/<name>' into '<target>'` followed by a
blank line and a description. Default branch is `master` (not `main`).
