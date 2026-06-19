# `skintyee-app-graph` activation runbook

The step-by-step for activating the **Microsoft Graph reader** the
community app uses to pull Planner tasks + Teams meeting calendar
events into the homescreen feed + Records-page rollup.

Pairs with:
- [`../features/planner-dashboard.md`](../features/planner-dashboard.md) — the *what* and *why* (ADR-14)
- [`../../scripts/setup-app-graph.sh`](../../scripts/setup-app-graph.sh) — the *how* (automation)
- This doc — the *what's left after the script* + the durable runbook for re-runs / rotations

**Expected time:** ~10 minutes of focused work, mostly clicking through
the Entra portal for admin consent. The script does the heavy lifting
in ~30 seconds.

---

## Contents

| Phase | What |
|---|---|
| [0 — Prerequisites](#phase-0--prerequisites) | What you need before starting |
| [1 — Run the script](#phase-1--run-the-script) | `bash scripts/setup-app-graph.sh` |
| [2 — Save secret to 1Password](#phase-2--save-secret-to-1password) | Item structure + field names the api/ expects |
| [3 — Grant admin consent in Entra](#phase-3--grant-admin-consent) | Portal walkthrough + CLI fallback |
| [4 — Re-deploy api-prod + smoke test](#phase-4--re-deploy--smoke-test) | Force the new env vars into the running revision |
| [5 — Rotation procedure](#phase-5--rotation-procedure) | Once every 24 months |
| [Troubleshooting](#troubleshooting) | Common failures + fixes |

---

## Phase 0 — Prerequisites

| # | Item | Check |
|---|---|---|
| 0.1 | Signed into `az` as a tenant **Global Admin** | `az account show --query 'user.name' -o tsv` → should be `admin@skintyeenation.onmicrosoft.com` (the break-glass admin) |
| 0.2 | Correct tenant + subscription active | `az account show --query '{tenantId:tenantId, subId:id}' -o table` → tenant `ee46daed-…`, sub `8d847916-…` |
| 0.3 | `api-prod` Container App exists | `az containerapp show -g skintyee-prod-rg -n api-prod --query name -o tsv` → `api-prod` |
| 0.4 | ADO variable group `skintyee-prod-azure` exists | `az pipelines variable-group list --org https://dev.azure.com/skintyeenation --project devops --query "[?name=='skintyee-prod-azure'].id" -o tsv` → an integer (2) |
| 0.5 | 1Password Business — IT/Admin vault open | (Manual check) |
| 0.6 | Repo cloned locally | `cd ~/Workspaces/skintyee && pwd` |

If any check fails, **fix that first** — the script assumes all six.
Most common gotcha: signed in as the wrong user (Phase 3 admin consent
will silently fail without Global Admin).

---

## Phase 1 — Run the script

### 1.1 Dry-run first (every time, even after Phase 0 passes)

```bash
bash scripts/setup-app-graph.sh --dry-run
```

Walks through every `az` call without executing. Look for:

- ✅ "ensuring Entra app 'skintyee-app-graph' exists"
- ✅ "adding 4 Microsoft Graph application permissions" (Tasks.Read.All,
  Group.Read.All, Calendars.Read, User.Read.All)
- ✅ "granting admin consent (interactive — may open a browser)"
- ✅ "ensuring SP holds 'Privileged Authentication Administrator'" — directory
  role required to reset existing users' passwords (rotate-password); without
  it Graph returns 403 Authorization_RequestDenied
- ✅ "creating client secret (24-month expiry)"
- ✅ "writing credentials into api-prod Container App secrets"
- ✅ "updating ADO variable group 'skintyee-prod-azure' with non-secret fields"

If anything looks wrong, fix and re-run; nothing has happened in Azure yet.

### 1.2 Real run

Choose ONE of two modes:

**Mode A — interactive solo terminal** (you'll see the secret value on screen):

```bash
bash scripts/setup-app-graph.sh
```

**Mode B — observed terminal / AI-mediated session / shared screen** (secret
goes to a 600-perm file, NOT stdout):

```bash
bash scripts/setup-app-graph.sh --secret-to-file ~/Desktop/app-graph-secret.json
```

The script runs through:

1. Create Entra app `skintyee-app-graph` (~3 sec)
2. Add 4 application permissions (~5 sec)
3. Attempt admin consent (often fails via CLI — you'll do it in Phase 3)
4. Mint 24-month client secret (~2 sec)
5. Wire `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` / `GRAPH_TENANT_ID` into the api-prod Container App as encrypted secrets bound to env vars (~5 sec)
6. Add `GRAPH_APP_ID` / `GRAPH_TENANT_ID` / `GRAPH_APP_DISPLAY` to the ADO variable group (non-secret) (~3 sec)
7. Print the summary

Total: ~30 seconds.

> **You will likely see a warning:** `"couldn't grant admin consent (do
> it manually in the Entra portal...)"`. That's expected — the CLI
> grant requires specific token scopes that often aren't present. Phase
> 3 handles it.

### 1.3 Note the values printed

In Mode A, the summary prints the secret value to stdout. Have your
1Password app open and ready to paste; the secret won't be shown again
(the script doesn't keep a copy).

In Mode B, the values land in the file you specified, mode 600 (owner
read/write only). You'll read it in Phase 2.

---

## Phase 2 — Save secret to 1Password

The api/ reads credentials via env vars (`GRAPH_CLIENT_ID`,
`GRAPH_CLIENT_SECRET`, `GRAPH_TENANT_ID`) that are wired from
Container App secrets. **But 1Password is the durable source of
truth** — the Container App secrets are operational; 1Password is what
survives a Container App rebuild.

### 2.1 Create the item in 1Password

| Item field | Value |
|---|---|
| **Vault** | IT/Admin |
| **Item type** | API Credential (or Secure Note) |
| **Item name** | `skintyee-app-graph` |

### 2.2 Fields

| Field name | Type | Value | Notes |
|---|---|---|---|
| `tenantId` | text | (from script output) | The skintyeenation tenant GUID |
| `appId` | text | (from script output) | The Entra app's clientId / appId |
| `clientSecret` | password (hidden) | (from script output) | The actual secret — the credential the api/ uses to call Graph |
| `expires` | text | (from script output) | ISO 8601 date — set a 1Password reminder for 30 days before this |
| `keyId` | text | (from `az ad app credential list`) | Useful for revoking a specific credential later |
| `purpose` | text | "Community app's Microsoft Graph reader — Planner + Teams meeting calendar; ADR-14" | Future-you trying to remember what this is |

### 2.3 Set a rotation reminder

In 1Password:
1. Open the `skintyee-app-graph` item
2. Add a tag `rotates`
3. Set a custom reminder for **23 months** from issuance — gives a
   1-month window before expiry to rotate without downtime

### 2.4 Verify the item is readable

The cleanest verification is to use 1Password CLI (mirrors how the
script would read it for automation):

```bash
op item get skintyee-app-graph --vault IT-Admin --field clientSecret
# Should print the secret value
```

If you don't have op CLI installed, just confirm the item shows in the
1Password GUI under IT/Admin.

### 2.5 Delete the temp file (Mode B only)

If you used `--secret-to-file`:

```bash
rm ~/Desktop/app-graph-secret.json
```

Verify:

```bash
ls ~/Desktop/app-graph-secret.json 2>/dev/null && echo "STILL THERE" || echo "✓ gone"
```

---

## Phase 3 — Grant admin consent

The 4 Graph permissions exist on the Entra app but are **not yet
granted**. Without admin consent, the api/'s token requests will
succeed but Graph API calls return 403.

### 3.1 Portal walkthrough (most reliable)

1. Open <https://entra.microsoft.com>
2. Sign in as `admin@skintyeenation.onmicrosoft.com` (the break-glass
   Global Admin)
3. Left menu → **Identity** → **Applications** → **App registrations**
4. Click the **`skintyee-app-graph`** row (or the **All applications**
   tab if you don't see it under Owned)
5. Left menu → **API permissions**
6. You should see 4 rows under "Configured permissions":
   - `Tasks.Read.All` — Application
   - `Group.Read.All` — Application
   - `Calendars.Read` — Application
   - `User.Read.All` — Application

   Each row's **Status** column should say "**Not granted for
   skintyeenation**" (with an orange warning icon).

7. Above the list, click the button **"Grant admin consent for
   skintyeenation"**
8. A confirmation dialog appears: **"Do you want to grant consent for
   the requested permissions for all accounts in skintyeenation?"**
   → click **Yes**
9. The Status column for all 4 rows flips to "**Granted for
   skintyeenation**" with a green checkmark ✓

### 3.2 CLI fallback

If the portal button is greyed out OR you're already signed in as the
right user via CLI:

```bash
az ad app permission admin-consent \
  --id d6b7e4fc-5714-438a-8d30-11ef8efeca3a
# (Use your appId; this is the one from the Skin Tyee tenant.)
```

The CLI version often fails with `Insufficient privileges` even when
the calling user IS Global Admin — usually a token-cache issue. If it
fails, just use the portal flow above.

### 3.3 Verify

After granting:

```bash
az ad app permission list --id d6b7e4fc-5714-438a-8d30-11ef8efeca3a \
  --query '[].{resource:resourceDisplayName, scopes:resourceAccess[].id}' -o table
```

Should show 4 entries against `Microsoft Graph` (one per permission).

For the consent state specifically:

```bash
az ad sp show --id $(az ad sp list --filter "appId eq 'd6b7e4fc-5714-438a-8d30-11ef8efeca3a'" --query '[0].id' -o tsv) \
  --query 'appRoleAssignmentRequired'
# false expected (means consent is given; admin granted the permissions)
```

Or just hit a Graph endpoint as the app (Phase 4's smoke test will do
this).

---

## Phase 4 — Re-deploy + smoke test

### 4.1 Why a re-deploy is needed

`setup-app-graph.sh` set 3 secrets on the Container App and bound them
to env vars. But the **currently-running revision** doesn't have those
env vars yet — they're applied on the next revision spawn.

### 4.2 Force a new revision (no code change required)

```bash
# Find the current revision name
CURRENT=$(az containerapp show -g skintyee-prod-rg -n api-prod \
  --query properties.latestRevisionName -o tsv)
echo "Current: $CURRENT"

# Restart it — Container Apps creates a new revision with the latest config
az containerapp revision restart \
  --resource-group skintyee-prod-rg \
  --name api-prod \
  --revision "$CURRENT"

# Or: trigger a fresh deploy by pushing an api/ change (path-trigger fires)
# This is cleaner long-term but takes ~2 min for the pipeline
```

Wait ~30 seconds for the new revision to come up, then verify:

```bash
az containerapp revision list \
  -g skintyee-prod-rg -n api-prod \
  --query 'reverse(sort_by([], &properties.createdTime))[0:2].{name:name, active:properties.active, state:properties.runningState, created:properties.createdTime}' \
  -o table
```

The new revision should be Active + Running.

### 4.3 Smoke test the new endpoints

The api/'s existing endpoints stay working throughout (no change). The
new endpoints (`/v1/planner/*`, `/v1/feed`) start working after Phase 3
+ 4.2 complete.

```bash
# Health endpoint — confirms the api is up
curl -sL --max-time 10 https://api.skintyee.ca/v1/health
# {"status":"ok","uptime":...}

# Planner plans — confirms the Graph integration works
curl -sL --max-time 15 https://api.skintyee.ca/v1/planner/plans \
  -H "x-role: admin" | head -c 800
# Should return a JSON array of plans visible to skintyee-app-graph
# Format: [{"id":"...", "title":"Housing", "groupName":"...", "taskCount":N, ...}]

# The unified homescreen feed
curl -sL --max-time 15 "https://api.skintyee.ca/v1/feed?from=2026-06-01" \
  -H "x-role: admin" | head -c 800
# JSON array of FeedItem: app-events + Planner-due-dates + (Teams meetings if x-upn header given)
```

### 4.4 Expected outcomes

| Result | What it means |
|---|---|
| HTTP 200 + JSON array | ✅ Everything works |
| HTTP 500 + "GRAPH_TENANT_ID ... not set" | Container App env vars didn't propagate — check Phase 4.2 ran cleanly |
| HTTP 500 + "Graph token acquisition failed" | Client secret invalid (typo?) or app deleted from Entra |
| HTTP 500 + "Graph /groups → 403" | **Admin consent not granted** — Phase 3 wasn't completed; go back |
| HTTP 200 + empty `[]` | Tenant has no M365 Groups with Planner plans yet — create a plan in Teams/Planner web and re-try |
| HTTP 403 from api/ itself | Forgot the `x-role: admin` header (or your test caller doesn't have the role) |

---

## Phase 5 — Rotation procedure

Run this **30 days before** the `expires` date in 1Password (or anytime
sooner if you suspect compromise).

### 5.1 Rotate

```bash
bash scripts/setup-app-graph.sh --rotate-secret \
  --secret-to-file ~/Desktop/app-graph-secret-$(date +%Y%m%d).json
```

This:
- Mints a NEW client secret
- **Revokes ALL existing secrets** on the app (so any leaked old value
  is dead the instant this runs)
- Writes the new value to the file (mode 600)
- Re-wires the Container App secret + env var to the new value

### 5.2 Update 1Password

Open the `skintyee-app-graph` item in 1Password:
- Update `clientSecret` and `expires` fields
- The `appId` and `tenantId` do NOT change on rotation
- Add a note: "Rotated YYYY-MM-DD; previous secret revoked"

### 5.3 Re-deploy api-prod

Same as Phase 4.2 — restart the latest revision so the env var picks
up the new secret value:

```bash
az containerapp revision restart \
  -g skintyee-prod-rg -n api-prod \
  --revision $(az containerapp show -g skintyee-prod-rg -n api-prod --query properties.latestRevisionName -o tsv)
```

### 5.4 Delete the local secret file

```bash
rm ~/Desktop/app-graph-secret-$(date +%Y%m%d).json
```

### 5.5 Smoke test

Repeat Phase 4.3. The endpoints should keep working — if any return
401/403 unexpectedly, the new secret didn't propagate; restart again
or check the Container App secret value:

```bash
az containerapp secret list -g skintyee-prod-rg -n api-prod
# graph-client-secret should be listed (value masked)
```

---

## Troubleshooting

### Common failures and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `setup-app-graph.sh` fails: "Insufficient privileges to create app" | Signed into az as a non-admin | `az logout && az login` as `admin@skintyeenation.onmicrosoft.com` |
| `setup-app-graph.sh` fails at `az containerapp secret set` | api-prod Container App doesn't exist yet | Run `scripts/setup-api-azure.sh` first |
| Admin consent button is greyed out in Entra portal | Signed into portal as a non-admin OR break-glass admin doesn't "own" the app | The app being unowned by your signed-in user is OK — the **All applications** tab (not "Owned applications") still shows it, and Grant admin consent still works from there |
| Portal error: `"application 00000003-0000-0000-c000-000000000046 does not exist"` | **Wrong Microsoft Graph appId** — the real one ends in `...000000000000` (all zeros). The `...046` is some other Microsoft app (or a typo'd appId for a partial/legacy SP). | Fixed in `setup-app-graph.sh` — `GRAPH_RESOURCE_ID="00000003-0000-0000-c000-000000000000"`. If you already ran the script with the wrong value, delete the bogus SP: `az rest --method DELETE --uri "https://graph.microsoft.com/v1.0/servicePrincipals/<bogus-sp-id>"`, then re-run the script. |
| Portal error: `"application 00000003-0000-0000-c000-000000000000 does not exist"` (correct appId, but still missing) | Tenant has never had a Microsoft Graph SP provisioned (rare; new sandbox tenants) | The script's Phase 0 pre-flight creates the SP via `az rest POST /servicePrincipals` with an **explicit** `displayName: "Microsoft Graph"` body — `az ad sp create --id` (with no displayName) fails on this path. After creation, wait ~60 seconds for the appRoles catalog to populate (script does this automatically). |
| Portal error: `"Permission being assigned was not found on application"` | The permission GUID you're trying to grant isn't an `appRole` on the Microsoft Graph SP. Almost always the cause: using the **delegated** permission GUID instead of the **application** permission GUID — they're different. | Look up the correct application-permission GUID via: `az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals/<graph-sp-id>?\$select=appRoles" --query "appRoles[?value=='Tasks.Read.All' && contains(allowedMemberTypes,'Application')].id" -o tsv`. Update the script's `PERMS` array with the correct GUIDs. Example we hit: Tasks.Read.All — delegated `2c6a42ca-...` was wrong; application `f10e1f91-...` was right. |
| Portal error: `"Grant consent failed with error: Dynamic scope is invalid"` | Same root cause as above — the resource appId in the app's `requiredResourceAccess` doesn't match a real SP in the tenant | Same fix |
| 4 permissions listed in `App registrations → API permissions` show only their raw GUIDs, not friendly names (Tasks.Read.All, etc.) | The portal is looking up the resource by appId and can't find one with these appRoles | Confirms the wrong appId / Microsoft Graph SP issue — apply the fixes above |
| `az ad app permission admin-consent` fails: empty error `"Consent validation failed:"` | Known flakiness in the CLI command. Often happens even when the user IS the Global Admin. | Two fallbacks: (a) Entra portal **Grant admin consent** button (most reliable), OR (b) grant each permission directly via the Graph API — see § "Manual admin consent via Graph API" below. |
| Pipeline `deploy-api` fails: `"ContainerAppOperationInProgress"` race condition | The `setup-app-graph.sh` script and the deploy-api pipeline ran simultaneously — both tried to modify the Container App and Azure serialized them | Re-trigger `az pipelines run --name deploy-api --branch master`; the image was already built + pushed by ACR, just couldn't be applied to the Container App. |
| All 4 endpoints (`/v1/planner/*`) return 403 from Graph | Admin consent not granted, OR granted for wrong tenant | Re-check Phase 3 in the Entra portal — Status column should say "Granted for skintyeenation" on all 4 rows |
| Endpoints return 500: "Graph /me/... → 401" | Token acquisition succeeded but Graph rejects | Almost always admin consent — see above |
| Endpoints return 500: "Graph /groups → 403 Authorization_RequestDenied" | Permissions registered against the wrong resource appId (this is what we hit; see the appId-typo row above) | Re-verify each permission shows up under `az rest GET /servicePrincipals/<app-sp-id>/appRoleAssignments` AND that `resourceId` matches the REAL Microsoft Graph SP id |
| Endpoints return 200 but empty `[]` everywhere | Tenant has no Planner plans yet OR the Entra app can't see them | Create a plan in Teams/Planner, then re-test. If still empty, the app's Group.Read.All consent likely didn't grant — re-check Phase 3 |
| `op item get skintyee-app-graph` returns nothing | Item is in a different vault, or 1Password CLI not signed in | `op vault list` to confirm; `op signin` if not signed in |
| 1Password CLI says "not authorized to access vault IT-Admin" | Your user account doesn't have access to IT-Admin vault | Ask the 1Password admin to grant access OR use the GUI |
| `--secret-to-file` writes a 0-byte file | The rotation failed but the file got created empty | Re-run; the script's `mv` step would have failed — inspect the script output for the actual error |

### Manual admin consent via Graph API (when CLI + portal both fail)

If both `az ad app permission admin-consent` AND the Entra portal's
"Grant admin consent" button fail, you can grant each permission
directly by creating an `appRoleAssignment` on the app's SP. This is
exactly what admin consent does under the hood.

```bash
APP_SP_ID=$(az ad sp list --filter "appId eq 'd6b7e4fc-5714-438a-8d30-11ef8efeca3a'" --query '[0].id' -o tsv)
GRAPH_SP_ID=$(az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000000'" --query '[0].id' -o tsv)

# Tasks.Read.All
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${APP_SP_ID}/appRoleAssignments" \
  --body "{\"principalId\":\"${APP_SP_ID}\",\"resourceId\":\"${GRAPH_SP_ID}\",\"appRoleId\":\"f10e1f91-74ed-437f-a6fd-d6ae88e26c1f\"}"

# Group.Read.All
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${APP_SP_ID}/appRoleAssignments" \
  --body "{\"principalId\":\"${APP_SP_ID}\",\"resourceId\":\"${GRAPH_SP_ID}\",\"appRoleId\":\"5b567255-7703-4780-807c-7be8301ae99b\"}"

# Calendars.Read
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${APP_SP_ID}/appRoleAssignments" \
  --body "{\"principalId\":\"${APP_SP_ID}\",\"resourceId\":\"${GRAPH_SP_ID}\",\"appRoleId\":\"798ee544-9d2d-430c-a058-570e29e34338\"}"

# User.Read.All
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${APP_SP_ID}/appRoleAssignments" \
  --body "{\"principalId\":\"${APP_SP_ID}\",\"resourceId\":\"${GRAPH_SP_ID}\",\"appRoleId\":\"df021288-bdef-4463-88db-98f22de89214\"}"
```

Each returns a JSON with `createdDateTime` on success; or
`"Permission being assigned was not found on application"` if the
appRoleId is wrong (see the troubleshooting row above for how to find
the correct one).

### Look-up: actual permission GUIDs in our tenant

Confirmed working values, application-permission flavor on Microsoft
Graph (the well-known appId `00000003-0000-0000-c000-000000000000`):

| Permission | App-permission GUID |
|---|---|
| `Tasks.Read.All` | `f10e1f91-74ed-437f-a6fd-d6ae88e26c1f` |
| `Group.Read.All` | `5b567255-7703-4780-807c-7be8301ae99b` |
| `Calendars.Read` | `798ee544-9d2d-430c-a058-570e29e34338` |
| `User.Read.All` | `df021288-bdef-4463-88db-98f22de89214` |

If you ever need to verify or look up additional permissions:

```bash
GRAPH_SP=$(az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000000'" --query '[0].id' -o tsv)
az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${GRAPH_SP}?\$select=appRoles" \
  --query "appRoles[?value=='<PERMISSION_NAME>' && contains(allowedMemberTypes,'Application')].{name:value, id:id}" -o table
```

---

## See also

- [`../features/planner-dashboard.md`](../features/planner-dashboard.md) — design + ADR-14
- [`../architecture-decisions.md`](../architecture-decisions.md#adr-14--homescreen-feed-microsoft-graph-planner--teams-meetings-merged-with-app-data-via-app-only-auth) — ADR-14
- [`../365/entra-usage.md`](../365/entra-usage.md) — inventory of all Entra apps (this one is in the table)
- [`../../scripts/setup-app-graph.sh`](../../scripts/setup-app-graph.sh) — the script
- [`../../api/src/graph-feed.service.ts`](../../api/src/graph-feed.service.ts) — the NestJS Graph reader
- [`./backup-setup-runbook.md`](./backup-setup-runbook.md) — same-shaped runbook for the M365 backup pipeline (the original of this pattern)
- [Microsoft: Grant admin consent in Entra portal](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent)
- [Microsoft: Manage app registration credentials](https://learn.microsoft.com/en-us/entra/identity-platform/howto-create-service-principal-portal)
