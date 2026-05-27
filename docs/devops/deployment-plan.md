# Deployment plan — apps + APIs → Azure

How the Skin Tyee monorepo's runtime services get to production on
Azure. Companion to [`architecture-decisions.md` § ADR-10](../architecture-decisions.md)
which records the formal decision; this doc is the *operational* plan
plus the option-by-option rationale.

> **Context.** Microsoft Entra ID + Azure subscriptions are already
> the Nation's identity + cloud platform (see
> [`../365/entra-usage.md`](../365/entra-usage.md) and
> [`../365/pricing.md`](../365/pricing.md)). The WordPress site is the
> only thing currently deployed on Azure-the-compute (managed MySQL
> Flexible Server + a VM over SSH — [`../../website/azure-pipelines.yml`](../../website/azure-pipelines.yml)).
> Everything else listed below is **not yet deployed** — this doc is
> the plan to get there.

## What we're deploying

| Component | Stack | Needs hosting? | Hosting decision |
|---|---|---|---|
| **`api/`** | NestJS + (planned) Prisma + PostgreSQL (PostGIS) | **Yes** | Azure Container Apps (Consumption) + Postgres Flexible Server |
| **`app/`** | React Native + Expo (mobile) | No | EAS Build → TestFlight + Google Play |
| **`lookup/api/`** | Node + Anthropic SDK (CLI + small HTTP serve) | **Yes** | Azure Container Apps (Consumption, **always-on**) |
| **`lookup/app/`** | React Native + Expo (mobile) | No | EAS Build → TestFlight + Google Play |
| **`website/`** | WordPress + Docker | Already deployed | (Existing — VM via SSH + managed MySQL) |

The deploy surface is **two backend services** (`api/`, `lookup/api/`)
plus their databases + a container registry. Mobile apps go to the
stores — no Azure compute involved.

## Azure compute options (with AWS equivalents)

| Azure service | AWS equivalent | When to pick it | Idle cost |
|---|---|---|---|
| **Azure Container Apps (Consumption)** | ECS Fargate (scale-to-zero) / App Runner | Containers, low-to-mid traffic, scale to zero between requests | **$0** when idle |
| **Azure Container Apps (Dedicated)** | ECS Fargate (always-on) | Same as above but always running, predictable latency | ~$13+/mo per replica |
| **Azure App Service for Containers** | Elastic Beanstalk / Lightsail Containers | Web-app-tier pricing, predictable, easy custom domain + cert | $13/mo (B1) → $73/mo (P1V3) |
| **Azure Kubernetes Service (AKS)** | EKS | Multiple services + you want k8s ops control | $73+/mo just for control plane + nodes |
| **Azure Container Instances** | ECS one-off task | Single-container, short-lived | per-second billing |
| **Azure Functions** | Lambda | Event-driven, sub-second responses | $0 when idle (consumption) |
| **Azure VM** | EC2 | You want full OS control / unusual stack | $7/mo (B1ls) → much more |
| **Azure Static Web Apps** | S3 + CloudFront / Amplify | Static sites + small functions | $0 (free tier 100 GB) |

## Recommendation: Azure Container Apps

The headline pick — used by both `api/` and `lookup/api/`.

**Why Container Apps over the alternatives:**

- **Scales to zero** — at POC traffic levels (sporadic), we pay $0
  most of the day. Microsoft only bills for the seconds a container
  is actively serving requests.
- **First-class custom domain + free TLS** — `api.skintyee.ca` works
  out of the box; cert renewals are automatic.
- **Federated identity for ACR pulls** — same auth pattern as the
  SharePoint publisher pipeline. No client_secret stored anywhere.
- **One concept** — same Docker image runs locally
  (`docker compose up`) and in prod. No "but it works on staging".
- **AWS analog comfort** — closest to ECS Fargate. Same mental model
  if anyone has AWS background.

**What we're not picking, and why:**

- **AKS** — fine product, wrong scale. $73/mo just for the control
  plane + nodes, then YAML overhead. Worth it at ≥3–4 services with
  complex dependency graphs; we have two services and no graph.
- **App Service for Containers** — doesn't scale to zero, and the
  cheapest "production-tier" SKU (P1V3, ~$73/mo) costs more than
  Container Apps will ever cost us at this traffic. Free F1 tier
  doesn't support containers.
