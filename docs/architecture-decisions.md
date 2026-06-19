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

### ADR-9 — Source control: Azure DevOps as primary, GitHub as mirror
- **Decision:** **Azure DevOps** (`dev.azure.com/skintyeenation`) is the
  canonical Git host. **GitHub** (`github.com/skintyeenation`) stays as
  an automated, read-only **mirror** for public discoverability and
  off-Microsoft backup.
- **Replaces:** GitHub-as-primary, which was the implicit default during
  initial development.
- **Why:**
  - **Single Microsoft identity for everything.** Same Entra ID
    `firstname.lastname@skintyee.ca` account signs into Outlook, Azure
    portal, the Skin Tyee app, **and** Azure DevOps. No separate GitHub
    account to provision/deprovision when staff turn over — Entra ID
    is the single off-switch.
  - **Single billing surface.** ADO Pipelines minutes, hosted agents,
    artifact storage, and the Azure subscription all roll up under the
    same Microsoft account as Microsoft 365 + Azure. One invoice, one
    tax record (per [`365/pricing.md`](./365/pricing.md)) — simpler
    NGO accounting.
  - **First-class Azure deployment.** ADO Pipelines + service
    connections with **workload identity federation** give clean
    no-secret access to Azure Container Apps, Azure DNS, Azure Storage,
    Azure DB. The website's `azure-pipelines.yml` is in production on
    this pattern today.
  - **Self-hosted agent reuse.** The `props-agents` Docker pattern
    (sibling repo) can register agents into the new
    `skintyeenation` org with zero new work if/when we exceed
    hosted-minute quota.
