# Deploy architecture — the map

The bird's-eye view of how every source tree in this monorepo gets to
production. Each row in the table below links to the operational doc
for that target.

> **Why this doc exists.** Once we had three ADRs (10, 11, 12), five
> setup scripts, and six pipelines, "where is X deployed?" was no
> longer obvious. This is the index that answers it.

## Component → target matrix

| Source | Native (iOS/Android) | Web | Backend / API | Static / Content |
|---|---|---|---|---|
| **`app/`** (community app) | ✅ `app.skintyee.ca` via TestFlight + Play — [EAS](./app-deploy-eas.md) | ✅ `app.skintyee.ca` (web) — [SWA](./app-deploy-web.md) | n/a | n/a |
| **`lookup/app/`** (lookup tool app) | ❌ (web-only — browser tool, no store distribution) | ✅ `lookup-app.skintyee.ca` — [SWA](./app-deploy-web.md) | n/a | n/a |
| **`api/`** (NestJS, community-app backend) | n/a | n/a | ✅ `api.skintyee.ca` — [Container Apps](./deployment-plan.md) | n/a |
| **`lookup/api/`** (Node + Anthropic) | n/a | n/a | ✅ `lookup.skintyee.ca` (always-on, min 1 replica) — [Container Apps](./deployment-plan.md) | n/a |
| **`docs/`** + root README | n/a | n/a | n/a | ✅ Auto-published to SharePoint — [walkthrough](../365/sharepoint-docs-publish.md) |
| **`website/`** (WordPress) | n/a | n/a | n/a | ✅ `skintyee.ca` on existing VM via SSH — [pipeline](../../website/azure-pipelines.yml) |

## Hosting service summary

Every deployable in this monorepo lands on one of six Azure or
Azure-adjacent services:

| Service | Used by | Tier | $/mo CAD |
|---|---|---|---|
| **Azure Container Apps** (Consumption) | `api/`, `lookup/api/` | Consumption (scale-to-zero for api; min-1 for lookup) | $13–25 |
| **Azure Database for PostgreSQL** (Flexible Server) | `api/` | B1ms, PostGIS | ~$18 |
| **Azure Container Registry** | shared image store | Basic | ~$7 |
| **Azure Static Web Apps** × 2 | `app/` web, `lookup/app/` web | Free SKU each | **$0** |
| **EAS Build** (Expo hosted) | `app/` native | Free tier (≤30 builds/mo) | $0 |
| **SharePoint Online** (existing M365 license) | `docs/` mirror | Included with M365 Business Standard | $0 |
| **Existing WordPress VM** + Azure DB for MySQL Flexible Server | `website/` | Existing | unchanged |
| **Azure DNS** + **Blob Storage** | shared | per-zone + per-GB | ~$1.30 |
| | | **Total** | **~$40–55** |

≈$500/year — roughly a third of the M365 license bill, all 100%
deductible (see [`../365/pricing.md`](../365/pricing.md)).

## Pipelines

In ADO at <https://dev.azure.com/skintyeenation/devops/_build>.
Source: [`azure-pipelines/`](../../azure-pipelines/).

| Pipeline | Source | YAML | Trigger | Auth |
|---|---|---|---|---|
| `publish-docs-to-sharepoint` | `docs/`, root README | [`publish-docs-to-sharepoint.yml`](../../azure-pipelines/publish-docs-to-sharepoint.yml) | push to `master` touching `docs/**` | Federated SC `sharepoint-docs-sc` |
| `deploy-api` | `api/` | [`Deployments/deploy-api.yml`](../../azure-pipelines/Deployments/deploy-api.yml) | push to `master` touching `api/**` | Federated SC `skintyee-prod-azure` |
| `deploy-lookup` | `lookup/api/` | [`Deployments/deploy-lookup.yml`](../../azure-pipelines/Deployments/deploy-lookup.yml) | push to `master` touching `lookup/api/**` | Federated SC `skintyee-prod-azure` |
| `build-app` | `app/` (native) | [`Builds/build-app.yml`](../../azure-pipelines/Builds/build-app.yml) | push to `master` touching `app/**` | `EXPO_TOKEN` (variable group secret) |
| `deploy-app-web` | `app/` (web) | [`Deployments/deploy-app-web.yml`](../../azure-pipelines/Deployments/deploy-app-web.yml) | push to `master` (+ PRs for preview URLs) touching `app/**` | `SWA_DEPLOYMENT_TOKEN` (variable group secret) |
| `deploy-lookup-app-web` | `lookup/app/` | [`Deployments/deploy-lookup-app-web.yml`](../../azure-pipelines/Deployments/deploy-lookup-app-web.yml) | push to `master` (+ PRs) touching `lookup/app/**` | `LOOKUP_APP_SWA_DEPLOYMENT_TOKEN` |
| `website` (existing) | `website/` | [`website/azure-pipelines.yml`](../../website/azure-pipelines.yml) | per branch policy | SSH service connection `skintyee-host` |

**Pipeline directory layout:**

