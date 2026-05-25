# Publishing `docs/` to SharePoint

The webfront repo's `docs/` tree is **auto-published to SharePoint** on
every push to `master` that touches docs/. Staff get the same content
the developers see, mirrored 1-to-1, with each markdown file rendered
to HTML alongside the source.

This doc covers the one-time Azure / SharePoint setup. The pipeline
itself is `.github/workflows/publish-docs-to-sharepoint.yml` and the
publisher script is `scripts/publish-docs-to-sharepoint.sh` — those
are checked in and need no manual work after the setup below.

## What gets published

For each `.md` in `docs/`:

- `docs/365/entra-id.md`  →  SharePoint `webfront/docs/365/entra-id.md`
- _plus a pandoc-rendered_  →  SharePoint `webfront/docs/365/entra-id.html`

Both files keep the repo's directory structure. SharePoint version
history is enabled by default on Document Libraries, so older versions
are recoverable in case of accidents.

**Deletions are not propagated** — if you remove a doc from the repo,
its SharePoint copy stays. Delete it manually in SharePoint if needed.

## One-time setup (≈30 minutes)

You'll create an Entra ID app, give it write access to **one specific
SharePoint site**, then put its credentials in GitHub Actions secrets.

### 1. Create the SharePoint site + document library

If you don't already have one, create a SharePoint site to hold the
docs:

