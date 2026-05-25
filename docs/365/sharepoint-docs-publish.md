# Publishing `docs/` to SharePoint

The `docs/` tree auto-publishes to SharePoint on every push to `master`
that touches `docs/`. Each `.md` file goes up alongside a
pandoc-rendered `.html` sibling, mirroring the repo's directory
structure.

- Pipeline: `azure-pipelines/publish-docs-to-sharepoint.yml`
- Publisher script: `scripts/publish-docs-to-sharepoint.sh`
- Auth: **no client_secret anywhere** — federated credentials via
  Azure Pipelines workload identity.

---

## One-time setup

≈30 minutes total. Do the steps **in order**. Every command and value
is copy-paste.

### Step 1 — Create the SharePoint site

1. Open <https://skintyeenation.sharepoint.com/_layouts/15/sharepoint.aspx>
2. **+ Create site → Team site**.
3. Name: `it-project-docs`.
4. Done.

Final URL: `https://skintyeenation.sharepoint.com/sites/it-project-docs`

### Step 2 — Register the Entra app

1. Open <https://entra.microsoft.com>, sign in as global admin.
2. **App registrations** (left sidebar) → **+ New registration**.
3. Name: `it-project-docs-publisher`
4. Supported account types: **Accounts in this organizational directory only**.
5. Redirect URI: leave blank.
6. **Register**.

On the new app's **Overview** page, copy these — you'll need them later:

- **Application (client) ID** — a GUID
- **Directory (tenant) ID** — a GUID

### Step 3 — Grant `Sites.Selected` Application permission

On the app's **API permissions** page:

1. **+ Add a permission → Microsoft Graph → Application permissions** (NOT delegated).
2. Search `Sites.Selected` → check it → **Add permissions**.
3. Click **Grant admin consent for Skin Tyee First Nation**.

The `Sites.Selected` row should now show a green checkmark.

### Step 4 — Do NOT create a client secret

The federated-credential path replaces it. **If a secret already
exists** on the app (e.g. from prior setup):

1. **Certificates & secrets → Client secrets**.
2. Click the trash icon next to every row. Confirm.

End state for this app: **0 client secrets, 0 certificates**. The
federated credential (added by the script in step 7) is the only
credential it needs.

### Step 5 — Register a sign-in app for the m365 CLI

The CLI for Microsoft 365 v11+ has no default Entra app — you have to
register one in your tenant for the CLI to sign you in through. This
is a **second** app, separate from `it-project-docs-publisher`; it
exists only to give the CLI a delegated identity to authenticate
admin users.

In Entra → **App registrations → + New registration**:

1. Name: `skintyeenation-admin-cli`
2. Supported account types: **Accounts in this organizational directory only**
3. Redirect URI: dropdown **Public client/native (mobile & desktop)**, value `http://localhost`
4. **Register**

Copy the **Application (client) ID** from the Overview page.

On the new app's **API permissions** page:

1. **+ Add a permission → Microsoft Graph → Delegated permissions**
2. Check:
   - `Sites.FullControl.All`
   - `User.Read`
3. **Add permissions**
4. **Grant admin consent for Skin Tyee First Nation** — both rows turn green

On the new app's **Authentication** page:

1. Scroll to **Advanced settings → Allow public client flows**
2. Toggle **Yes**
3. **Save**

> **Why a second app?** This one is delegated/interactive — the CLI
> uses it to sign *you* in as an admin user. `it-project-docs-publisher`
> from step 2 is app-only — the Azure Pipeline uses *it* to write to
> SharePoint with no user involved. Two apps because they do two
> different things.

### Step 6 — Install + configure the m365 CLI

Run these commands on your laptop:

```bash
nvm install 22
nvm use 22
npm install -g @pnp/cli-microsoft365
m365 setup
```

`m365 setup` runs an interactive wizard. Answer **exactly** as shown
(Client ID is the `skintyeenation-admin-cli` app id from step 5):

| Prompt | Answer |
|---|---|
| Create new or use existing app? | **Use an existing app registration** |
| Client ID | **paste your `skintyeenation-admin-cli` app id from step 5** |
| Tenant ID | `ee46daed-e89f-4438-b1f7-dc26203a4bec` |
| **Client secret** | **(press Enter — LEAVE EMPTY)** |
| How do you plan to use the CLI? | **Interactively** |
| PowerShell? | No |
| Experience | doesn't matter |

The summary at the end should show `authType: browser` and **no
`clientSecret` line**. If it shows `authType: secret`, you picked the
wrong "How do you plan to use the CLI?" answer — run `m365 cli config
reset --force` and redo.

### Step 7 — Run the automation script

```bash
bash scripts/setup-sharepoint-pipeline.sh
```

A browser opens for `m365 login` — sign in as the global admin and
return to the terminal. The script then runs end-to-end:

| | What | Why |
|---|---|---|
| 7a | `m365 spo site apppermission add` | Grants `it-project-docs-publisher` write access on the site |
| 7b | `az ad app federated-credential create` | Trusts the ADO service connection's identity (no secret needed) |
| 7c | `az devops service-endpoint azurerm create` | Creates the ADO service connection `sharepoint-docs-sc` |
| 7d | `az pipelines variable-group create` | Creates the variable group `sharepoint-docs` with tenant/client/site IDs |
| 7e | `az pipelines create` | Registers the `publish-docs-to-sharepoint` pipeline |

