# SharePoint pipeline setup — post-mortem of first live run

A history of the gaps discovered during the first end-to-end run of
`scripts/setup-sharepoint-pipeline.sh` against a real tenant, and how
the script now handles each one automatically. Each gap below failed
at least one setup attempt before being scripted.

## Background

The goal was to get `docs/` auto-publishing to SharePoint via an
Azure Pipeline, using workload identity federation (no client_secret).
The setup involves two Entra apps, a SharePoint site grant, three ADO
resources, and a federated identity trust — none of it complicated
individually, but the combination has enough Microsoft-platform
quirks that the first run took multiple tries to land.

The script is now fully automated for fresh tenants. The list below
exists so future maintainers understand *why* the script does what it
does — it's not over-engineering, it's working around real platform
behavior.

## Gaps that became scripted automation

### 1. PnP CLI well-known app id was a fiction

**Symptom.** `m365 setup` insisted on a Client ID. Docs (and prior
knowledge) said to use `31359c7f-bd7e-475c-86db-fdb8c937548e` — the
"PnP M365 CLI public app." That GUID is actually a *placeholder
example* in the PnP CLI docs, not a registered Microsoft application.
Attempting to admin-consent it returned `AADSTS700016: Application
not found in the directory`.

**Root cause.** m365 CLI v11+ removed all built-in default app IDs.
The tool requires every tenant to register its own sign-in app. v10
shipped a default that was retired during the v11 cutover. Stale
internet examples still point at that retired default's GUID.

**Fix.** Script auto-creates `skintyeenation-admin-cli` in the
tenant via `az ad app create --sign-in-audience AzureADMyOrg`,
adds the required Microsoft Graph + SharePoint REST delegated
scopes, grants admin consent, and writes the app id directly into
m365 CLI config via `m365 cli config set` — bypassing `m365 setup`
entirely.

### 2. Two distinct API surfaces, two scope grants needed

**Symptom.** After registering a tenant-local sign-in app with
delegated `Sites.FullControl.All` (Microsoft Graph), `m365 spo`
commands still returned `Error: Access denied`.

**Root cause.** m365 CLI v11 chooses Microsoft Graph or SharePoint
REST per-command based on which Microsoft endpoint backs the
operation. SharePoint REST commands need delegated
`AllSites.FullControl` on the SharePoint Online API resource
(`00000003-0000-0ff1-ce00-000000000000`) — a separate app
registration from Microsoft Graph (`00000003-0000-0000-c000-000000000000`).
The Graph scope alone isn't sufficient.

**Fix.** Script adds delegated scopes on both APIs to the sign-in
app, with a defensive fallback if the SharePoint Online API service
principal isn't queryable on the tenant (some `az` versions hit a
filter quirk for that specific SP — Graph alone covers most needs).

### 3. Delegated vs Application — easy to pick wrong

**Symptom.** Even after adding "Sites.FullControl.All", spo commands
returned Access denied. The Entra UI showed the permission as
**Application**-type (which is for app-only client_credentials
flows), not **Delegated** (which is what user-sign-in flows need).

**Root cause.** Manual portal flow puts Application first in the
search results. Easy to click the wrong one.

**Fix.** Script uses `az ad app permission add ... =Scope` (where
`=Scope` means delegated; `=Role` means application). Resolves the
specific delegated permission ID via `oauth2PermissionScopes` query —
not the application permission IDs in `appRoles`. No human picks
the wrong checkbox.

### 4. ADO REST API needs an explicit `--resource` on `az rest`

**Symptom.** Service connection creation via `az rest --uri https://dev.azure.com/.../endpoints` succeeded silently but the SC didn't appear in ADO. Subsequent steps (variable group, pipeline) ran anyway because they don't validate the SC exists at creation time.

**Root cause.** `az rest` against `dev.azure.com` without
`--resource 499b84ac-1321-427f-aa17-267ca6975798` (the ADO API
resource ID) gets the public sign-in HTML page back rather than an
authorized API response. The script's `--query id -o tsv` parses
empty from the HTML, and the failure mode looks like a successful
no-op.

**Fix.** Every `az rest` call to ADO now passes the resource ID
explicitly. The script also captures full response bodies on creation
calls so it can detect "HTML returned" errors (length-of-response
check) and `die` with the actual problem.

### 5. ADO migrated to a new federated identity model mid-stream

**Symptom.** SC was created successfully, but pipeline runs failed
because the federated credential on the publisher app didn't match
what the SC was actually sending.

