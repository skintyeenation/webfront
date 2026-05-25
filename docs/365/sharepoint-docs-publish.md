# Publishing `docs/` to SharePoint

The `docs/` tree auto-publishes to SharePoint on every push to `master`
that touches `docs/`. Each `.md` file goes up alongside a
pandoc-rendered `.html` sibling, mirroring the repo's directory
structure.

- Pipeline: `azure-pipelines/publish-docs-to-sharepoint.yml`
- Publisher script: `scripts/publish-docs-to-sharepoint.sh`
- Setup automation: `scripts/setup-sharepoint-pipeline.sh`
- Auth: **no client_secret anywhere** — federated credentials via
  Azure Pipelines workload identity.

---

## One-time setup

The setup is two manual steps plus one script run. The script handles
**everything else** — Entra app registration, Microsoft Graph
permissions + admin consent, m365 CLI install + configuration, site
grant, federated credential, ADO service connection, variable group,
pipeline registration.

### Step 1 — Create the SharePoint site

1. Open <https://skintyeenation.sharepoint.com/_layouts/15/sharepoint.aspx>
2. **+ Create site → Team site**.
3. Name: `it-project-docs`.
4. Done.

(The script can't auto-create SharePoint sites — there's no
admin-bypass API for self-service site creation. Everything else is
scriptable.)

### Step 2 — Sign in to Azure CLI

```bash
az login
```

Sign in as `admin@skintyeenation.onmicrosoft.com` (or any account with
**Application Administrator** + **ADO Project Administrator** roles).

### Step 3 — Run the script

```bash
bash scripts/setup-sharepoint-pipeline.sh
```

The script:

1. Confirms names (Enter to accept defaults).
2. Looks up or **creates** the publisher app `it-project-docs-publisher`
   (Application permission `Sites.Selected` on Microsoft Graph,
   admin-consented).
3. Resolves the SharePoint site's Graph ID.
4. Installs `@pnp/cli-microsoft365` if missing.
5. Looks up or **creates** the sign-in app `skintyeenation-admin-cli`
   (delegated `Sites.FullControl.All` + `User.Read`, public client,
   `http://localhost` redirect, admin-consented).
6. Configures m365 CLI non-interactively to use the sign-in app.
7. Opens a browser for `m365 login` — **sign in as
   `admin@skintyeenation.onmicrosoft.com`** when prompted, then come
   back to the terminal.
8. Grants the publisher app `write` access on the SharePoint site.
9. Adds a federated credential to the publisher app trusting the ADO
   service-connection identity (no secret created).
10. Creates the ADO service connection `sharepoint-docs-sc`.
11. Creates the ADO variable group `sharepoint-docs` (tenant/client/
    site IDs, all non-secret).
12. Registers the `publish-docs-to-sharepoint` pipeline.

Successful run ends with `✔ done — re-run anytime; idempotent`. The
whole thing takes ≈3 minutes plus however long the browser sign-in
takes.

The script is **idempotent**: re-running picks up existing objects and
skips/patches as needed. If anything fails partway, fix the cause and
re-run.

### Step 4 — Verify the pipeline

```bash
echo "" >> docs/README.md
git commit -am "test: trigger sharepoint pipeline"
git push azure master
```

Watch the run at <https://dev.azure.com/skintyeenation/devops/_build>.
When green (~2–3 minutes), the `docs/` tree is at:

<https://skintyeenation.sharepoint.com/sites/it-project-docs/Shared%20Documents/webfront/>

with each `.md` next to its rendered `.html`.

---

## Automatic re-publishing

After step 4, the pipeline is live. Pushes to `master` that touch any
of these re-publish:

- `docs/**`
- `scripts/publish-docs-to-sharepoint.sh`
- `azure-pipelines/publish-docs-to-sharepoint.yml`

Deletions are **not** propagated — removing a doc from the repo
leaves its SharePoint copy alone. Delete manually in SharePoint if
needed.

---

## Required roles

The user running `bash scripts/setup-sharepoint-pipeline.sh` needs:

- **Application Administrator** (or higher) on Entra — to create apps
  and grant admin consent on Graph permissions.
- **ADO Project Administrator** on `dev.azure.com/skintyeenation/devops` —
  to create service connections, variable groups, and pipelines.
- **SharePoint Administrator** (delegated — comes with Global Admin) —
  to grant the publisher app access on a specific site.

`admin@skintyeenation.onmicrosoft.com` has all of the above by virtue
of Global Administrator role.

---

## Troubleshooting

**Script dies at "publisher app creation: forbidden / insufficient privileges"**
→ Your user lacks **Application Administrator** role. Either get it
assigned, or have someone with it run this step (or set up the app
manually per the "Manual setup" appendix below) then re-run the script
with `--entra-app-id <id>`.

**`m365 login` succeeds but the next step says "Access denied"**
→ Your m365 sign-in session was tied to a prior misconfigured app and
didn't refresh after reconfiguration. Run `m365 logout` and re-run
the script.

**Pipeline run fails with `HTTP 403` against Graph**
→ The site grant didn't take. Re-run the setup script — it's
idempotent and will re-apply the grant.

**`Error: Access denied` from `m365 spo site apppermission`** (during script)
→ Either (a) the m365 token is stale (missing scopes added since
login), or (b) the signed-in user lacks **SharePoint Administrator**
role at the tenant. The script auto-handles (a) by forcing a fresh
login and retrying once. For (b), assign the role: Entra → Users →
`admin@skintyeenation.onmicrosoft.com` → Assigned roles → **+ Add
assignment → SharePoint Administrator → Apply**. Global Administrator
includes this implicitly in most tenants, but some require explicit
assignment.