```
azure-pipelines/
├── README.md
├── publish-docs-to-sharepoint.yml        ← oldest, kept at top level
├── Builds/
│   └── build-app.yml                      ← EAS native (app/)
└── Deployments/
    ├── deploy-api.yml                     ← NestJS → Container Apps
    ├── deploy-lookup.yml                  ← Node → Container Apps
    ├── deploy-app-web.yml                 ← Expo → SWA (app/)
    └── deploy-lookup-app-web.yml          ← Expo → SWA (lookup/app/)
```

## Setup scripts

One-time provisioning per environment. All idempotent — safe to
re-run. All commit to ADO + Azure via federated identity / managed
service principal once `az login` has happened.

| Script | Provisions | Depends on |
|---|---|---|
| [`scripts/setup-azure-devops.sh`](../../scripts/setup-azure-devops.sh) | ADO org + project + repo + branch policies | nothing (bootstrap) |
| [`scripts/setup-sharepoint-pipeline.sh`](../../scripts/setup-sharepoint-pipeline.sh) | SharePoint publisher: Entra apps, federated cred, ADO SC, variable group, pipeline | `az login`, `setup-azure-devops.sh` |
| [`scripts/setup-api-azure.sh`](../../scripts/setup-api-azure.sh) | Shared Azure infra (RG, ACR, Postgres, Container Apps env) **+** `api/` Container App + ADO SC `skintyee-prod-azure` + variable group + `deploy-api` pipeline | `az login` |
| [`scripts/setup-lookup-azure.sh`](../../scripts/setup-lookup-azure.sh) | `lookup-prod` Container App (min 1 replica) + ANTHROPIC_API_KEY secret + LOOKUP_CONTAINERAPP variable + `deploy-lookup` pipeline | `setup-api-azure.sh` |
| [`scripts/setup-eas-app.sh`](../../scripts/setup-eas-app.sh) | eas-cli install + `eas init` + iOS/Android `eas credentials` + EXPO_TOKEN in variable group + `build-app` pipeline | `setup-api-azure.sh`, Expo account, Apple Developer Program, Play Console |
| [`scripts/setup-app-web-azure.sh`](../../scripts/setup-app-web-azure.sh) | Static Web App `skintyee-prod-app` + SWA_DEPLOYMENT_TOKEN + `deploy-app-web` pipeline | `setup-api-azure.sh` |
| [`scripts/setup-lookup-app-web-azure.sh`](../../scripts/setup-lookup-app-web-azure.sh) | Static Web App `skintyee-prod-lookup-app` + LOOKUP_APP_SWA_DEPLOYMENT_TOKEN + `deploy-lookup-app-web` pipeline | `setup-api-azure.sh` |
| [`scripts/build-sharepoint-home.sh`](../../scripts/build-sharepoint-home.sh) | Rebuilds the SharePoint landing page (`DocsHome.aspx`) | `setup-sharepoint-pipeline.sh` |

## Stand-up order (fresh tenant → all pipelines registered)

```bash
# Bootstrap — ADO org + project + repo
bash scripts/setup-azure-devops.sh

# Docs publisher
bash scripts/setup-sharepoint-pipeline.sh

# Shared Azure infra + api/ stack
bash scripts/setup-api-azure.sh

# lookup/api/ on top of the shared infra
bash scripts/setup-lookup-azure.sh

# Web hosting for both apps
bash scripts/setup-app-web-azure.sh
bash scripts/setup-lookup-app-web-azure.sh

# Native build pipeline for the community app (do last — most interactive)
bash scripts/setup-eas-app.sh
```

After each script, check its final-summary printout for the manual
steps still required (custom-domain DNS validation, certain secrets
to paste from 1Password, etc.). Total time fresh→done: **~45 min**,
mostly waiting on DNS propagation.

## Naming conventions

Standardized so resources are scannable in the Azure / ADO portal:

| Pattern | Examples |
|---|---|
| Resource group | `skintyee-prod-rg` (single, all-services-share-it for POC) |
| Container Registry | `skintyeeprodacr` (no hyphens — ACR naming rules) |
| Container Apps environment | `skintyee-prod-env` |
| Container App | `<service>-prod` (`api-prod`, `lookup-prod`) |
| Postgres server | `skintyee-prod-pg` |
| Static Web App | `skintyee-prod-<app>` (`skintyee-prod-app`, `skintyee-prod-lookup-app`) |
| Entra app for deploys | `skintyee-prod-deploy` (one, multi-purpose with role assignments per target) |
| Entra app for SharePoint | `it-project-docs-publisher` (separate, blast-radius-scoped to docs) |
| Entra app for m365 CLI | `skintyeenation-admin-cli` (separate; delegated-auth sign-in app) |
| ADO service connection | `skintyee-prod-azure` (deploys), `sharepoint-docs-sc` (docs) |
| ADO variable group | matches the SC name |
| Pipeline | `<verb>-<service>[-<target>]` (`deploy-api`, `build-app`, `deploy-app-web`) |
| Custom domain | `<service>.skintyee.ca` (`api`, `lookup`, `app`, `lookup-app`) |

All resources in **`canadacentral`** (Static Web Apps lands in
`eastus2` automatically — they pick the nearest region per
sub regardless of declaration).

