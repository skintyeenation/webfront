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
