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

- `docs/365/entra-id.md`  →  SharePoint `webfront-docs/docs/365/entra-id.md`
- _plus a pandoc-rendered_  →  SharePoint `webfront-docs/docs/365/entra-id.html`

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
2. **Create site** → **Team site** → name it e.g. `webfront-docs`.
3. The default `Documents` library is fine; we'll write under a
   `webfront-docs/docs/` folder inside it.

Note down the **site URL** — e.g. `https://skintyeenation.sharepoint.com/sites/webfront-docs`.

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
> app can only touch the webfront-docs site, not your tenant's other
> SharePoint content.

### 5. Authorize the app on the specific site

This step grants the app write access to the one SharePoint site you
created in step 1. It requires a Graph API call you run as a global
admin.

**Easiest path** — using PnP PowerShell:

```powershell
# One-time: install PnP if needed
Install-Module PnP.PowerShell -Scope CurrentUser

# Sign in as the global admin
Connect-PnPOnline -Url https://skintyeenation.sharepoint.com/sites/webfront-docs `
                  -Interactive

# Grant the app write access to this site
Grant-PnPAzureADAppSitePermission `
  -AppId "<application-client-id-from-step-2>" `
  -DisplayName "it-project-docs-publisher" `
  -Site "https://skintyeenation.sharepoint.com/sites/webfront-docs" `
  -Permissions Write
```

**Alternative** — direct Graph call (if you'd rather not install
PnP). See <https://learn.microsoft.com/en-us/graph/api/site-post-permissions>
— `POST /sites/{site-id}/permissions` with body
`{ "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<app-id>", "displayName": "it-project-docs-publisher" } }] }`.

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
  "https://graph.microsoft.com/v1.0/sites/skintyeenation.sharepoint.com:/sites/webfront-docs" \
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
   `webfront-docs` if unset.

### 9. Run it once manually

From the GitHub Actions tab:

1. Pick **Publish docs to SharePoint**.
2. **Run workflow** → **Run workflow** (master branch).
3. Should complete in 2-5 minutes and report something like:

   ```
   ✔ done — rendered 139 .html · uploaded 278 files · failed 0
   ```

Verify in SharePoint that `webfront-docs/docs/` is populated with the
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