1. Go to <https://skintyeenation.sharepoint.com/_layouts/15/sharepoint.aspx>
   (or your tenant's SharePoint home).
2. **Create site** → **Team site** → name it e.g. `it-project-docs`.
3. The default `Documents` library is fine; we'll write under a
   `webfront/docs/` folder inside it.

Note down the **site URL** — e.g. `https://skintyeenation.sharepoint.com/sites/it-project-docs`.

### 2. Register the Entra ID app

In the [Entra ID portal](https://entra.microsoft.com) (signed in as
the global admin — see [`entra-id.md`](./entra-id.md) for which
account that is):

1. Click **App registrations** in the left sidebar (it sits alongside
   **Enterprise applications** — two different things; you want the
   first one). Click **+ New registration** at the top.

   _If "App registrations" isn't directly visible, expand
   **Identity → Applications** in the sidebar._
2. Name: `it-project-docs-publisher`.
3. **Supported account types**: *Accounts in this organizational
   directory only* (single tenant).
4. **Redirect URI**: leave blank (we use client_credentials, no
   browser flow).
5. Click **Register**.

On the app's overview page, note down:

- **Application (client) ID** — a GUID
- **Directory (tenant) ID** — a GUID

### 3. Generate a client secret

On the app's **Certificates & secrets** page:

1. **Client secrets** → **New client secret**.
2. Description: `webfront docs publisher`.
3. Expires: 24 months (longest allowed). **Set a calendar reminder
   for rotation 2 months before expiry.**
4. Click **Add**, then **copy the Value column immediately** — it's
   only shown once.

### 4. Grant `Sites.Selected` application permission

On the app's **API permissions** page:

1. **Add a permission** → **Microsoft Graph** → **Application
   permissions** (NOT delegated).
2. Search for `Sites.Selected` and add it.
3. Back on the API permissions page, click **Grant admin consent
   for {tenant}**. The Sites.Selected row should turn green.

> **Why `Sites.Selected`** (and not `Sites.ReadWrite.All`)?
> Sites.Selected is the modern "least-privilege" Graph scope —
> by itself it grants no access. You then explicitly authorize the
> app for **one specific site**. Even if the client secret leaks, the
> app can only touch the it-project-docs site, not your tenant's other
> SharePoint content.

### 5. Authorize the app on the specific site

This step grants the app write access to the one SharePoint site you
created in step 1. It requires a Graph API call you run as a global
admin (or someone with `Sites.FullControl.All` / SharePoint Admin).

> 🤖 **Already automated** — the `scripts/setup-sharepoint-pipeline.sh`
> script does this for you (step 0b inside it) and then continues
> with the four ADO admin tasks. If you're running the full pipeline
> setup anyway, skip this section and run the script instead. The
> steps below are for doing the site-grant **standalone**.

**Easiest path — CLI for Microsoft 365 (`m365`)** — cross-platform
(macOS/Linux/Windows), this is what the automation script uses
internally.

#### a. Install the CLI

```bash
# Needs Node 20.12+. If older: `nvm install 22` first.
npm install -g @pnp/cli-microsoft365
```

#### b. Run `m365 setup` once per machine

m365 CLI v11+ (Jan 2025) removed its built-in default Entra app, so
you have to tell the CLI which app to sign you in as. This is a
**one-time per-machine** step — once done, the config persists in
`~/.config/configstore/cli-m365-config.json` (macOS/Linux) /
`%LOCALAPPDATA%\configstore` (Windows) and applies to every future
`m365` command on this machine.

```bash
m365 setup
```

The wizard asks a few questions. The important ones:

1. **"Do you want to create a new app registration or use an existing
   one?"** → choose **Use an existing app registration**.
2. **Client ID prompt** → paste the public PnP CLI well-known app id:

   ```
   31359c7f-bd7e-475c-86db-fdb8c937548e
   ```

3. **Tenant ID** → leave blank (defaults to `common` — multi-tenant
   sign-in, picks your tenant from the user you log in as).
4. **Other prompts** → press Enter to accept defaults.

> **Where does that GUID come from?** It's the Microsoft-published
> **App ID of the PnP M365 CLI** itself — the multi-tenant app
> registration the PnP community group maintains so the CLI can sign
> users in with delegated permissions. It was hardcoded as the default
> in m365 CLI versions ≤10; v11 made it explicit. Verify by:
>
> - Reading the project's connecting guide:
>   <https://pnp.github.io/cli-microsoft365/user-guide/connecting-microsoft-365/>
> - Pre-checking what your tenant will be consenting to by opening
>   <https://login.microsoftonline.com/skintyeenation.onmicrosoft.com/oauth2/v2.0/authorize?client_id=31359c7f-bd7e-475c-86db-fdb8c937548e&response_type=code&redirect_uri=http%3A%2F%2Flocalhost&scope=openid&prompt=consent> —
>   the consent screen displays the app's actual published name
>   ("PnP Microsoft 365 Management Shell") before you grant anything.
> - After first sign-in, find it under **Entra → Enterprise
>   applications** in your tenant; review or revoke at any time.

> **Why not use `it-project-docs-publisher`'s app id here?** That app
> is configured for **app-only** (client_credentials) auth with
> `Sites.Selected` Application permission. The m365 CLI signs you in
> as a *user* (delegated auth, browser flow), so it needs an app with
> **delegated** scopes and a public-client redirect URI. The PnP CLI
> app has both; `it-project-docs-publisher` has neither. The two apps
> serve different roles in this setup:
>
> - **PnP CLI app** — used **once**, by you the admin, to run the
>   grant command below as your admin identity.
> - **`it-project-docs-publisher`** — the **target** of that grant.
>   The pipeline impersonates this app to write to SharePoint.
>
> If your org's policy forbids consenting to third-party multi-tenant
> apps, register a second Entra app in your tenant called e.g.
> `skintyeenation-admin-cli` with delegated `AllSites.FullControl`,
> a `http://localhost` redirect URI, and "Allow public client flows"
> enabled — then paste *its* client ID at the `m365 setup` prompt.

#### c. Sign in and grant the site permission

```bash
m365 login --authType browser
# Browser opens — sign in as the global admin.

m365 spo site apppermission add \
  --siteUrl https://skintyeenation.sharepoint.com/sites/it-project-docs \
  --appId <application-client-id-of-it-project-docs-publisher> \
  --appDisplayName it-project-docs-publisher \
  --permission write
```

Successful output prints a permission record with `roles: ["write"]`.

**Alternative — PnP PowerShell** (Windows-first admins, or if the
m365 CLI install / Node version hassles aren't worth it):

```powershell
# One-time: install PnP if needed
Install-Module PnP.PowerShell -Scope CurrentUser

# Sign in as the global admin
Connect-PnPOnline -Url https://skintyeenation.sharepoint.com/sites/it-project-docs `
                  -Interactive

# Grant the app write access to this site
Grant-PnPAzureADAppSitePermission `
  -AppId "<application-client-id-from-step-2>" `
  -DisplayName "it-project-docs-publisher" `
  -Site "https://skintyeenation.sharepoint.com/sites/it-project-docs" `
  -Permissions Write
```

> **Why not `az rest`?** It would look like the simplest path:
> `az rest --method POST .../sites/{id}/permissions`. But Microsoft
> enforces a hard-coded first-party preauthorization gate
> (`AADSTS65002`) that prevents the Azure CLI's first-party app from
> requesting `Sites.FullControl.All` on Microsoft Graph — regardless
> of admin consent. The call 403s with no workaround. Use m365 CLI or
> PnP PowerShell.

### 6. Get the SharePoint site ID

The publisher needs the Graph `site-id` (a comma-separated triple,
not a URL):

```bash
TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "scope=https://graph.microsoft.com/.default" \
  -d "grant_type=client_credentials" | jq -r .access_token)

curl -s -H "authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/skintyeenation.sharepoint.com:/sites/it-project-docs" \
  | jq -r .id
```

That prints something like
`skintyeenation.sharepoint.com,11111111-2222-3333-4444-555555555555,66666666-7777-8888-9999-aaaaaaaaaaaa`.
That's the `SHAREPOINT_SITE_ID`.

### 7. Get the drive (document library) name

The publisher targets a single document library by display name.
Usually `Documents` (the default library); confirm:

```bash
curl -s -H "authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/<SITE-ID>/drives" \
  | jq -r '.value[].name'
```

Pick the one you want — typically `Documents`. That's the
`SHAREPOINT_DRIVE_NAME`.

### 8. Add the secrets to GitHub Actions

In the webfront GitHub repo (<https://github.com/skintyeenation/webfront>):

1. **Settings** → **Secrets and variables** → **Actions**.
2. **Repository secrets** → **New repository secret** — add each:

   | Secret name | Value |
   |---|---|
   | `AZURE_TENANT_ID` | Directory (tenant) ID from step 2 |
   | `AZURE_CLIENT_ID` | Application (client) ID from step 2 |
   | `AZURE_CLIENT_SECRET` | Secret value from step 3 |
   | `SHAREPOINT_SITE_ID` | Triple from step 6 |
   | `SHAREPOINT_DRIVE_NAME` | Library name from step 7 (usually `Documents`) |

3. (Optional) **Repository variables** → `SHAREPOINT_TARGET_PATH` —
   subfolder inside the drive to write into. Defaults to
   `webfront` if unset.

### 9. Run it once manually

From the GitHub Actions tab:

1. Pick **Publish docs to SharePoint**.
2. **Run workflow** → **Run workflow** (master branch).
3. Should complete in 2-5 minutes and report something like:

   ```
   ✔ done — rendered 139 .html · uploaded 278 files · failed 0
   ```

Verify in SharePoint that `webfront/docs/` is populated with the
mirrored tree.

## Automatic re-publishing

After step 9 the workflow is live. Any push to `master` that touches:

- `docs/**`
- `scripts/publish-docs-to-sharepoint.sh`
- `.github/workflows/publish-docs-to-sharepoint.yml`

…triggers a re-publish. Concurrency is keyed to `sharepoint-docs` so
two pushes in quick succession queue instead of racing.

## Troubleshooting

**`HTTP 401`** on token acquisition → check `AZURE_CLIENT_SECRET`
hasn't expired; check `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` are right.

**`HTTP 403`** on upload → the app doesn't have permission on this
specific site. Re-run step 5 (PnP `Grant-PnPAzureADAppSitePermission`).

**`drive '<name>' not found on site`** → the publisher script prints
the available drive names. Adjust `SHAREPOINT_DRIVE_NAME` to match.

**`HTTP 404` on the site lookup** → the path
`{hostname}:/sites/{name}` is case-sensitive on some tenants. Match
the URL exactly as it appears in your browser.

## Removing the integration

If you want to stop publishing:

1. Disable the workflow: GitHub → Actions → **Publish docs to
   SharePoint** → **Disable workflow**.
2. Revoke the app's site access: PnP
   `Revoke-PnPAzureADAppSitePermission -PermissionId <id>`.
3. Delete the app registration in Entra ID.

The mirrored docs on SharePoint stay until manually removed (the app's
secret is gone but the files persist).
