# Migrating CI workflows from GitHub Actions to Azure Pipelines

Once the canonical repo lives on Azure (per
[`azure-devops-setup.md`](./azure-devops-setup.md)), CI/CD that was
previously triggered by GitHub pushes needs to be re-pointed at
Azure. This doc walks through porting the **SharePoint docs
publisher** as the worked example; the same pattern applies to any
future workflow.

## Current state (pre-migration)

- **`.github/workflows/publish-docs-to-sharepoint.yml`** — GitHub
  Actions workflow added under [ADR-8](../architecture-decisions.md).
  Triggers on push to `master` when `docs/**` changes; uses Microsoft
  Graph with a `Sites.Selected`-scoped Entra ID app to mirror `docs/`
  into a SharePoint document library.
- Auth: `AZURE_CLIENT_SECRET` stored as a **GitHub repository
  secret** (created during the
  [`docs/365/sharepoint-docs-publish.md`](../365/sharepoint-docs-publish.md)
  setup).

## Target state (post-migration)

- **`azure-pipelines/publish-docs-to-sharepoint.yml`** — Azure
  Pipeline triggering on the same `master`-push-touching-docs
  condition, running the same `scripts/publish-docs-to-sharepoint.sh`
  publisher.
- Auth: an **ADO service connection** with **workload identity
  federation** (federated credentials) to the same Entra ID app —
  *no client_secret stored anywhere*. The ADO project's
  managed-identity is trusted by the Entra ID app via OIDC, and the
  Graph token is minted just-in-time per pipeline run.
- The legacy GitHub Actions workflow is kept disabled but in-tree as
  a documented fallback for ~30 days, then deleted.

