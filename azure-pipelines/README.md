# Azure Pipelines

YAML pipeline definitions that run on Azure DevOps under the
`skintyeenation` org / `devops` project. Per
[ADR-9](../docs/architecture-decisions.md#adr-9--source-control-azure-devops-as-primary-github-as-mirror)
this is the canonical CI/CD location for the repo — GitHub Actions
workflows under `.github/workflows/` are being retired one-by-one as
their Azure Pipeline equivalents land here.

> Bird's-eye view of every deploy target + the pipeline / setup
> script that owns it: [`../docs/devops/deploy-architecture.md`](../docs/devops/deploy-architecture.md).

## Layout

```
azure-pipelines/
├── README.md
├── publish-docs-to-sharepoint.yml          ← top-level (legacy positioning)
├── Builds/                                  ← things that produce artefacts
│   └── build-app.yml                        ← native iOS/Android via EAS Build
└── Deployments/                             ← things that ship to a hosted env
    ├── deploy-api.yml                       ← api/ NestJS → api.skintyee.ca
    ├── deploy-lookup.yml                    ← lookup/api/ → lookup.skintyee.ca
    ├── deploy-app-web.yml                   ← app/ web → app.skintyee.ca
    └── deploy-lookup-app-web.yml            ← lookup/app/ web → lookup-app.skintyee.ca
```

`Builds/` vs `Deployments/` is a soft convention: builds *produce*
artefacts (an app binary on EAS, a Docker image in ACR), deployments
*ship* something to a hosted environment (a Container App revision, a
Static Web App update, a SharePoint document library). Some pipelines
do both — `deploy-api.yml` builds the image then ships it. Those land
in `Deployments/` if the visible outcome is "X is now live at Y".

`publish-docs-to-sharepoint.yml` stays at the top level for historical
reasons (it was the first pipeline and predates the Builds/Deployments
split). Won't break anything to move it; not worth the path churn.

## Active pipelines

| File | What it does | Trigger | Auth |
|---|---|---|---|
| [`publish-docs-to-sharepoint.yml`](./publish-docs-to-sharepoint.yml) | Mirrors `docs/` + root README to the band's SharePoint document library (markdown + pandoc-rendered HTML + non-`.md` assets) | push to `master` touching `docs/**` or the publisher script | Federated SC `sharepoint-docs-sc` |
| [`Builds/build-app.yml`](./Builds/build-app.yml) | Native iOS + Android build of `app/` via **EAS Build** (Expo hosted); optional `eas submit` to TestFlight + Play Internal Testing | push to `master` touching `app/**` (manual run for production submits) | `EXPO_TOKEN` (variable group secret) |
| [`Deployments/deploy-api.yml`](./Deployments/deploy-api.yml) | Build api/ Docker → ACR → update `api-prod` Container App revision + smoke-test `/v1/health` | push to `master` touching `api/**` | Federated SC `skintyee-prod-azure` |
| [`Deployments/deploy-lookup.yml`](./Deployments/deploy-lookup.yml) | Same shape as deploy-api but for `lookup/api/` → `lookup-prod` Container App (min-replicas=1, always-on) | push to `master` touching `lookup/api/**` | Federated SC `skintyee-prod-azure` |
| [`Deployments/deploy-app-web.yml`](./Deployments/deploy-app-web.yml) | `expo export --platform web` on `app/` → Azure Static Web Apps at `app.skintyee.ca` | push to `master` + **PRs** touching `app/**` (PR previews enabled) | `SWA_DEPLOYMENT_TOKEN` |
| [`Deployments/deploy-lookup-app-web.yml`](./Deployments/deploy-lookup-app-web.yml) | Same shape as deploy-app-web but for `lookup/app/` → `lookup-app.skintyee.ca` | push to `master` + PRs touching `lookup/app/**` | `LOOKUP_APP_SWA_DEPLOYMENT_TOKEN` |

The existing WordPress site pipeline lives outside this directory at
[`../website/azure-pipelines.yml`](../website/azure-pipelines.yml) —
it predates the move into `azure-pipelines/` and stays alongside the
site source for now.

## Auth pattern — workload identity federation (where applicable)

Every pipeline that touches Azure or Microsoft Graph uses an **ADO
service connection with workload identity federation** rather than a
stored client_secret:

- **SharePoint publisher** — SC `sharepoint-docs-sc`, federated to the
  `it-project-docs-publisher` Entra app (Sites.Selected on
  Microsoft Graph).
- **Container Apps deploys** (api, lookup) — SC `skintyee-prod-azure`,
  federated to the `skintyee-prod-deploy` Entra app (AcrPush on ACR,
  Contributor on the Container Apps).

Pipelines that ship to services without federated-identity support
yet use a scoped, rotatable token:

- **EAS Build** — `EXPO_TOKEN` (Expo Personal Access Token, 1-year
  default lifetime). Rotation:
  <https://expo.dev/settings/access-tokens>.
- **Azure Static Web Apps** — per-resource deployment token issued by
  Azure (regenerable via `az staticwebapp secrets reset-api-key`).

**Result:** zero long-lived secrets in either GitHub repo secrets or
ADO Library for the Azure-side workloads. The EAS / SWA tokens are
the only scoped credentials in pipelines, and each is held in
1Password's IT/Admin vault as the rotation source of truth.

Full secrets table:
[`../docs/devops/deploy-architecture.md § Secrets inventory`](../docs/devops/deploy-architecture.md#secrets-inventory).

## Project layout convention

- **`Builds/`** — pipelines whose outcome is an artefact (binary,
  image, archive) ready for later promotion.
- **`Deployments/`** — pipelines whose outcome is "X is now live at
  Y" (a Container App revision, a SWA bundle, a SharePoint sync).
- **Top-level** — the legacy SharePoint publisher (predates the split).
- **`scripts/`** — currently empty; reserved for cross-cutting bash
  invoked by multiple pipelines, if/when that emerges.
- **`templates/`** — currently empty; reserved for reusable YAML
  template files (`- template: ../templates/<name>.yml`) shared
  across pipelines.

Naming:

- YAML file ↔ pipeline name 1:1 (`deploy-api.yml` → `deploy-api`
  pipeline).
- Variable groups in ADO Library follow the auth surface, not the
  pipeline: `sharepoint-docs` for the SharePoint publisher,
  `skintyee-prod-azure` for everything that hits the prod Azure
  subscription.
- Service connections: `<purpose>-sc` (`sharepoint-docs-sc`) or
  `<env>-<cloud>` (`skintyee-prod-azure`).

## Adding a pipeline

1. Decide: is the outcome an artefact (Build) or a deploy (Deployment)?
   Drop the YAML at `Builds/<name>.yml` or `Deployments/<name>.yml`.
2. If it needs Azure / Graph access: reuse an existing service
   connection if one fits the auth scope; otherwise create a new
   federated SC + Entra app per [ADR-10](../docs/architecture-decisions.md)
   + [`../docs/devops/sharepoint-pipeline-postmortem.md`](../docs/devops/sharepoint-pipeline-postmortem.md)
   (the post-mortem lists every gotcha — ADO modern WIF subject
   format, `az rest --resource` for ADO API, role-propagation delays,
   etc.).
3. If it has secrets: add them to a variable group in ADO Library
   (existing one if the scope matches; new one named after the auth
   surface otherwise).
4. Register the pipeline (one of):
   - **Via az** — `az pipelines create --name <name> --yml-path azure-pipelines/<subdir>/<name>.yml --repository webfront --branch master`
   - **Via ADO UI** — Pipelines → New pipeline → Existing Azure
     Pipelines YAML file → pick the file.
5. Add a row to the "Active pipelines" table above + (if it's a
   notable deploy target) to
   [`../docs/devops/deploy-architecture.md`](../docs/devops/deploy-architecture.md).
6. If the pipeline shape is reusable, write the setup script in
   `../scripts/setup-<name>.sh` — same idempotent + dry-run + sensible-
   defaults pattern as the existing scripts.

## Running pipelines

- **From a push:** automatic, per the `trigger:` block at the top of
  each YAML. Most pipelines only fire on `master` + path filter.
- **From a PR:** the two `deploy-*-web.yml` pipelines have `pr:`
  triggers — every PR touching the relevant source tree gets its own
  Azure Static Web Apps preview URL automatically.
- **From the ADO UI:**
  <https://dev.azure.com/skintyeenation/devops/_build> → pick the
  pipeline → **Run pipeline** → optionally override parameters
  (e.g. `build-app` accepts `buildProfile`, `platform`,
  `submitToStores`, `waitForCompletion`).
- **From `az`:**
  ```bash
  az pipelines run \
    --org https://dev.azure.com/skintyeenation \
    --project devops \
    --name <pipeline-name> \
    --branch master
  ```

## See also

- [`../docs/devops/deploy-architecture.md`](../docs/devops/deploy-architecture.md) — full deploy map (component → target, every secret, every script, naming, stand-up order)
- [`../docs/devops/deployment-plan.md`](../docs/devops/deployment-plan.md) — backend services deploy plan (Container Apps + Postgres) — ADR-10
- [`../docs/devops/app-deploy-eas.md`](../docs/devops/app-deploy-eas.md) — `build-app.yml` operational doc — ADR-11
- [`../docs/devops/app-deploy-web.md`](../docs/devops/app-deploy-web.md) — `deploy-*-web.yml` operational doc — ADR-12
- [`../docs/devops/sharepoint-pipeline-postmortem.md`](../docs/devops/sharepoint-pipeline-postmortem.md) — what went wrong setting up the first federated pipeline, how later setup scripts incorporate the lessons
- [`../docs/devops/agents.md`](../docs/devops/agents.md) — self-hosted ADO build agent (`azure-agents/`)
- [`../docs/architecture-decisions.md`](../docs/architecture-decisions.md) — ADRs 9–12 (the source-control + compute + native + web decisions)
