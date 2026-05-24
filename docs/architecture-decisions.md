# Architecture Decisions — Skin Tyee App

Decision record for the Skin Tyee app (`@skintyee/app`, in `app/`). Lives in the
**root webfront repo** docs. Companion to [`app-plan.md`](./app-plan.md).

> **Context:** the app reuses the ppt (Mediashare / PocketPT) app's stack, theme,
> and conventions, but the *backing cloud services* are deliberately Azure, not
> the AWS services ppt happened to use. The platform is already Microsoft/Azure
> end-to-end (Azure DNS zones, Azure Cloud DB, Outlook email relay, Microsoft
> Teams, Azure Storage backups — per `SkinTyee.drawio.pdf`), so the app follows
> suit.

## Decisions

### ADR-1 — Auth: Microsoft Entra ID (not AWS Cognito)
- **Decision:** real authentication will use **Microsoft Entra ID (Azure AD)**.
- **Replaces:** ppt used AWS Cognito (via AWS Amplify).
- **Why:** matches the org's Microsoft/Azure footprint (Teams, Outlook, Azure).
- **Intended path:** OIDC / MSAL flow via `expo-auth-session`, mapping Entra app
  roles or group claims onto the app's `Role` union (`public | member | admin`).
- **Status:** **stubbed.** A dev role switcher (`src/store/modules/auth.ts` +
  the Account screen) stands in for real sign-in. See `app/STUBS.md`.

### ADR-2 — Object storage: Azure Blob Storage (not AWS S3)
- **Decision:** file/object storage will use **Azure Blob Storage**.
- **Replaces:** ppt used AWS S3 (media uploads).
- **Why:** consistent with the diagram (Azure Storage, write-only automated
  backups) and the Azure-everywhere posture.
- **Status:** **not yet implemented** — no upload/storage feature exists in this
  build. Forward decision only.

### ADR-3 — Backend & database: API Server → Azure Cloud DB
- **Decision:** a future **API Server** backed by **Azure Cloud DB**, served at
  `App.SkinTyee.ca` (per diagram).
- **Status:** **mocked.** All data access goes through the typed `ApiService`
  seam (`app/src/services/api/`), currently served by an in-memory mock. Swap in
  an HTTP implementation when the API exists. See `app/STUBS.md`.