The improvement: **no long-lived client secret** anywhere in either
GitHub or ADO. The 24-month rotation reminder from
[`sharepoint-docs-publish.md`](../365/sharepoint-docs-publish.md#3-generate-a-client-secret)
goes away.

## TL;DR — run the automation script

Most of the steps below are automated by `scripts/setup-sharepoint-pipeline.sh`:

```bash
# (one-time, requires Entra ID Application Admin + ADO Project Admin)
bash scripts/setup-sharepoint-pipeline.sh \
  --sharepoint-site-id 'skintyeenation.sharepoint.com,...,...' \
  --sharepoint-drive   Documents
# (everything else defaults to skintyeenation/devops/webfront and is
# discoverable via az — see --help)
```

The script handles **steps 1, 2, 3 below** (federated credential + ADO
service connection + variable group + pipeline registration). It's
idempotent — safe to re-run.

What the script does NOT automate (each is one-time per environment):

- **`az login`** — interactive sign-in. Script prompts you.
- **Entra ID Application Admin role** on the running user (Microsoft
  policy — only this role can add federated credentials).
- **ADO Project Administrator role** on the `devops` project.
- The **prior ADR-8 setup** — the `it-project-docs-publisher` Entra app
  must already exist with `Sites.Selected` granted to the target
  SharePoint site (per [`../365/sharepoint-docs-publish.md`](../365/sharepoint-docs-publish.md)
  steps 2-5). The script verifies and points back at that doc if
  missing.
- **First-run pipeline authorization** — ADO may prompt for "Permit"
  on the first pipeline run that uses the new service connection or
  variable group (one-click in the ADO UI).

If you'd rather do the four steps yourself by clicking through the
UIs, the manual walkthrough is unchanged below.

## Step-by-step

### 1. Add federated credentials to the existing Entra ID app

The Entra app you already created (`it-project-docs-publisher`, per
[`sharepoint-docs-publish.md § 2`](../365/sharepoint-docs-publish.md#2-register-the-entra-id-app))
needs to trust the new ADO service connection. You're not creating a
new app — just adding a new credential type to the existing one.

1. <https://entra.microsoft.com> → **App registrations →
   it-project-docs-publisher** → **Certificates & secrets** → tab
   **Federated credentials** → **+ Add credential**.
2. **Federated credential scenario:** *Other issuer*.
3. **Issuer:** `https://vstoken.dev.azure.com/{ado-org-id}` — find
   this in ADO at **Organization Settings → OAuth configurations**.
   (It's a GUID; copy it.)
4. **Subject identifier:** `sc://skintyeenation/webfront/sharepoint-docs-sc`
   (this is the ADO service connection identity, which we'll create
   in step 2 with that exact name).
5. **Name:** `ado-sharepoint-docs-publisher`.
6. **Audience:** `api://AzureADTokenExchange` (default).

### 2. Create the ADO service connection (federated)

In ADO **Project Settings → Service connections → New service
connection → Azure Resource Manager → Workload identity federation
(automatic) → Next**:

- **Subscription:** pick any subscription in the tenant (ADO won't
  *use* it for SharePoint, but the wizard requires one). The Azure
  subscription that hosts `api.skintyee.ca` is fine.
- **Resource group:** leave empty.
- **Service connection name:** `sharepoint-docs-sc` — must match the
  subject identifier from step 1.4.
- **Grant access permission to all pipelines:** off (limit scope to
  the publish pipeline below).

ADO creates the connection and sets up the OIDC trust on its end.

### 3. Port the workflow

Add `azure-pipelines/publish-docs-to-sharepoint.yml` to the repo:

```yaml
name: publish-docs-to-sharepoint

trigger:
  branches:
    include: [master]
  paths:
    include:
      - docs/**
      - scripts/publish-docs-to-sharepoint.sh
      - azure-pipelines/publish-docs-to-sharepoint.yml
pr: none

pool:
  vmImage: ubuntu-latest

variables:
  # Same values that GitHub Actions used. Drop AZURE_CLIENT_SECRET —
  # the service connection mints the Graph token instead.
  AZURE_TENANT_ID: $(AZURE_TENANT_ID)
  AZURE_CLIENT_ID: $(AZURE_CLIENT_ID)
  SHAREPOINT_SITE_ID: $(SHAREPOINT_SITE_ID)
  SHAREPOINT_DRIVE_NAME: $(SHAREPOINT_DRIVE_NAME)
  SHAREPOINT_TARGET_PATH: 'webfront'

jobs:
  - job: publish
    displayName: Publish docs/ tree to SharePoint
    steps:
      - checkout: self
        fetchDepth: 1

      - script: |
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends pandoc jq
          pandoc --version | head -1
        displayName: Install pandoc + jq

      - task: AzureCLI@2
        displayName: Acquire Graph token + run publisher
        inputs:
          azureSubscription: sharepoint-docs-sc   # the service connection
          scriptType: bash
          scriptLocation: inlineScript
          inlineScript: |
            set -euo pipefail
            # Mint a token for Microsoft Graph using the service
            # connection's federated identity. No client_secret involved.
            AZURE_CLIENT_SECRET="$(az account get-access-token \
              --resource https://graph.microsoft.com \
              --query accessToken -o tsv)"
            # Hack: the publisher script reads AZURE_CLIENT_SECRET to do
            # its own client_credentials call. We override that path by
            # injecting an env override — see the conditional in the
            # script (added by the migration commit).
            export GRAPH_TOKEN_PREACQUIRED="$AZURE_CLIENT_SECRET"
            export AZURE_CLIENT_SECRET=""   # not used in this path
            bash scripts/publish-docs-to-sharepoint.sh
```

Note: the publisher script needs a one-line change to accept a
pre-acquired token (so we don't do a redundant token call when we
already have one from the service connection). The conditional looks
like:

```bash
# scripts/publish-docs-to-sharepoint.sh — modified token-acquisition section
if [ -n "${GRAPH_TOKEN_PREACQUIRED:-}" ]; then
  TOKEN="$GRAPH_TOKEN_PREACQUIRED"
  say "using pre-acquired Graph token (federated credential path)"
else
  # existing client_credentials path — for local dev / legacy GHA
  TOKEN=$(curl -sf -X POST \
    "https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
    ...)
fi
```

This means the **same publisher script** works for:
- Local dev (uses your locally-set `AZURE_CLIENT_SECRET`)
- Legacy GitHub Actions (uses repo secret `AZURE_CLIENT_SECRET`)
- New Azure Pipelines (uses federated token via service connection,
  no secret)

### 4. Set the non-secret variables in ADO

ADO **Pipelines → Library → Variable groups → + Variable group**:

- **Name:** `sharepoint-docs`
- **Variables** (none secret — the only secret moved to federated):
  - `AZURE_TENANT_ID` = the tenant ID (same value as the GitHub
    secret had)
  - `AZURE_CLIENT_ID` = the `it-project-docs-publisher` app's client ID
  - `SHAREPOINT_SITE_ID` = the comma-triple site ID
  - `SHAREPOINT_DRIVE_NAME` = `Documents` (or wherever you set it)
- **Pipeline permissions** → grant the `publish-docs-to-sharepoint`
  pipeline access.

Wire the variable group into the pipeline by adding under `variables:`:

```yaml
variables:
  - group: sharepoint-docs
  - name: SHAREPOINT_TARGET_PATH
    value: 'webfront'
```

(Replace the inline variable block above with this.)

### 5. Verify

Edit any `docs/*.md` file. Push to Azure `master`. Pipeline should
trigger, install pandoc + jq, acquire the federated token, and run
the publisher. After ~2-3 minutes, the SharePoint site reflects the
change.

### 6. Disable the GitHub Actions workflow

In **GitHub → Actions → Publish docs to SharePoint → ⋮ → Disable
workflow**. Keep the file in the repo for ~30 days so anyone reading
old commit messages still finds it; then delete with a "GitHub
Actions retired, Azure Pipelines is canonical" commit message.

The GitHub `AZURE_CLIENT_SECRET` repo secret can be deleted
**immediately** once the Azure Pipeline is verified working — it's
no longer used by either side.

### 7. Rotate the Entra ID client secret to nothing

If you want to fully complete the federated migration, the Entra ID
app's existing client_secret (created during the original
`sharepoint-docs-publish.md` setup) can be **deleted** once neither
GitHub Actions nor any local dev still uses it. This is the
"complete the security upgrade" step — your Entra app then only has
federated credentials, no static secret, nothing to rotate every
24 months.

Local dev that needs the publisher will either:
- Use a personal `az login` + the inline token approach (run the
  script from a shell where `az account get-access-token` works), or
- Keep a per-developer client_secret in `lookup/.env` (NOT committed)
  for dry-runs only.

## Reusing this pattern for future workflows

Every future automation that was going to be a GitHub Action should
instead be an Azure Pipeline. Pattern:

1. Identify the auth surface (Microsoft Graph? Azure subscription?
   external API?).
2. If MSFT: federated credentials via service connection (per above).
   If external: an ADO secure file or variable group.
3. Add `azure-pipelines/<name>.yml` with trigger + steps.
4. Wire into ADO **Library → Variable groups** for non-secret config.
5. Verify, document.

## Decision provenance

This migration reverses
[ADR-8](../architecture-decisions.md#adr-8--docs-distribution-sharepoint-mirror-push-triggered-via-github-actions)
("GitHub Actions over Azure DevOps"). The rationale in ADR-8 was "the
repo lives on GitHub and there's no existing ADO pipeline for webfront."
Both halves of that rationale change with the move to Azure as
primary — see [ADR-9](../architecture-decisions.md#adr-9--source-control-azure-devops-as-primary-github-as-mirror)
for the current decision record.