- **Azure VM** — IaaS overhead (patching, monitoring, log shipping,
  OS upgrades, manually rolling deploys). We've already got the
  WordPress VM and don't want a second one if we can avoid it.
- **Azure Functions** — great for event handlers, but the NestJS API
  has many endpoints + middleware + DI — fighting Functions' execution
  model would be more work than just running the container.

**Component-level decision:**

| Service | Container Apps plan | Why |
|---|---|---|
| `api/` | Consumption, autoscale 0→3 replicas | Sporadic traffic from the mobile app; scales up under load, drops to zero at night. POC budget ≈ $0/mo. |
| `lookup/api/` | Consumption, **minimum 1 replica** (always-on) | Per the answer to "always-on?" — explicit min-replicas=1 keeps a warm instance so first-query latency is sub-second. Cost ≈ $13/mo at idle. |

## Component-by-component plan

### `api/` — NestJS community app backend

- **Hosting:** Azure Container Apps (Consumption), autoscale 0→3.
- **Database:** Azure Database for PostgreSQL Flexible Server,
  **B1ms** tier (1 vCore / 2 GB RAM / 32 GB SSD), **PostGIS** extension
  enabled (per ADR-7 for land allocation / mapping use cases).
- **Custom domain:** `api.skintyee.ca` via Azure DNS, free
  Container-Apps-managed TLS cert.
- **Image registry:** Azure Container Registry (Basic), shared with
  `lookup/api/`.
- **Auth:** Entra ID tokens — Container App pulls images from ACR
  via federated managed identity; the API verifies inbound user
  tokens via the tenant's JWKS endpoint (per ADR-7's auth model).
- **Logs / monitoring:** Application Insights (free tier — 5 GB/mo
  ingestion).
- **Region:** `canadacentral` (matches existing Azure resources).

### `lookup/api/` — Canadian business / Nations lookup backend

- **Hosting:** Azure Container Apps (Consumption, **always-on** with
  `min-replicas=1`).
- **Custom domain:** `lookup-api.skintyee.ca` (subdomain TBD — could also
  be `lookup-api.skintyee.ca` or path-routed under
  `api.skintyee.ca/lookup/*`; flat-subdomain reads cleanest).
- **Storage:** Azure Blob Storage for the cached lookup data (`data/`,
  `out/` in `lookup/api/` today).
- **Secrets:** Anthropic API key via Container Apps **secrets**
  (encrypted, env-var-injected at runtime, never logged).
- **DB:** TBD — if the lookup uses a database, smallest separate
  Flexible Server (same SKU). If it's pure file-backed, just Blob
  Storage.

### `app/` — community mobile app

- **Distribution:** [EAS Build](https://expo.dev/eas) (Expo's cloud
  build service) → TestFlight (iOS) + Google Play (Android).
- **Why not Azure Pipelines macOS agents:** Microsoft bills macOS
  agents at a 10× minute multiplier vs Linux. EAS Build is cheaper
  and one less thing to maintain at this scale.
- **No Azure compute** — mobile binaries live in the stores, not on
  our infrastructure.

### `lookup/app/` — lookup tool mobile app

Same pattern as `app/` — EAS Build → stores. No Azure compute.

### `website/` (out of scope, mentioned for completeness)

Already deployed to a VM via SSH + managed MySQL Flexible Server.
Stays as-is unless we ever want to migrate it to App Service for
WordPress.

## Cost projection (CAD, POC phase)

| Item | $/mo | Notes |
|---|---|---|
| Container Apps for `api/` (Consumption, scales to zero) | **$0–10** | Bills only when serving |
| Container Apps for `lookup/api/` (Consumption, min 1 replica) | **~$13** | Always-on minimum |
| Azure Database for PostgreSQL Flexible Server (B1ms, PostGIS) | **~$18** | 1 vCore / 2 GB / 32 GB SSD |
| Azure Container Registry (Basic) | **~$7** | Shared between both services |
| Azure DNS (existing zone) | **~$1** | Per-zone monthly + per-million queries |
| Azure Blob Storage (10 GB photos / data) | **~$0.30** | $0.02/GB/mo |
| Application Insights | **$0** | Free tier 5 GB/mo |
| EAS Build (mobile, 30 builds/mo) | **$0** | Free tier |
| **Total** | **~$40–50/mo CAD** | Annualized ≈ **$500–600 CAD/yr** |