## Secrets inventory

| Secret | Stored where | Used by |
|---|---|---|
| `admin@skintyeenation.onmicrosoft.com` password | 1Password IT/Admin vault | M365 admin, Azure subscription owner, all "break-glass" |
| Postgres admin password | 1Password IT/Admin vault + ADO variable group `PG_PASSWORD` (secret) | `api/` runtime + manual psql |
| `EXPO_TOKEN` | 1Password IT/Admin vault + ADO variable group (secret) | `build-app` pipeline |
| `SWA_DEPLOYMENT_TOKEN` | ADO variable group (secret, autogenerated by Azure) | `deploy-app-web` pipeline |
| `LOOKUP_APP_SWA_DEPLOYMENT_TOKEN` | ADO variable group (secret) | `deploy-lookup-app-web` pipeline |
| `ANTHROPIC_API_KEY` | 1Password IT/Admin vault + Container App secret on `lookup-prod` | `lookup/api/` runtime |
| `GOOGLE_MAPS_API_KEY` | 1Password IT/Admin vault + ADO variable group (secret) | `deploy-app-web` build env (baked into the bundle, referrer-restricted in Google Cloud Console) |
| Azure DevOps PAT (for self-hosted agent) | 1Password IT/Admin vault + `azure-agents/.env.skintyeenation` | `azure-agents/` Docker stack |

**No client_secret values stored anywhere** for the Entra apps used
in deploys — all auth is via workload identity federation (the
SharePoint publisher, the `skintyee-prod-deploy` app for Container
Apps + ACR, the federated managed identity for the Container Apps'
ACR pulls). The credentials above are either:

- **User credentials** (M365 admin password) — irreducible
- **Subscription-scoped tokens** that we can't avoid (Postgres, Maps key, Anthropic, EAS) — but each is least-privilege and held in 1Password as the canonical source

See [`../azure-agents/README.md § Manual setup checklist`](../../azure-agents/README.md) for the parallel inventory for the build-agent stack.

## How auth works end-to-end

```
[ Developer's laptop ]
   │
   │ pnpm + git + az + m365 + eas CLIs
   │
   ▼  git push azure master
[ Azure DevOps repo ]
   │
   │  pipeline triggered on path filter
   │
   ▼  uses federated identity (NO secrets)
[ Service connection: skintyee-prod-azure ]
   │
   │  workload identity federation
   │
   ▼  exchanges ADO OIDC token for Entra access token
[ Entra app: skintyee-prod-deploy ]
   │
   │  AcrPush role on ACR
   │  Contributor role on Container Apps
   │
   ▼  performs the deploy
[ ACR build → Container App revision update → smoke test ]
```

Same model for the docs publisher (different SC + Entra app). Web-app
deploys use Azure-generated SWA deployment tokens (rotatable, scoped
to one resource each) since SWA doesn't yet support federated
identity from ADO at the time of this writing.

## Day-to-day operations

| I want to… | Then… |
|---|---|
| Ship docs to staff via SharePoint | Edit `.md`, push to `master` |
| Ship a backend code change | Edit `api/` or `lookup/api/`, push to `master` |
| Ship a mobile-app code change to testers | Edit `app/`, push — `deploy-app-web` auto-deploys to `app.skintyee.ca`; native build queued at EAS, run manually with `buildProfile=preview` from ADO UI when ready |
| Ship the mobile app to the store | Run `build-app` from ADO UI with `buildProfile=production, submitToStores=true` |
| See a PR's mobile-web changes | Open PR → SWA posts a preview URL comment within minutes |
| Roll a credential | See secrets table — each cred has a rotation home |
| Diagnose a deploy failure | <https://dev.azure.com/skintyeenation/devops/_build> — click the failed run → live logs |
| Run anything locally without the pipeline | Each script + Dockerfile has a "Local quickstart" note in its header |

## See also (the underlying detail docs)

- [`deployment-plan.md`](./deployment-plan.md) — backend services
  (api, lookup-api): compute-options comparison with AWS analogs,
  cost projection, Phase 1 stand-up checklist, naming conventions.
  **ADR-10**.
- [`app-deploy-eas.md`](./app-deploy-eas.md) — native (iOS / Android)
  builds via EAS Build, the props-fastlane trade-off, build profiles,
  submission flow. **ADR-11**.
- [`app-deploy-web.md`](./app-deploy-web.md) — web deploys for both
  apps via Azure Static Web Apps, PR previews, custom-domain TLS.
  **ADR-12**.
- [`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md)
  — what went wrong setting up the first federated pipeline, how
  later setup scripts incorporate the lessons.
- [`agents.md`](./agents.md) — self-hosted ADO build agent (when
  hosted queues bite).
- [`../architecture-decisions.md`](../architecture-decisions.md) —
  every ADR (1–12) in one place.
- [`../365/entra-usage.md`](../365/entra-usage.md) — what each Entra
  app is for + the credential / permission model.
- [`../365/pricing.md`](../365/pricing.md) — M365 + Entra cost
  baseline; deployment-cost numbers above sit on top of this.
