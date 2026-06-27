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

```bash
RG=skintyee-prod-rg; ENV=skintyee-prod-env; APP=vaultwarden; REGION=canadacentral
DOMAIN=vault.skintyee.ca

# 1. Vault database on the existing flex server
az postgres flexible-server db create -g $RG -s skintyee-prod-pg -d vaultwarden

# 2. Azure Files share for /data + register it on the managed environment
az storage share-rm create -g $RG --storage-account <storageacct> --name vaultwarden-data --quota 5
az containerapp env storage set -g $RG -n $ENV --storage-name vwdata \
  --azure-file-account-name <storageacct> --azure-file-account-key <key> \
  --azure-file-share-name vaultwarden-data --access-mode ReadWrite

# 3. Create the app from the spec (image, ingress, secrets, env, volume mount)
#    Edit containerapp.yaml first (it references the secrets you set below).
az containerapp create -g $RG -n $APP --environment $ENV --yaml containerapp.yaml

# 4. Secrets (DATABASE_URL → vaultwarden db; ADMIN_TOKEN = argon2 hash for /admin)
az containerapp secret set -g $RG -n $APP --secrets \
  "database-url=postgresql://<user>:<pass>@skintyee-prod-pg.postgres.database.azure.com:5432/vaultwarden?sslmode=require" \
  "admin-token=$(docker run --rm vaultwarden/server /vaultwarden hash)"   # paste the PHC string

# 5. Custom domain + managed cert
az containerapp hostname add     -g $RG -n $APP --hostname $DOMAIN     # then add the CNAME/TXT it prints
az containerapp hostname bind    -g $RG -n $APP --hostname $DOMAIN --environment $ENV --validation-method CNAME
```

Key env (in `containerapp.yaml`): `DOMAIN=https://vault.skintyee.ca`,
`SIGNUPS_ALLOWED=false` (invite-only), `ROCKET_PORT=80`, `DATABASE_URL=secretref:database-url`,
`ADMIN_TOKEN=secretref:admin-token`, plus SMTP (Mailgun/Graph) for invite emails.

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