Compare against the M365 cost (~$167/mo for 9 users per
[`../365/pricing.md`](../365/pricing.md)) — the API stack is roughly
**a third of the cost of email**. Both are 100% deductible business
expenses per Canadian tax law (same s.9 / s.18(1)(a) framing as the
M365 cost record).

## Naming conventions

Standardize from day 1 so resources are scannable:

| Pattern | Example |
|---|---|
| Resource group | `skintyee-<env>-rg` | `skintyee-prod-rg` |
| Container Registry | `skintyee<env>acr` (no hyphens — ACR rules) | `skintyeeprodacr` |
| Container Apps environment | `skintyee-<env>-env` | `skintyee-prod-env` |
| Container App | `<service>-<env>` | `api-prod`, `lookup-prod` |
| Postgres server | `skintyee-<env>-pg` | `skintyee-prod-pg` |
| DB inside Postgres | `<service>` | `api`, `lookup` |
| Blob Storage | `skintyee<env><purpose>` | `skintyeeprodassets` |
| Application Insights | `skintyee-<env>-ai` | `skintyee-prod-ai` |
| Custom domain | `<service>.skintyee.ca` | `api.skintyee.ca`, `lookup-api.skintyee.ca` |
| Service connection (ADO) | `skintyee-<env>-azure` | `skintyee-prod-azure` |

All in **`canadacentral`**.

## Phase 1 — POC stand-up (weeks 1–2 of deployment work)

What gets built first, in order:

