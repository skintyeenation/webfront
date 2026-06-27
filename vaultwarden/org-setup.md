# Skin Tyee org setup (Vaultwarden) — human runbook

The organization **must be created by a human** in the web vault. Vaultwarden is
**zero-knowledge**: the org's encryption key is generated client-side and wrapped
by the **owner's master password**, so no admin token / API / script can create
it (by design — ADR-18). Once the org exists, the structure (collections, groups,
access) can be scripted — [`setup-org.sh`](setup-org.sh) — or built in the UI
using the tables below.

## Step 1 — Owner account (human)

1. Go to **`https://vault.skintyee.ca`** → create account with a dedicated owner
   address, e.g. **`it@skintyee.ca`** (a shared/role mailbox, not a person), and
   a **strong master password**. Store that master password in the IT/Admin
   break-glass location (NOT git).
2. (Optional but recommended) enable 2FA on the owner account.

## Step 2 — Create the organization (human)

Web vault → **New organization** → name **`Skin Tyee First Nation`**. (Vaultwarden
unlocks org/enterprise features for free, so Groups will be available.)

## Step 3 — Generate the org API key (human)

Organization → **Settings → Keys → API Key** → copy `client_id` + `client_secret`.
Needed for `setup-org.sh` and the Directory Connector (ADR-19). Store as secrets:
ADO variable group `skintyee-prod-azure` → `BWDC_CLIENTID` / `BWDC_CLIENTSECRET`.

## Step 4 — Collections (shared vaults)

Create these Collections (Organization → Collections → +). Mirrors the
department catalog (`docs/365/groups.md` / `api/src/skintyee-groups.ts`):

| Collection | For |
|---|---|
| IT & Infrastructure | servers, network, UniFi, Azure, domains, service accounts |
| Finance | banking, payroll/Sage, finance vendor logins |
| Council & Chief | governance accounts |
| Band Management | band-manager / management shared logins |
| Housing | housing dept |
| Forestry | forestry dept |
| Land Resources | land resources dept |
| GIS / Mapping | GIS tooling |
| Fire & Emergency | fire/emergency accounts |
| Band Office (general) | shared front-office logins (Wi-Fi, general) |

## Step 5 — Groups + access (mirror Entra security groups)

Create Groups named to match the Entra security groups (so the Directory
Connector can map them later, ADR-19), and grant each its Collection(s):

| Group (Entra slug) | Collections granted |
|---|---|
| `it` | IT & Infrastructure |
| `system-admin` | **all** (break-glass) |
| `admins` | IT & Infrastructure |
| `finance` | Finance |
| `council`, `chief` | Council & Chief |
| `band-manager`, `management` | Band Management, Band Office (general) |
| `housing` | Housing |
| `forestry` | Forestry |
| `land-resources` | Land Resources |
| `gis` | GIS / Mapping |
| `fire-chief` | Fire & Emergency |
| `staff`, `band-members` | Band Office (general) |
| `contractors` | _(none by default — grant per-engagement only)_ |

## Step 6 — People

- **Now (manual):** Organization → Members → **Invite** each staff member by
  their `@skintyee.ca` email, assign to Groups. (No SMTP yet → share the invite
  link directly, or wire SMTP — see README.)
- **Later (ADR-19 Phase A):** the Directory Connector job auto-invites + maps
  groups from Entra; this manual step goes away.

## Scripted shortcut

After Steps 1–3 (the human bootstrap), run [`setup-org.sh`](setup-org.sh) to
create Steps 4–5 (collections + groups + access) from the tables above instead of
clicking — it uses the `bw` CLI (collections, as the owner) + the org public API
(groups + access). See its header for the required session / API-key inputs.

## Bootstrap gotchas (hit during first standup)

- **No "Create account" button** → the deploy sets **`SIGNUPS_ALLOWED=false`**
  (invite-only), so the *first* owner can't self-register. Temporarily enable it
  to bootstrap, then re-lock:
  ```bash
  az containerapp update -g skintyee-prod-rg -n vaultwarden --set-env-vars SIGNUPS_ALLOWED=true -o none
  # …register the owner + create the org…
  ```
- **No "New organization" button** → the `ORG_CREATION_USERS` gotcha. Vaultwarden
  reads it as a **literal email allowlist**: **blank = everyone (default)**,
  `none` = nobody, otherwise a comma-separated list of *emails*. Do **NOT** set it
  to `all` — that means "only a user whose email is `all`", i.e. nobody, which
  *disables* org creation. **Leave it unset.** Direct URL if the UI button is
  hidden: **`https://vault.skintyee.ca/#/create-organization`**.
- **Re-lock signups when done** → run the **`deploy-vaultwarden`** pipeline (it
  sets `SIGNUPS_ALLOWED=false`), or flip it back with `az … --set-env-vars
  SIGNUPS_ALLOWED=false`.

## Operational model (setup script vs pipelines)

Mirrors `deploy-api`: **one-time create is a script; ongoing changes are a
pipeline.**

- **Create once (manual):** [`setup-vaultwarden.sh`](setup-vaultwarden.sh) —
  db, storage/Files, Container App, secrets, domain. Not a pipeline (provisions
  resources + needs the pg secret + DNS).
- **Ongoing (Azure DevOps):**
  - **`deploy-vaultwarden`** (pipeline **#8**) — image bumps + secret/env sync
    (incl. enforcing `SIGNUPS_ALLOWED=false`). Run this for every config change.
  - **`deploy-directory-connector`** (pipeline **#9**, deferred) — builds bwdc +
    the scheduled Entra→org sync job (ADR-19 Phase A).
- So after the human bootstrap, **don't hand-edit the Container App** — change the
  `deploy-vaultwarden` env/secrets (variable group) and re-run it, so prod stays
  reproducible.
