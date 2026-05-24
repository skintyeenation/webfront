# Azure Pipelines

YAML pipeline definitions that run on Azure DevOps under the
`skintyeenation` org / `devops` project. Per
[ADR-9](../docs/architecture-decisions.md#adr-9--source-control-azure-devops-as-primary-github-as-mirror)
this is the canonical CI/CD location for the repo — GitHub Actions
workflows under `.github/workflows/` are being retired one-by-one as
their Azure Pipeline equivalents land here.

## Active pipelines

| File | What it does | Trigger | Status |
|---|---|---|---|
| [`publish-docs-to-sharepoint.yml`](./publish-docs-to-sharepoint.yml) | Mirrors `docs/` (markdown + pandoc-rendered HTML) to the band's SharePoint document library | push to `master` touching `docs/**` | new; pending the one-time Azure setup in [`docs/devops/migrate-ci-workflows.md`](../docs/devops/migrate-ci-workflows.md) |

(Future pipelines for the website deploy, the lookup-api tests, and the
app's Expo build will land here.)

## Auth pattern — workload identity federation

Every pipeline that touches Azure / Microsoft Graph uses an **ADO service
connection with workload identity federation** rather than a stored
client_secret. The federated trust is one-time per Entra app, configured
via "Federated credentials" on the app registration; runtime token
minting happens just-in-time via the `AzureCLI@2` task or `az account
get-access-token`.

**Result:** zero long-lived secrets in either GitHub repository secrets
or Azure DevOps Library. Nothing rotates every 24 months. If a
pipeline run is compromised, the worst case is the run's lease of an
access token (expires ~1 hour later) — no secret to revoke.

## Project layout convention

- Each YAML lives at `azure-pipelines/<name>.yml`.
- Pipelines target the `devops` project, not separate projects per
  repo (see [`docs/devops/azure-devops-setup.md`](../docs/devops/azure-devops-setup.md)
  for the project-vs-repo rationale).
- Shared variable groups in ADO Library are named after the pipeline
  (e.g. `sharepoint-docs` for this one) so the link between YAML
  variables and ADO config is obvious.
- Service connections follow `<purpose>-sc` (`sharepoint-docs-sc`).

## Adding a pipeline

1. Drop the YAML at `azure-pipelines/<name>.yml`.
2. In ADO: **Pipelines → New pipeline → Existing Azure Pipelines YAML
   file** → pick the file.
3. (If it needs auth) create a service connection + federated credential
   per [`docs/devops/migrate-ci-workflows.md`](../docs/devops/migrate-ci-workflows.md).
4. Add a row to the table above.