### ADR-5 — Financial data: Ferrus ASAP Suite + Adagio / Sage 300
- **Decision:** band financial & program data is sourced from the **Ferrus
  Computers ASAP Suite** (<https://www.ferruscomputers.ca/>) integrated with
  **Adagio Accounting** / **Sage 300** — the systems already used for First
  Nations administration (and shown as Adagio/ASAP/Sage in `SkinTyee.drawio.pdf`).
- **ASAP modules** that map to the app's program areas: Housing & Community
  Infrastructure, Income Assistance, Membership, Post-Secondary, Training &
  Employment, Child & Family Services. Ferrus also offers a Microsoft Azure
  cloud option, consistent with our Azure posture.
- **Used for:**
  - **Public Records → Transparency:** public band **expenditures by program
    area** (Housing, Public Works, Education, Employment & Training, Health,
    Social Assistance, Child & Family Services, IT, Administration), each with a
    drill-down breakdown of *how much was spent and where* — supporting
    **transparent band management**.
  - **Financial Records** (admin) and the **Dashboard** charts.
- **Status:** **mocked** behind `ApiService.transparency` / `ApiService.financials`.
  Replace with a Ferrus/Adagio integration (likely via the API Server). See
  `app/STUBS.md`.

### ADR-6 — Notifications mirror the WordPress category taxonomy
- **Decision:** in-app notifications use the **same categories as skintyee.ca**
  (the WordPress site in `website/`): top-level **Events / Programs / News /
  Announcements**, with Announcements sub-categories **Health / Safety /
  Council** (authoritative source: `website/importer/setup-categories.php`).
- **Why:** when the WordPress integration lands, notifications are driven by
  posts in these categories — e.g. a **Water Boil Advisory → Health**, a
  **wildfire notice → Safety** — so the app and site stay consistent.
- **Status:** categories are modelled now; **real push delivery** and the
  WordPress feed are **stubbed**. See `app/STUBS.md`.

### ADR-4 — Single self-contained app (no source-lib / app-shell split)
- **Decision:** `@skintyee/app` is **one pnpm workspace package**; no shared
  source library and no white-label app-shell/git-submodule wrapper.
- **Why:** the ppt split exists only to white-label multiple apps from one
  source. Skin Tyee is a single app and does not need it.

### ADR-7 — API: NestJS + Prisma + Azure MySQL, contract-first (OpenAPI)
- **Decision:** build the API Server as **NestJS (TypeScript)** with **Prisma**
  over **Azure Database for PostgreSQL – Flexible Server** (with the **PostGIS**
  extension), authenticated by **Microsoft Entra ID** (Nest guards mapping app
  roles → member/staff/admin), Dockerized to **Azure Container Apps** behind
  `api.skintyee.ca`, CI via **Azure DevOps**.
- **Contract-first:** [`api/openapi.yaml`](../api/openapi.yaml) is the source of
  truth (the contract the app's `ApiService` targets); the app's typed client is
  generated from it and the implementation is validated against it in CI.
- **Why NestJS:** same language as the app, matches the ppt platform the team
  knows, first-class OpenAPI + guards for the role-based access already specified
  in the spec. **Why PostgreSQL + PostGIS:** first-class **geospatial** support
  for the diagram's **Land Allocation / GIS mapping** and the meeting/event map
  pins (lat/lng + spatial queries); managed Postgres still gives auto backups +
  PITR (the NGO priority) and SQL aligns with the Ferrus/Adagio (Sage 300) data
  flows (ADR-5). The WordPress site stays on **MySQL** (WordPress requires it);
  the API uses Postgres for the GIS needs.
- **Status:** **NestJS implemented** in `api/` against the spec — all endpoints,
  role-gated writes (via `x-role` header standing in for Entra ID), Swagger UI,
  in-memory data layer. **Next:** Prisma + Azure PostgreSQL/PostGIS persistence,
  real Entra ID JWT validation, and the Ferrus/WordPress integrations (Phase 2,
  see [`roadmap.md`](./roadmap.md)). Full rationale + stack table:
  [`api/README.md`](../api/README.md).

### ADR-8 — Docs distribution: SharePoint mirror, push-triggered via GitHub Actions
- **Decision:** the `docs/` tree in this repo is the source of truth, and every
  push to `master` that touches `docs/` **auto-mirrors** the tree (both raw
  markdown and a pandoc-rendered HTML sibling) to a SharePoint document library
  via the **Microsoft Graph API**, authenticated by an Entra ID app with the
  **`Sites.Selected`** application scope scoped to a single SharePoint site.
- **Replaces:** nothing — this is a new distribution channel. Previously
  non-developer staff would have had to browse GitHub to read docs.
- **Why this shape:**
  - **GitHub Actions over Azure DevOps** — the repo lives on GitHub. There is
    no existing ADO pipeline for webfront (the only ADO pipeline in the
    project is `website/azure-pipelines.yml` for the WordPress site). GitHub
    Actions is the path of least resistance; the workflow file lives next to
    the code it triggers on. ADO would add a mirror-or-poll step we don't
    need.
  - **`Sites.Selected` over `Sites.ReadWrite.All`** — least-privilege. By
    itself `Sites.Selected` grants no SharePoint access; the admin then
    explicitly authorizes the app for one specific site (PnP
    `Grant-PnPAzureADAppSitePermission`). If the GitHub Actions client_secret
    leaks, the blast radius is one site, not the whole tenant.
  - **Both .md and .html, not just one** — `.md` so the source is preserved
    and diffable on SharePoint too; `.html` so non-technical staff get
    rendered tables, code blocks, and links without needing a markdown
    viewer. SharePoint's own .md preview is too minimal for technical docs.
  - **No `pandoc → .docx` or `.pdf`** — would lose code blocks, mermaid
    diagrams, and tables fidelity, and add zero value over .html for
    consumption.
  - **Push deletions are NOT propagated** — deliberate. SharePoint version
    history keeps every prior version of every file; a renamed or moved doc
    leaves a stale copy on SharePoint that the admin can clean up manually.
    Better than a runaway delete script destroying staff bookmarks.
- **Cost:** $0. Uses the existing Microsoft 365 + Entra ID tenant (already
  paid for — see [`docs/365/pricing.md`](./365/pricing.md)) and the GitHub
  Free tier (workflow minutes well below the 2,000/month cap; the publisher
  runs in 2-5 min per push and only on changes to docs/).
- **Security model summary:**
  - GitHub Actions secret: one `AZURE_CLIENT_SECRET` (24-month expiry,
    calendar reminder for rotation).
  - Entra ID app: `Sites.Selected` only, no other Graph scopes.
  - PnP grant: write-permission to one specific site.
  - SharePoint: version history enabled by default on Document Libraries —
    every overwrite is recoverable.
  - GitHub repo: master branch protected (push goes through merge with
    `--no-ff` and the publisher only triggers on master, not feature
    branches).
- **Status:** **implemented; pending one-time Azure setup.** The workflow
  file (`.github/workflows/publish-docs-to-sharepoint.yml`), publisher script
  (`scripts/publish-docs-to-sharepoint.sh`), and 9-step setup walkthrough
  (`docs/365/sharepoint-docs-publish.md`) are all checked into master. The
  workflow will be a no-op until the admin adds the 5 GitHub Actions secrets
  the setup doc walks through. Local dry-run verified: 28 markdown files
  rendered, 56 (md + html) uploads queued, zero `node_modules` junk
  contaminating the list.

## Summary: ppt → Skin Tyee service swaps

| Concern | ppt (AWS) | Skin Tyee (Azure) | Status |
|---|---|---|---|
| Identity | AWS Cognito / Amplify | **Microsoft Entra ID** | stubbed (role switcher) |
| Object storage | AWS S3 | **Azure Blob Storage** | not implemented |
| Database / API | Mongo + Nest microservices | **Azure PostgreSQL Flexible Server (PostGIS)** + **NestJS** API (`api.skintyee.ca`) | NestJS impl (in-memory) against `api/openapi.yaml`; Prisma/Postgres next; app still on mock |
| Financial / program data | — | **Ferrus ASAP Suite + Adagio / Sage 300** | mocked (transparency + financials) |
| Notifications taxonomy | — | **skintyee.ca WordPress categories** | modelled; push + feed stubbed |
| App packaging | source lib + app-shell submodules | **single self-contained app** | done |
| Docs distribution | — | **SharePoint mirror via GitHub Actions + Graph (Sites.Selected)** | implemented; pending 1× Azure app + Sites.Selected grant (ADR-8) |