Successful output ends with `✔ done — re-run anytime; idempotent`.

### Step 8 — Verify the pipeline

```bash
echo "" >> docs/README.md
git commit -am "test: trigger sharepoint pipeline"
git push azure master
```

Watch the run at <https://dev.azure.com/skintyeenation/devops/_build>.
When the run goes green (~2–3 minutes), the `docs/` tree is at:

<https://skintyeenation.sharepoint.com/sites/it-project-docs/Shared%20Documents/webfront/>

with each `.md` next to its rendered `.html`.

---

## Automatic re-publishing

After step 8, the pipeline is live. Pushes to `master` that touch any
of these re-publish:

- `docs/**`
- `scripts/publish-docs-to-sharepoint.sh`
- `azure-pipelines/publish-docs-to-sharepoint.yml`

Deletions are **not** propagated — removing a doc from the repo
leaves its SharePoint copy alone. Delete manually in SharePoint if
needed.

---

## Troubleshooting

**`AADSTS700016: Application '<guid>' was not found in the directory`**
→ The Client ID you gave `m365 setup` doesn't exist in your tenant.
Recheck step 5 — make sure you copied the Application (client) ID
from the `skintyeenation-admin-cli` app's Overview page (not Object ID,
not Directory ID). Then `m365 cli config reset --force && m365 setup`.

**`AADSTS65001` or `AADSTS90094` "Consent required"** (during `m365 login`)
→ Step 5's "Grant admin consent for Skin Tyee First Nation" wasn't
clicked. Go back to the `skintyeenation-admin-cli` app's
**API permissions** page and click the Grant admin consent button.

**`Error: appId: appId is required`** (during `m365 login`)
→ You skipped step 6 (`m365 setup`), or your m365 config got reset.
Re-run `m365 setup` per the table in step 6.

**`SyntaxError: ... 'node:util' does not provide an export named 'styleText'`**
→ Node is older than 20.12. `nvm install 22 && nvm use 22 && npm install -g @pnp/cli-microsoft365`.

**`HTTP 403` on apppermission add**
→ The signed-in m365 account isn't a SharePoint Admin / global admin.
Sign in as `admin@skintyeenation.onmicrosoft.com`, not a regular
account.

**Federated-credential creation fails with permission error**
→ Your user lacks the **Application Administrator** (or **Cloud
Application Administrator**) role on Entra. Have a global admin assign
it.

**`HTTP 403` during pipeline run (later)**
→ The site grant from step 7a didn't take. Re-run
`bash scripts/setup-sharepoint-pipeline.sh` — it's idempotent.

---

## Removing the integration

To stop publishing:

1. ADO → **Pipelines → publish-docs-to-sharepoint → ⋮ → Delete pipeline**.
2. ADO → **Project Settings → Service connections → sharepoint-docs-sc → Delete**.
3. Entra → App registrations → `it-project-docs-publisher` →
   **Certificates & secrets → Federated credentials → Delete**.
4. Optionally: delete the SharePoint site and the Entra app entirely.

Published docs in SharePoint persist after teardown (intentional — version history kept).

---

## Background (skip unless curious)

### Two Entra apps, two roles

| | Used by | For |
|---|---|---|
| **`it-project-docs-publisher`** (created in step 2) | The Azure Pipeline | Writes docs to SharePoint. Has `Sites.Selected` Application permission + a federated credential. No secret. |
| **`skintyeenation-admin-cli`** (created in step 5) | You, in your terminal | Admin sign-in to run the grant + setup commands as an admin user. Has `Sites.FullControl.All` Delegated. No secret. |

The two apps never overlap. The pipeline never uses
`skintyeenation-admin-cli`; you never use `it-project-docs-publisher`
interactively.

m365 CLI v11+ has no default sign-in app — every user/tenant must
register their own. (Earlier versions had a Microsoft-published default
that was removed in v11.)

### Why no client_secret

The Azure Pipeline mints a Microsoft Graph token at runtime using
**workload identity federation**: ADO's service-connection identity
is registered as a trusted issuer on the Entra app (step 7b), so the
app issues tokens to anything bearing a valid ADO-signed OIDC
assertion. The Graph API accepts those tokens just like
client_credentials tokens. No long-lived secret exists anywhere.

This is the modern Microsoft-recommended path. The legacy
client_credentials flow (`AZURE_CLIENT_SECRET` env var) is also still
supported by the publisher script for local dev / fallback use — see
`scripts/publish-docs-to-sharepoint.sh` — but in production, the
federated path is the only one used.

### Why `Sites.Selected` (and not `Sites.ReadWrite.All`)

`Sites.Selected` is the least-privilege Graph scope: by itself it
grants no access. You then explicitly authorize the app per-site
(step 7a). Even a fully-compromised app can only touch
`it-project-docs` — nothing else on the tenant.

### Why m365 CLI (and not `az` or PnP PowerShell)

- **`az rest POST .../sites/{id}/permissions`** — would be simplest but
  Microsoft enforces a hard-coded preauthorization gate (AADSTS65002)
  that prevents Azure CLI from requesting `Sites.FullControl.All` on
  Graph. Doesn't work, no workaround.
- **PnP PowerShell `Grant-PnPAzureADAppSitePermission`** — works on
  Windows; cask retired on macOS late 2024, install from npm or
  PowerShell Gallery.
- **m365 CLI `m365 spo site apppermission add`** — works cross-platform.
  Used here.