**Root cause.** ADO recently migrated workload identity federation
from the legacy issuer `https://vstoken.dev.azure.com` (subject
`sc://{org}/{project}/{name}`) to the modern Entra ID-issued model
(issuer `https://login.microsoftonline.com/{tenant}/v2.0`, subject
`/eid1/c/pub/t/{...}/a/{...}/sc/{sc-guid}`) where the subject is
generated per-service-connection. The old format still works for
preexisting SCs but new SCs use the new format. The federated cred
on the Entra app has to match exactly.

**Fix.** Script creates the SC **first**, reads the actual subject
and issuer from the response, then creates a matching federated
credential. It also auto-deletes any stale federated credentials
with the legacy `sc://...` subject format (leftovers from earlier
script versions). Order matters — the federated cred can't be
pre-created because the subject isn't known until ADO assigns it.

### 6. New ADO resources aren't pipeline-authorized by default

**Symptom.** First pipeline run failed validation with `service
connection sharepoint-docs-sc which could not be found. The service
connection does not exist, has been disabled or has not been
authorized for use.`

**Root cause.** ADO requires explicit per-pipeline authorization for
service connections and variable groups, even when they exist in the
same project. The `--authorize true` flag on `az pipelines
variable-group create` doesn't always take effect. There's no
equivalent flag on the SC REST creation endpoint.

**Fix.** Script PATCHes `/pipelines/pipelinepermissions/endpoint/<sc-id>`
and `.../variablegroup/<vg-id>` to set `allPipelines.authorized = true`
right after each is created. Belt-and-braces with the create-time flag.

### 7. Publisher SP needs Reader role on the subscription

**Symptom.** Pipeline got past validation but the `AzureCLI@2` task
failed at `az account set --subscription <id>` with `subscription
doesn't exist in cloud 'AzureCloud'`.

**Root cause.** The pipeline runs `az login --service-principal
--federated-token <token>` successfully (gets a tenant-level account
for the publisher app), but the `AzureCLI@2` task always follows
with `az account set --subscription <id>` using the subscription ID
configured on the SC. Without **any** role on that subscription
(even Reader), the SP's token has no subscription context — Entra's
response to `az account list` is just the tenant-level account.

**Fix.** Script grants the publisher SP **Reader** role on the active
subscription via `az role assignment create --role Reader --scope
/subscriptions/<id>`. Idempotent — checks for existing assignment.
Warns the user that Reader role takes ~60–90 seconds to propagate to
ARM; the first pipeline run after a fresh setup may fail with the same
error and should be retried once after a minute.

## What's still manual

After all the above is scripted, the **only** manual steps are:

1. Create the SharePoint site (no admin-bypass API for self-service site creation)
2. `az login` (one-time interactive auth bootstrap)
3. The browser popup during `m365 login` (one-time consent, takes 10 seconds)

Everything else — both Entra apps, both apps' permissions and admin
consent, both apps' owner assignments, redirect URI configuration,
m365 CLI install + non-interactive setup, site grant, federated
credential, ADO service connection, variable group, pipeline
registration, pipeline authorization, Reader role assignment — is
inside the script.

## Post-setup checklist

Run through these once after the script completes successfully and
the first pipeline run goes green:

- [ ] Verify the `webfront/` folder appears in SharePoint at
      <https://skintyeenation.sharepoint.com/sites/it-project-docs/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fit-project-docs%2FShared%20Documents%2Fwebfront>
- [ ] Open one or two `.html` files in SharePoint — they should
      render with images intact (broken images = the publisher
      script's asset-upload pass missed something).
- [ ] **Delete any leftover client secrets on `it-project-docs-publisher`.**
      The federated path doesn't need them; any existing ones are
      either leaked or rotation risks. Entra → App registrations →
      `it-project-docs-publisher` → Certificates & secrets → Client
      secrets → trash each row. (Script warns about this on every
      run but doesn't auto-delete in case something else still uses
      them.)
- [ ] Confirm you (the admin) are listed as **Owner** of both
      `it-project-docs-publisher` and `skintyeenation-admin-cli` —
      the script assigns this automatically but worth a sanity check.
      Entra → App registrations → each app → Owners.
- [ ] (Optional) add additional owners — a second admin user, or a
      security group like "App Administrators" — so the apps don't
      become orphans when staff change.
- [ ] (Optional) review who has access to the `it-project-docs`
      SharePoint site itself. The site's permission model is
      separate from the Entra app's site grant; non-admin users who
      should be able to read the published docs need to be added as
      Members.

## What this doc isn't

Not the setup walkthrough — that's
[`../365/sharepoint-docs-publish.md`](../365/sharepoint-docs-publish.md).
This doc is the *why* behind the script, for people who'll maintain
or extend it. The setup doc is the *how* for people running it.
