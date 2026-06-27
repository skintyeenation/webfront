# Vaultwarden — shared password manager (self-hosted)

Team password sharing for Skin Tyee staff: a self-hosted, **Bitwarden-compatible**
server. Staff use the **official Bitwarden clients** (iOS / Android / Windows /
macOS / Linux / browser / CLI) pointed at this server; sharing is via Bitwarden
**Organizations → Collections**. Decision + rationale (changed from 1Password
Teams): **ADR-18** in [`docs/architecture-decisions.md`](../docs/architecture-decisions.md).

> **Use it for the *residual* shared secrets** (vendor logins, service accounts,
> Wi-Fi, legacy systems with no SSO). First preference is still *not* sharing —
> Entra groups, SSO, shared-mailbox FullAccess (`docs/365/shared-mailboxes.md`).

## Why this shape

- **Zero-knowledge:** the Bitwarden clients encrypt client-side; Vaultwarden only
  ever stores ciphertext. (A Key-Vault-backed in-app feature would be
  server-trusted — readable by the API/admins. See ADR-18.)
- **No VM, no LAN box.** It's just a public HTTPS service — no line-of-sight to
  the office LAN (unlike Guacamole). Vaultwarden supports **Postgres**, so unlike
  OpenSign (ADR-17, VM-bound by MongoDB) it runs cleanly on **Azure Container
  Apps**.
- **No app to build/distribute.** Staff install Bitwarden from their OS store and
  set the server URL — every platform covered.

## Clients (all official Bitwarden, free)

| Platform | Source | Notes |
|---|---|---|
| iOS / iPadOS | App Store | system autofill |
| Android | Google Play | system autofill |
| Windows | Store / `.exe` | Windows Hello unlock |
| macOS | App Store / `.dmg` | Touch ID unlock |
| Linux | AppImage / Snap / deb | |
| Browser | Chrome/Edge/Firefox/Safari/Brave extension | inline autofill |
| CLI | `bw` | scripting |

Setup on each: on the login screen → **Settings / Self-hosted** → server URL
`https://vault.skintyee.ca` → then log in.

## Topology

```
 Bitwarden client ──HTTPS/443──▶ Container App (vaultwarden/server)
                                   ├─ Postgres  → skintyee-prod-pg (db: vaultwarden)   [vault data]
                                   └─ /data     → Azure Files mount                    [RSA JWT keys,
                                                                                        attachments, Sends,
                                                                                        icon cache, config.json]
```

- **Vault data → Postgres** (reuse `skintyee-prod-pg`): avoids the SQLite/Mongo-
  on-SMB corruption risk (the reason ADR-17 needed a VM).
- **`/data` → Azure Files**: only non-DB files — but **required** (the RSA key
  signs JWTs; losing it logs everyone out, and attachments/Sends live here).

## One-time setup

Scripted + idempotent — run [`setup-vaultwarden.sh`](setup-vaultwarden.sh):

```bash
cd vaultwarden
PG_PASSWORD='<skintyee-prod-pg admin password>' ./setup-vaultwarden.sh
#   --dry-run      print the az commands without running them
#   --skip-domain  skip the vault.skintyee.ca hostname add/bind
```

It ensures, in order: the **`vaultwarden` Postgres db**, a **Storage account +
Azure Files share** for `/data` registered on the managed environment, the
**Container App** (from [`containerapp.yaml`](containerapp.yaml)), its **secrets**
(`DATABASE_URL` → the vaultwarden db, a generated `ADMIN_TOKEN`), and the
**`vault.skintyee.ca`** hostname (it prints the CNAME/TXT to create, then binds
when DNS resolves). It echoes the `ADMIN_TOKEN` once — save it.

After it runs:
1. Put that `ADMIN_TOKEN` into the ADO variable group **`skintyee-prod-azure`** as
   **`VW_ADMIN_TOKEN`** (secret) so `deploy-vaultwarden` can re-apply it.
2. Open `https://vault.skintyee.ca/admin` → create the **org + collections**,
   invite staff (open signups are off).
3. All future image bumps / secret syncs: run the **`deploy-vaultwarden`** pipeline.

Key env (set in `containerapp.yaml`): `DOMAIN=https://vault.skintyee.ca`,
`SIGNUPS_ALLOWED=false` (invite-only), `ROCKET_PORT=80`, `DATA_FOLDER=/data`,
`DATABASE_URL=secretref:database-url`, `ADMIN_TOKEN=secretref:admin-token` (add
SMTP via Mailgun/Graph later for invite emails).

## Deploy / update

[`azure-pipelines/Deployments/deploy-vaultwarden.yml`](../azure-pipelines/Deployments/deploy-vaultwarden.yml)
— mirrors `deploy-api`: pins the Vaultwarden image version, syncs secrets/env
from the `skintyee-prod-azure` variable group, and rolls a new revision. Manual
trigger (it's infra, and you choose when to bump the image).

## Sharing model

- One **Organization** ("Skin Tyee") → **Collections** per team (Band Office, IT,
  Finance, Council). Invite staff to the org, grant per-collection access.
- Invite-only: create users from the org **Manage → Members → Invite**, or via the
  `/admin` panel. No open signups.

## Backup

- **Postgres**: covered by the flex server's automated backups + PITR (same as
  the api).
- **`/data` (Azure Files)**: enable Azure Files snapshots/soft-delete; the RSA
  key + attachments live here. Periodically copy to Blob for off-share safety.

## Cost

- Vaultwarden: **\$0** (open source, unlimited users).
- Container Apps consumption (min-1 warm replica, tiny CPU): **a few \$/mo**.
- Postgres: **\$0** (reuse `skintyee-prod-pg`). Azure Files (5 GB): **~\$0.30/mo**.
- DNS + TLS: **\$0**.

## Deferred

- **Entra OIDC SSO** exists in newer Vaultwarden but is experimental — start
  invite-only + master password; revisit SSO once stable.
