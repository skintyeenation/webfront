# Vaultwarden ↔ Entra ID sync (plan — not implemented)

How to wire Vaultwarden to Microsoft Entra ID. **Two independent layers** — do
them in this order (sync first, SSO later). Both are **deferred** per ADR-18
(Vaultwarden starts invite-only); this is the runbook for when we turn them on.

| Layer | What it does | Tool | Risk |
|---|---|---|---|
| **1. Directory sync** | Auto-create members + mirror Entra security groups → Vaultwarden Groups → Collection access | Bitwarden **Directory Connector** (`bwdc`) | low — recommended first |
| **2. SSO** | Staff log in with their skintyee.ca identity | Vaultwarden **OIDC** | higher — Vaultwarden SSO is experimental |

> Zero-knowledge reminder: **neither layer removes the master password.** SSO
> authenticates the *login*; the vault is still decrypted with a key derived from
> each user's master password. Removing it needs trusted-device/Key Connector
> (enterprise; not viable on Vaultwarden). So: Entra controls *who gets in*,
> master password controls *decryption*.

---

## Layer 1 — Directory sync (provisioning)

Mirrors Entra into the Vaultwarden org so membership tracks the directory: a
hire added to an Entra security group is auto-invited and lands in the right
Vaultwarden Groups → Collections; an offboard in Entra removes them.

**Pieces:**
- **Graph app** (source): an Entra app with **`Directory.Read.All`** +
  **`Group.Read.All`** (application) — same pattern as `scripts/setup-app-graph.sh`
  / `skintyee-app-graph`. Tenant `ee46daed-e89f-4438-b1f7-dc26203a4bec`.
- **Org API key** (destination): generate in Vaultwarden → Organization →
  Settings → **Keys / API Key** (`client_id` + `client_secret`).
- **Bitwarden Directory Connector** (`bwdc` CLI), configured:
  - Source = **Azure Active Directory**: tenant id, application id, the Graph
    secret/key.
  - Destination = self-hosted: server `https://vault.skintyee.ca`, org API key.
  - Sync settings: **sync groups + users**, with a group/user **filter** scoping
    it to the band's security groups (don't sync the whole tenant).
  - Run headless: `bwdc config server …`, `bwdc login --apikey`, `bwdc sync`.

**Where it runs:** package `bwdc` in a container as a **scheduled Azure Container
Apps Job** (cron, e.g. hourly) in `skintyee-prod-rg` — mirrors the
deploy/cron pattern; creds from Container App secrets / the variable group.

**Scaffold (in this repo):** [`directory-connector/Dockerfile`](directory-connector/Dockerfile)
+ [`directory-connector/sync.sh`](directory-connector/sync.sh) +
[`../azure-pipelines/Deployments/deploy-directory-connector.yml`](../azure-pipelines/Deployments/deploy-directory-connector.yml)
(builds the image, creates the scheduled `vaultwarden-dirsync` job). **Prereqs:**
the org + **org API key** from [`org-setup.md`](org-setup.md), a Graph app
(`Directory.Read.All`), and a seeded bwdc `data.json` on the job's Files volume.
All deferred — verify `bwdc` config on first run.

**Group → Collection mapping** (manage Collections once; sync keeps Group
*membership* current). Mirror the security-group catalog
(`docs/365/groups.md` / `app/src/.../skintyee-groups.ts`):

| Entra security group | Vaultwarden Group | Collections it can access |
|---|---|---|
| IT / admins | IT | IT, Infrastructure |
| Finance | Finance | Finance |
| Council | Council | Council |
| Band office / staff | Band Office | Band Office |
| _(…the 13 catalog groups)_ | _(1:1)_ | _(scoped)_ |

**Caveat:** Vaultwarden implements only a **subset** of the org public API that
Directory Connector drives — members + groups sync in practice, but test each
sync mode against the deployed version; some advanced fields may no-op.

---

## Layer 2 — OIDC SSO

Register an Entra app (Web/OIDC, redirect URI `https://vault.skintyee.ca`,
ID-token + the `openid profile email` scopes), then set on the Vaultwarden
Container App:

```
SSO_ENABLED=true
SSO_AUTHORITY=https://login.microsoftonline.com/ee46daed-e89f-4438-b1f7-dc26203a4bec/v2.0
SSO_CLIENT_ID=<entra app id>
SSO_CLIENT_SECRET=secretref:sso-client-secret
SSO_SCOPES=email profile openid
```
(Set `sso-client-secret` as a Container App secret; add these via
`deploy-vaultwarden.yml`. **Verify the exact `SSO_*` variable set against the
Vaultwarden SSO docs for the deployed version** — the feature is experimental and
the env surface has changed across releases.)

Staff then pick **Enterprise SSO** on the login screen → authenticate via Entra
(your MFA + Conditional Access) → enter their master password to decrypt.

**Status:** experimental in Vaultwarden — pilot with one account before rollout;
keep invite-only + master-password as the fallback.

---

## Rollout order

1. **Now:** invite-only + master password (current state).
2. **Phase A:** stand up Directory Connector as a scheduled ACA Job → members +
   groups auto-sync from Entra. Manual master passwords still.
3. **Phase B:** enable OIDC SSO once piloted → staff sign in with skintyee.ca.

## See also
- [`README.md`](README.md) — the deployed Vaultwarden + its API surfaces.
- [`../docs/architecture-decisions.md`](../docs/architecture-decisions.md) — ADR-18.
- `scripts/setup-app-graph.sh` — the Graph-app pattern to copy for the
  Directory.Read.All app.
- `docs/365/groups.md` — the security-group catalog the mapping mirrors.