- **What stays on GitHub:** A read-only mirror of `master` (and tags),
  pushed automatically by an Azure Pipeline. GitHub's role:
  - **Public discoverability** — youth, schools, and the open-source
    community can read the code without an MSFT account (the
    open-source posture from the README's _Purpose → Education &
    open source_).
  - **Off-Microsoft backup** — if the M365 tenant is ever locked
    out, GitHub still has the history.
  - **External contributions** — pull requests on GitHub can be
    triaged manually and re-applied on Azure. (No automated
    GitHub-PR → Azure-PR sync — that's a future enhancement.)
- **What this reverses:** [ADR-8](#adr-8--docs-distribution-sharepoint-mirror-push-triggered-via-github-actions)
  picked GitHub Actions over Azure DevOps for the SharePoint docs
  publisher because at the time the repo lived on GitHub and there was
  no existing ADO pipeline for webfront. Both halves of that rationale
  now change. The SharePoint publisher gets ported to Azure Pipelines
  (`docs/devops/migrate-ci-workflows.md`), with a federated-credential
  improvement: no more long-lived `AZURE_CLIENT_SECRET` stored anywhere.
- **Cost:** $0 incremental.
  - Azure DevOps **free tier** for private projects: 5 users, unlimited
    private repos, 1,800 Pipeline minutes/mo, 2 GiB artifact storage.
    We comfortably fit.
  - GitHub stays on the **Free** tier (public mirrors only — no
    Actions minutes consumed since CI moves to ADO).
- **Status:** **documented; pending one-time setup.**
  - Setup walkthrough + automation script (`scripts/setup-azure-devops.sh`
    + `.ps1` mirror) in [`devops/azure-devops-setup.md`](./devops/azure-devops-setup.md).
  - Azure → GitHub mirror push pipeline in [`devops/azure-primary-github-mirror.md`](./devops/azure-primary-github-mirror.md).
  - SharePoint publisher migration in [`devops/migrate-ci-workflows.md`](./devops/migrate-ci-workflows.md).
  - Self-hosted agent guidance in [`devops/agents.md`](./devops/agents.md).
  - The legacy `.github/workflows/publish-docs-to-sharepoint.yml`
    stays in-tree until the Azure Pipeline is verified, then gets
    deleted.

### ADR-10 — runtime compute: Azure Container Apps (Consumption) for `api/` + `lookup/api/`

- **Decision:** host the NestJS `api/` and the Node `lookup/api/`
  backends on **Azure Container Apps** (Consumption plan) in the
  `canadacentral` region. `api/` autoscales 0→3 (scale-to-zero
  idle); `lookup/api/` runs always-on with `min-replicas=1`.
  Container images live in a shared **Azure Container Registry**
  (Basic). The `api/`'s state-of-record DB is **Azure Database for
  PostgreSQL Flexible Server** (B1ms, PostGIS) per ADR-7.
- **Custom domains:** `api.skintyee.ca` and `lookup-api.skintyee.ca`,
  both via the existing Azure DNS zone, with Container-Apps-managed
  free TLS.
- **Why Container Apps and not the alternatives:**
  - **Scale-to-zero (vs App Service):** at POC traffic levels the
    `api/` workload pays $0 most of the day; App Service's cheapest
    container-capable SKU (P1V3, ~$73/mo) is fixed monthly.
  - **Simplicity (vs AKS):** AKS gets ~$73/mo just for the control
    plane + nodes, plus YAML overhead. Worth it at 3–4+ services
    with complex dependency graphs; we have two services and no
    graph.
  - **Right paradigm (vs Functions):** NestJS has many endpoints +
    DI + middleware — fighting Functions' execution model is more
    work than running the container.
  - **Right paradigm (vs VM):** IaaS overhead (patching, monitoring,
    log shipping, OS upgrades, manual rolling deploys). We already
    have one VM (WordPress) and don't want a second one without
    cause.
- **Auth + secrets pattern matches the SharePoint publisher:** the
  ADO service connection that deploys uses workload identity
  federation (no client_secret). The Container App pulls images from
  ACR via a federated managed identity (no admin user, no PAT). The
  API verifies inbound user tokens against the Entra tenant's JWKS.
- **AWS equivalent:** ECS Fargate (scale-to-zero) / App Runner.
- **Cost (POC):** ~$40–50 CAD/mo for both services + DB + ACR + DNS
  + Blob storage. Annual ~$500–600 CAD, ~1/3 of the M365 license
  bill. 100% deductible (same s.9 / s.18(1)(a) framing as the M365
  expense — see [`365/pricing.md § Canadian tax treatment`](./365/pricing.md#canadian-tax-treatment--100-deductible)).
- **Status:** **planned; not yet deployed.**
  - Full operational plan + alternatives table + setup-script
    automation surface in
    [`devops/deployment-plan.md`](./devops/deployment-plan.md).

### ADR-11 — mobile app builds: EAS Build (Expo's hosted service) over self-hosted fastlane

- **Decision:** build + distribute the Skin Tyee community app
  (`app/` — React Native + Expo) and the lookup tool app
  (`lookup/app/` — same stack) via **EAS Build**, Expo's hosted build
  service. **Azure Pipelines** orchestrates (kicks off the EAS
  build, optionally submits to TestFlight + Play Internal Testing on
  completion); the native macOS / Android compilation runs on Expo's
  hardware.
- **Pipeline:** [`azure-pipelines/Builds/build-app.yml`](../azure-pipelines/Builds/build-app.yml) —
  Ubuntu Linux agent, ≈80 lines of YAML, calls `eas build --no-wait`
  by default (fire-and-forget). Three build profiles in
  [`app/eas.json`](../app/eas.json): `development` (simulator, no
  signing), `preview` (internal TestFlight + Play closed track),
  `production` (App Store + Play Store).
- **Why EAS Build vs full fastlane (the `props-apps/crashpad-web` pattern):**
  - **`app/` is Expo, not Capacitor.** Capacitor produces a permanent
    `ios/App/App.xcodeproj` that fastlane operates on. Expo's
    `expo prebuild` regenerates the iOS/Android projects on every
    build — fastlane on Expo means re-prebuild-then-build, fighting
    the toolchain.
  - **No macOS agent to maintain.** Microsoft's hosted macOS agents
    bill at 10× the Linux multiplier; self-hosting a Mac mini costs
    $600–800 one-time plus ongoing OS / Xcode / Ruby / CocoaPods
    upkeep. EAS Build is included via free tier (30 builds/mo) which
    we comfortably fit under at POC scale.
  - **One config covers iOS + Android.** Fastlane needs a separate
    Fastfile per platform plus separate Android signing flows.
  - **Credential management is automated.** `eas credentials` walks
    you through cert / profile / keystore upload once; EAS stores
    them encrypted and binds them to builds. No manual
    match/sigh/cert/sigh dance per release.
- **Why not pure-EAS (without ADO orchestration):**
  - We want a single CI surface for the org (per
    [ADR-9](#adr-9--source-control-azure-devops-as-primary-github-as-mirror)).
    Hybrid keeps Azure Pipelines as the trigger surface — pushes to
    `master` flow through the same dashboard as the api / SharePoint
    deploys — while Expo handles the actual native compile.
- **Cost:**
  - **POC (current):** $0/mo — EAS free tier 30 builds/mo, Linux ADO
    agent free under the 1,800 min/mo private-project quota.
  - **If volume grows:** Expo Production plan at $19/mo crosses the
    break-even with the free tier around 20+ builds/mo. Apple
    Developer Program $99/yr + Play Console $25 one-time are required
    regardless of build pipeline choice.
- **What graduates us off this:** sustained build volume above
  ~150/mo, or a need for build-time control EAS doesn't expose
  (custom Xcode build phases, weird native modules) — at which point
  switching to a self-hosted Mac mini + fastlane (matching
  `props-apps/crashpad-web`) is the migration path. None of those
  apply at POC scale.
- **Status:** **planned; not yet wired up.**
  - Setup script: [`scripts/setup-eas-app.sh`](../scripts/setup-eas-app.sh) —
    automates eas-cli install + `eas init` + `eas credentials` walkthroughs +
    EXPO_TOKEN registration in the ADO variable group + pipeline registration.
  - Full operational plan:
    [`devops/app-deploy-eas.md`](./devops/app-deploy-eas.md).

### ADR-12 — app web targets: Azure Static Web Apps (Free tier)

- **Decision:** ship Expo web builds (`expo export --platform web`)
  to **Azure Static Web Apps** (Free SKU) for both apps in the
  monorepo:
  - **Community app** (`app/`) → `app.skintyee.ca` —
    [`Deployments/deploy-app-web.yml`](../azure-pipelines/Deployments/deploy-app-web.yml).
    Same source tree as the native build (ADR-11); web is one of
    three targets.
  - **Lookup tool app** (`lookup/app/`) → `lookup.skintyee.ca` —
    [`Deployments/deploy-lookup-app-web.yml`](../azure-pipelines/Deployments/deploy-lookup-app-web.yml).
    **Web-only** — the lookup app is a browser tool for staff / the
    public, no need to publish to App Store or Play Store.
- **Why SWA Free over the alternatives:**
  - **vs Azure Storage static website:** SWA bundles TLS + global CDN
    + PR-preview URLs into the free tier; Storage doesn't (you'd
    front it with Azure Front Door, $20+/mo).
  - **vs Azure App Service (Static):** App Service's cheapest tier is
    $13/mo; massive overspec for serving compiled JS + HTML.
  - **vs Vercel / Netlify:** functionally equivalent, but we already
    have an Azure tenant — keeping the SPA under the same billing /
    identity / DNS surface simplifies ops.
  - **vs Container Apps with nginx:** another $5+/mo for what amounts
    to static-file CDN.
- **What we get for free:**
  - 100 GB bandwidth/mo (≈ 50,000 sessions/mo at 2 MB page weight)
  - 0.5 GB storage (the built app is ~5–10 MB compressed)
  - 2 custom domains + free auto-renewing TLS
  - Global CDN distribution
  - **PR-preview URLs** — every PR touching `app/**` gets its own
    staging URL, posted automatically as a PR comment. Up to 10
    concurrent previews on Free tier.
- **What it doesn't include and why we don't care:**
  - SWA's bundled "API" (Azure Functions backend) — we have our own
    NestJS API on Container Apps already (per ADR-10), so we use
    SWA in static-only mode (`api_location: ''`).
- **Status:** **planned; not yet wired up.**
  - Setup scripts: [`scripts/setup-app-web-azure.sh`](../scripts/setup-app-web-azure.sh)
    (community app) and
    [`scripts/setup-lookup-app-web-azure.sh`](../scripts/setup-lookup-app-web-azure.sh)
    (lookup app). Each creates its own SWA resource, retrieves the
    deployment token, stores it in the shared variable group under a
    distinct secret name (`SWA_DEPLOYMENT_TOKEN` vs
    `LOOKUP_APP_SWA_DEPLOYMENT_TOKEN`), and registers its pipeline.
  - Operational doc: [`devops/app-deploy-web.md`](./devops/app-deploy-web.md).
- **Cost:** $0/mo at POC scale across both apps. Each SWA resource
  has its own 100 GB/mo bandwidth + 0.5 GB storage quota; combined
  they sit comfortably under the per-subscription Free-tier limit
  (10 SWAs free per subscription). Upgrade individual SWAs to
  Standard ($9/mo each) only when their own usage exceeds limits.

### ADR-14 — Homescreen feed: Microsoft Graph (Planner + Teams meetings) merged with app data, via app-only auth

- **Decision:** the redesigned **homescreen** is a unified feed
  combining (a) the app's own notifications + events, (b) Microsoft
  Planner tasks (treated as time-bound items via their due dates), and
  (c) Microsoft Teams meetings (calendar events with
  `isOnlineMeeting=true`). The merger happens server-side in the
  NestJS api/, behind a single `GET /v1/feed` endpoint, with the
  Graph data fetched via **app-only authentication** through a new
  Entra app `skintyee-app-graph` (Tasks.Read.All, Group.Read.All,
  Calendars.Read, User.Read.All). The same data backs additional
  homescreen views (`/v1/planner/my-tasks`, `/v1/planner/team-tasks`)
  + the admin-only Records page rollup
  (`/v1/planner/rollup`).
- **Why not delegated (per-user) auth:** the homescreen serves
  unauthenticated public visitors + band members + staff + admins,
  with role-tiered visibility. Delegated would need every viewer
  signed into M365 (the app's auth is still stubbed in Phase 1) and
  would limit each viewer to plans they can see in the Planner UI —
  wrong for cross-Nation rollups. App-only lets the api/ fetch once
  per cache cycle + role-filter server-side.
- **Why not build our own task tracker:** double-entry. Staff already
  manage tasks in Planner (bundled with M365 Business Standard). The
  app stays read-only against Planner; staff continue managing where
  they already do. Single source of truth.
- **Why not embed the Planner web UI in a WebView:** doesn't give us
  the cross-source merge (Planner + Teams + app events) into a single
  feed, doesn't allow per-role filtering, doesn't enable the admin
  Records rollup view. WebView would just be a smaller Planner.
- **Caching:** 5-10 min in-memory TTL in the api/'s
  `GraphFeedService`. Polling beats Graph change-notification webhooks
  at this stage (webhooks add public-endpoint surface area, require
  3-day subscription renewals; dashboard freshness of 5-10 min is
  plenty). Refactorable to webhooks in Phase 2 if real-time task
  notifications become a feature.
- **Cost:** **$0/mo**. Planner is bundled with M365 Business Standard;
  Calendars are part of Exchange (same license); Graph API has no
  per-call fee at the volumes we'll hit (≤200 calls per 5-10 min cache
  cycle, well under the 10k-per-10-min throttle).
- **Plan:** [`docs/features/planner-dashboard.md`](features/planner-dashboard.md) —
  the full design doc with per-screen widget mockups, the unified
  `FeedItem` type, the 9 Graph + app data sources merged, and the
  cross-cutting role-filter strategy. Scaffolded by
  [`scripts/setup-app-graph.sh`](../scripts/setup-app-graph.sh) (creates
  the Entra app + the 4 Graph permissions + 24-month client secret).
- **What it relates to:** ADR-1 (Entra ID for auth — same tenant
  hosts this new app), ADR-7 (NestJS api/ — this is a new controller
  + service inside the same app), ADR-10 (Container Apps — the api/'s
  Graph credentials live in the Container App secret store, same
  pattern as the Postgres password).

### ADR-15 — Member provisioning: Graph-native, no PowerShell layer

- **Decision:** the **Add Member** admin flow creates a real Microsoft
  Entra identity, assigns an M365 license, and seats the new user
  into Entra security groups by calling **Microsoft Graph** directly
  from the api/. The existing `skintyee-app-graph` application
  credential picks up three new permissions
  (`User.ReadWrite.All`, `LicenseAssignment.ReadWrite.All`,
  `Organization.Read.All`); `Group.ReadWrite.All` is already in
  place from ADR-14. **No PowerShell intermediary** — the EXO
  Function exists only because `Get-MailboxPermission` isn't
  exposed in Graph v1.0 (see ADR-15-companion in
  [docs/365/shared-mailboxes.md](../docs/365/shared-mailboxes.md)),
  but user creation + licensing + group writes are all fully
  Graph-native, so adding PowerShell here would be a layer of
  indirection with zero functional benefit.
- **Why not the Entra B2B invite flow** (`POST /invitations`,
  requires only `User.Invite.All`): that flow is geared at external
  guests, not new internal users — it provisions a guest user
  with a `#EXT#` UPN suffix and doesn't land them in the tenant
  the way `POST /users` does. We want first-class internal members
  here.
- **Why `LicenseAssignment.ReadWrite.All`** (and not the broader
  `User.ReadWrite.All` for licensing): Microsoft introduced the
  scoped permission specifically so apps can manage licenses
  without holding write access to every user attribute. Narrower
  blast radius if the app credential leaks. We hold
  `User.ReadWrite.All` for the create-user step but the
  license-only path uses the scoped one.
- **Why upsert into Postgres immediately on create (not wait for
  the next `seed-directory` run):** Lucas wants the directory row
  visible to the admin the second the form returns; the next seed
  could be hours away. We compute `appRole` from the
  about-to-be-assigned `bandGroups` via the shared derivation
  helper (extracted from `graph-feed.service.ts` so both paths
  call the same switch) so the new user lands with a correct
  effective role on first sign-in.
- **Why ship Slices 1 + 2 + 4 + cleanup together (and hold Slice 3
  for a second pass):** Slices 1, 2, 4, and the cleanup helper need
  **only one** new Graph permission (`User.ReadWrite.All`). Slice 3
  (auto-license) needs **two more** that require a separate admin
  consent. Splitting reduces the "consent stop the world" friction
  on the first ship.
- **Cost:** **$0/mo** incremental. The Entra app already exists;
  the new permissions don't add billing. M365 license cost is the
  per-license SKU cost (already paid). Graph API has no per-call
  fee at the volumes we'll hit.
- **Plan:** [`docs/features/member-provisioning.md`](features/member-provisioning.md)
  — the four-slice design doc with per-slice UI mockups, Graph
  endpoint references, permission GUIDs, and the SKU-pick fallback
  ladder. Setup-script changes land in
  [`scripts/setup-app-graph.sh`](../scripts/setup-app-graph.sh).
- **What it relates to:** ADR-1 (Entra ID as identity provider —
  this is the write half of that read-only relationship), ADR-7
  (NestJS api/ — new admin endpoint), ADR-10 (Container Apps —
  the new env var `PREFERRED_LICENSE_SKU_ID` lives there), ADR-14
  (the `skintyee-app-graph` Entra app gets extended, not replaced),
  the [App roles doc](../docs/365/app-roles.md) (the shared
  derivation helper this ADR extracts is the same logic that
  drives the role chip on Account).

### ADR-16 — Identity topology: cloud-first coexistence (keep on-prem AD, sync up, don't write back)

- **Decision:** keep the existing on-prem **`STFN.local`** Active Directory and
  all current accounts, sync them **up** to Entra with **Entra Connect**
  (Password Hash Sync), and go **cloud-first for everything new** — new staff are
  created as **cloud users by the app** (ADR-15) and live on **Entra-joined +
  Intune** workstations. Existing domain-joined PCs and the DC are unchanged.
- **Two classes of identity, by design:**
  - **Existing staff = hybrid** — mastered on-prem, projected to cloud. Work on
    both domain-joined PCs *and* the cloud.
  - **New app-created staff = cloud-only** — work on Entra-joined PCs + M365 + the
    app, but **not** the legacy domain.
- **Why this shape:**
  - **Matches the app.** ADR-15 provisions via Graph `POST /users` (cloud). In
    the cloud-first model that's correct as-is — **no re-architecture, no on-prem
    bridge to build.**
  - **Honours a hard Microsoft limit.** Entra Connect / Entra Cloud Sync are
    **`AD → cloud` only**; cloud-only users **cannot** be written back into
    on-prem AD ([documented design limitation](https://learn.microsoft.com/en-us/entra/identity/hybrid/group-writeback-cloud-sync) —
    only *groups* can be provisioned cloud→AD). So "create in the app → log into a
    domain PC" is **not achievable** without flipping provisioning direction.
  - **Keeps what must stay on-prem.** **Xyntax** (First Nations finance/ERP,
    ADR-5 neighbourhood) and the file server authenticate against `STFN.local`;
    those machines + the DC remain.
- **The accepted trade-off:** a **new** finance/admin hire who needs **Xyntax** or
  a domain-joined machine still needs an **on-prem AD account** created manually
  (a small number of people). General staff (council, programs) are fully served
  by the cloud-only app flow.
- **Deferred fallback — "AD-first: app provisions into AD, then syncs up":** the
  app creates the user **in on-prem AD** (`New-ADUser`) via an **on-prem
  provisioning bridge** (Azure Automation Hybrid Runbook Worker, or a Service
  Bus/Storage queue + an on-prem worker), and Entra Connect carries them **up** to
  the cloud. App-created users would then be **real domain accounts** that log into
  domain-joined PCs and Xyntax. **Not built today**, but kept as the explicit
  **cost-saving alternative**:
  - **Why it's cheaper:** domain-joined PCs are managed by **Group Policy on the
    DC we already own — no Intune, so no Business Premium upgrade / Intune add-on**
    (saves ~$8–9.50/user/mo, recurring, for every managed user). The cost moves
    from an **ongoing per-user license** to a **one-time engineering build** (the
    bridge + amending ADR-15 to write to AD).
  - **The trade-off it re-incurs:** building/maintaining the bridge, and keeping
    on-prem AD as the long-term identity master (more on-prem surface to run,
    patch, and back up) instead of trending toward cloud.
  - **Pick this if:** device-management licensing cost is the binding constraint,
    the org is comfortable staying on-prem-centric, and/or the count of staff who
    need domain/Xyntax access is high enough that per-user Intune licensing exceeds
    the one-time bridge cost.
- **Rejected — "cloud-only, decommission the DC":** simplest long-term, but Xyntax
  / the file server / the active domain-joined machines still need the local
  domain today. Coexistence defers this without foreclosing it.
- **Device management:** **Intune** for Entra-joined machines (GPO replacement);
  Group Policy still runs the legacy domain PCs. Intune is **not** in Business
  Standard — needs **Business Premium** or an **Intune Plan 1** add-on (a budget
  item, opt-in when the first PC is Entra-joined).
- **Three access tiers, one tenant (per-user) — no second tenant needed:**
  **managed staff** (Business Premium + Intune), **basic staff** (Business
  Standard, no Intune), and **contractors** — BYOD, **app-only**, **unlicensed or
  B2B guest at $0**. Contractors just need the Skin Tyee app; signing into the
  Entra-gated app (ADR-1) consumes **no M365 license**, so they're provisioned via
  ADR-15's no-license path or a guest invite, get no Intune/email/on-prem account,
  and Conditional Access requires a compliant device only for the managed-staff
  group (contractor BYOD is never enrolled). Mixing license tiers is a per-user
  choice within the one tenant; separate tenants are only for genuinely separate
  organizations.
- **Status:** **in progress.** Phase 1 (on-prem account normalization) **done**
  2026-06-18; Entra Connect install (Phase 2) next; devices/Intune (Phase 3)
  later. Full progress doc + runbook:
  [`docs/365/entra-connect.md`](365/entra-connect.md).
- **What it relates to:** ADR-1 (Entra ID as IdP), ADR-15 (app member
  provisioning — stays cloud-native), ADR-5 (Ferrus/Xyntax finance systems — the
  on-prem anchor), [`docs/365/entra-id.md`](365/entra-id.md).

## Summary: ppt → Skin Tyee service swaps

| Concern | ppt (AWS) | Skin Tyee (Azure) | Status |
|---|---|---|---|
| Identity | AWS Cognito / Amplify | **Microsoft Entra ID** | stubbed (role switcher) |
| Object storage | AWS S3 | **Azure Blob Storage** | not implemented |
| Database / API | Mongo + Nest microservices | **Azure PostgreSQL Flexible Server (PostGIS)** + **NestJS** API on **Azure Container Apps** (`api.skintyee.ca`) | NestJS impl (in-memory) against `api/openapi.yaml`; Prisma/Postgres next; Container Apps deploy planned (ADR-10); app still on mock |
| Financial / program data | — | **Ferrus ASAP Suite + Adagio / Sage 300** | mocked (transparency + financials) |
| Notifications taxonomy | — | **skintyee.ca WordPress categories** | modelled; push + feed stubbed |
| App packaging | source lib + app-shell submodules | **single self-contained app** | done |
| Docs distribution | — | **SharePoint mirror via GitHub Actions + Graph (Sites.Selected)** | implemented; pending 1× Azure app + Sites.Selected grant (ADR-8) — to be ported to Azure Pipelines per ADR-9 |
| Source control | _(GitHub-as-primary, implicit)_ | **Azure DevOps primary + GitHub mirror** | documented; pending 1× org + repo creation (ADR-9) |
| Task management + meetings feed | _(none)_ | **Microsoft Planner + Teams meetings via Graph API, merged with app events into a single homescreen feed** | Planning doc done (ADR-14); `skintyee-app-graph` Entra app + NestJS `GraphFeedService` to be scaffolded |