1. **Resource group + naming.** `az group create -n skintyee-prod-rg -l canadacentral`.
2. **Container Registry.** `az acr create --sku Basic --name skintyeeprodacr -g skintyee-prod-rg`.
3. **Postgres Flexible Server.** `az postgres flexible-server create` with B1ms, PostGIS extension allow-listed, public access OFF, firewall set to allow Azure services.
4. **Container Apps environment.** `az containerapp env create -n skintyee-prod-env -g skintyee-prod-rg -l canadacentral`. (Shared by both api and lookup containers — they get free in-environment networking + share the same Log Analytics workspace.)
5. **Dockerfile for `api/`.** Multi-stage `node:22-alpine` (matching the repo's [`.nvmrc`](../../.nvmrc)), runs as non-root `node` user, `node dist/main.js`. Build context: the `api/` package only.
6. **Container App for `api/`.** `az containerapp create` with `--image skintyeeprodacr.azurecr.io/api:latest`, `--ingress external`, autoscale 0→3 on HTTP requests. Federated managed identity for ACR pull (no admin user, no PAT).
7. **DNS + TLS.** Add `api.skintyee.ca` CNAME to the existing Azure DNS zone pointing at the Container App's FQDN; `az containerapp hostname add` + `bind` to register the custom domain; let the platform mint the TLS cert.
8. **Pipeline.** `azure-pipelines/Deployments/deploy-api.yml` — on push to master touching `api/**`, builds the Docker image → pushes to ACR → updates Container App revision. Uses federated identity (no secrets). Mirrors the SharePoint publisher's auth pattern.
9. **First deploy.** `curl https://api.skintyee.ca/health` → 200.
10. **Repeat for `lookup/api/`** — same pattern, named `lookup-prod`, `min-replicas=1`.

The setup steps (1–7) get automated in `scripts/setup-api-azure.sh`,
following the same idempotent + interactive-confirm + `--dry-run`
shape as `scripts/setup-sharepoint-pipeline.sh`.

## Phase 2 — production-ready (later, after POC validates)

- **App-role integration with Entra ID** — wire the NestJS role
  guards (`@Roles('admin')` etc.) to the app-role claims in user
  tokens (per [ADR-7](../architecture-decisions.md#adr-7--api-nestjs--prisma--azure-mysql-contract-first-openapi)).
- **Postgres backup verification** — confirm automated backups +
  do a point-in-time restore drill to a separate server.
- **Application Insights dashboards** — pre-canned charts for HTTP
  errors, latency, DB connection-pool, container-restart frequency.
- **Pre-prod environment** — `skintyee-staging-rg`, same shape, used
  to validate schema migrations + load-test before each prod release.
- **Decide lookup architecture** — if `lookup/api/` outgrows the
  always-on single-replica setup, split it: a small always-on HTTP
  responder + on-demand Container Apps Jobs for bulk research runs.

## Pipeline + automation pattern

Pipelines for `api/` and `lookup/api/` follow the same template the
SharePoint publisher established:

```yaml
trigger:
  branches: { include: [master] }
  paths:
    include:
      - <service>/**
      - azure-pipelines/Deployments/deploy-<service>.yml

pool:
  vmImage: ubuntu-latest    # or: name: skintyee-pool (self-hosted)

jobs:
  - job: build_and_deploy
    steps:
      - task: AzureCLI@2
        inputs:
          azureSubscription: skintyee-prod-azure    # federated SC
          scriptType: bash
          inlineScript: |
            set -euo pipefail

            # Build the Docker image
            az acr build \
              --registry skintyeeprodacr \
              --image <service>:$(Build.SourceVersion) \
              --image <service>:latest \
              <service>

            # Update the Container App to the new revision
            az containerapp update \
              -n <service>-prod -g skintyee-prod-rg \
              --image skintyeeprodacr.azurecr.io/<service>:$(Build.SourceVersion)
```

No client_secret. The service connection
`skintyee-prod-azure` uses workload identity federation (same model
as `sharepoint-docs-sc`). Build runs on the local self-hosted agent
([`../../azure-agents/`](../../azure-agents/)) once that's set up, or
falls back to Microsoft-hosted Linux while we're in the queue-free
default.

## Setup-script automation surface

What `scripts/setup-api-azure.sh` automates (analogous to
`scripts/setup-sharepoint-pipeline.sh` for SharePoint):

| Step | Manual today | After script |
|---|---|---|
| Create resource group | `az group create` | scripted |
| Create ACR | `az acr create` | scripted |
| Create Postgres Flexible Server + DB | multi-step CLI | scripted |
| Create Container Apps environment | `az containerapp env create` | scripted |
| Build + push first image to ACR | `az acr build` | scripted |
| Create Container App + custom domain + TLS | multi-step CLI | scripted |
| Configure federated managed identity for ACR pulls | RBAC role assignment | scripted |
| Add Entra federated credential for the ADO SC | scripted (same shape as SharePoint setup) | scripted |
| Create ADO service connection | `az rest` POST (per the SharePoint post-mortem learnings) | scripted |
| Create ADO variable group | `az pipelines variable-group create` | scripted |
| Register the deploy pipeline | `az pipelines create` | scripted |

What stays manual:

- `az login` (interactive bootstrap)
- Approving the first Container App custom-domain validation
  (Microsoft requires a DNS TXT record that we manually add to Azure
  DNS before the cert can be issued — would need a 30-second pause +
  user-confirm in the script)

## Open follow-ups

- Confirm Postgres tier B1ms is fine for the POC — bigger if you
  expect concurrent writes from many staff testing the app at the
  same time during the proposal demo.
- Decide whether `lookup/api/` needs a database (currently file-backed
  via `data/` + `out/` directories).
- Pick the lookup subdomain shape: `lookup-api.skintyee.ca` (separate
  service) vs `api.skintyee.ca/lookup/*` (path-routed under the main
  API). Subdomain is simpler operationally but doubles the TLS-cert
  setup work.
- (Phase 2) Decide on a staging environment — separate subscription
  vs separate resource group in the same subscription.

## See also

- [`../architecture-decisions.md` § ADR-7](../architecture-decisions.md#adr-7--api-nestjs--prisma--azure-mysql-contract-first-openapi) — the original API stack decision
- [`../architecture-decisions.md` § ADR-10](../architecture-decisions.md) — the formal Container-Apps-over-AKS decision (new)
- [`../365/entra-usage.md`](../365/entra-usage.md) — Entra app registrations + what's used for auth
- [`../365/pricing.md`](../365/pricing.md) — M365 cost baseline for comparison
- [`agents.md`](./agents.md) — self-hosted ADO build agent (used by the deploy pipelines)
- [`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md) — what we learned setting up the first ADO+Entra federated workflow, reused by the API setup script
- [`../../website/azure-pipelines.yml`](../../website/azure-pipelines.yml) — the existing precedent for SSH-based deploys + managed-DB pattern