To check your own role assignments:

```bash
az rest --method GET \
  --uri 'https://graph.microsoft.com/v1.0/me/memberOf?$select=displayName' \
  --query 'value[].displayName' -o tsv
```

You should see `Global Administrator` or `SharePoint Administrator` (or
both) in the output.

**`Error: Access denied` persists after role assignment**
→ Run `m365 logout && m365 login` to mint a fresh token that picks up
the new role, then re-run the script.

**`Error: appId: appId is required`**
→ Out-of-date or partial m365 config. Run `m365 cli config reset --force`
and re-run the script.

**`AADSTS500113: No reply address is registered`**
→ The script's auto-patch of the sign-in app's redirect URI didn't
take (Azure CLI permission issue). Manually: Entra → App
registrations → `skintyeenation-admin-cli` → Authentication →
**+ Add a platform → Mobile and desktop applications** → check
`http://localhost` → Configure. Also: Advanced → Allow public client
flows → Yes → Save. Then re-run.

**`AADSTS700016: Application not found in directory`**
→ Wait 30 seconds (replication lag after app creation) and re-run.

---

## Removing the integration

To stop publishing:

1. ADO → **Pipelines → publish-docs-to-sharepoint → ⋮ → Delete pipeline**.
2. ADO → **Project Settings → Service connections → sharepoint-docs-sc → Delete**.
3. Entra → App registrations → `it-project-docs-publisher` → **Delete**.
4. Entra → App registrations → `skintyeenation-admin-cli` → **Delete** (only if no other tooling uses it).
5. Optionally: delete the SharePoint site.

Published docs in SharePoint persist after teardown (intentional —
version history kept).

---

## Background (skip unless curious)

### Two Entra apps, two roles

The script creates two distinct Entra apps with distinct trust
boundaries:

| | Created/used as | Permissions | Used by |
|---|---|---|---|
| **`it-project-docs-publisher`** | App-only auth target | `Sites.Selected` (Application) — explicit per-site grant | The Azure Pipeline writes docs through it |
| **`skintyeenation-admin-cli`** | Interactive sign-in app | `Sites.FullControl.All` + `User.Read` (Delegated) | The m365 CLI signs admins in through it (one time during setup, plus any future site-grant maintenance) |

They never overlap. The pipeline never uses
`skintyeenation-admin-cli`; you never use `it-project-docs-publisher`
interactively.

### Why no client_secret

The Azure Pipeline mints a Microsoft Graph token at runtime using
**workload identity federation**: ADO's service-connection identity is
registered as a trusted issuer on the publisher app, so the app
issues tokens to anything bearing a valid ADO-signed OIDC assertion.
The Graph API accepts those tokens just like client_credentials
tokens. No long-lived secret exists anywhere.

The legacy `client_credentials` flow (`AZURE_CLIENT_SECRET` env var)
is still supported by the publisher script for local dev — see
`scripts/publish-docs-to-sharepoint.sh` — but production uses
federation exclusively.

### Why `Sites.Selected` (and not `Sites.ReadWrite.All`)

`Sites.Selected` is the least-privilege Graph scope: by itself it
grants no access. You then explicitly authorize the app per-site (the
script does this via `m365 spo site apppermission add`). Even a
fully-compromised publisher app can only touch `it-project-docs` —
nothing else on the tenant.

### Why m365 CLI (and not `az` or PnP PowerShell)

- **`az rest POST .../sites/{id}/permissions`** — would be simplest
  but Microsoft enforces a hard-coded preauthorization gate
  (AADSTS65002) that prevents Azure CLI from requesting
  `Sites.FullControl.All` on Graph. Doesn't work, no workaround.
- **PnP PowerShell `Grant-PnPAzureADAppSitePermission`** — works on
  Windows; cask retired on macOS late 2024.
- **m365 CLI `m365 spo site apppermission add`** — works
  cross-platform. Used here.

---

## Manual setup appendix

If you can't run the script (no Application Administrator role, or
non-standard tenant policies), here are the manual equivalents for
each scripted step. **Only do these if the script can't.**

### Manually register the publisher app

Entra → **App registrations → + New registration**:
- Name: `it-project-docs-publisher`
- Supported account types: **Accounts in this organizational directory only**
- Redirect URI: leave blank
- **Register**

Then on **API permissions**:
- **+ Add a permission → Microsoft Graph → Application permissions**
- Check `Sites.Selected`, **Add permissions**
- **Grant admin consent for Skin Tyee First Nation**

Then re-run the script with `--entra-app-id <appId-from-Overview-page>`.

### Manually register the sign-in app

Entra → **App registrations → + New registration**:
- Name: `skintyeenation-admin-cli`
- Supported account types: **Accounts in this organizational directory only**
- Redirect URI: **Public client/native (mobile & desktop)** → `http://localhost`
- **Register**

Then on **API permissions**:
- **+ Add a permission → Microsoft Graph → Delegated permissions**
- Check `Sites.FullControl.All`, `User.Read`, **Add permissions**
- **Grant admin consent**

Then on **Authentication → Advanced → Allow public client flows** → Yes → **Save**.

Then re-run the script — it'll find this app by name and skip
creation.
