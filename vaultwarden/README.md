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

Scripted + idempotent — run via pnpm from the repo root
([`setup-vaultwarden.sh`](setup-vaultwarden.sh)):

```bash
pnpm vaultwarden:setup                  # provision everything
pnpm vaultwarden:setup:dry              # preview the az commands (no changes)
pnpm vaultwarden:setup -- --skip-domain # skip the vault.skintyee.ca hostname bind
```

**No extra env needed** — the Postgres password is reused from `api-prod`'s
existing `database-url` Container App secret (already in Azure), with the db name
swapped to `vaultwarden`. Override with `PG_PASSWORD=… pnpm vaultwarden:setup` only
if you want a different db user. Just be logged into `az` with rights on the RG.

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

> **Admin token:** with Docker present locally the script argon2-hashes the token
> (recommended); without Docker it falls back to a random **plain** token (works,
> but rotate to a PHC hash later — `docker run --rm -it vaultwarden/server /vaultwarden hash`
> — and store it as `VW_ADMIN_TOKEN`).
>
> **Verified (dry-run):** `pnpm vaultwarden:setup:dry` against the live
> subscription confirmed the pg creds derive cleanly from `api-prod`'s
> `database-url` secret → `postgresql://pgadmin:***@skintyee-prod-pg…/vaultwarden?sslmode=require`,
> with **no extra env**.

Key env (set in `containerapp.yaml`): `DOMAIN=https://vault.skintyee.ca`,
`SIGNUPS_ALLOWED=false` (invite-only), `ROCKET_PORT=80`, `DATA_FOLDER=/data`,
`DATABASE_URL=secretref:database-url`, `ADMIN_TOKEN=secretref:admin-token` (add
SMTP via Mailgun/Graph later for invite emails).

## DNS records (`vault.skintyee.ca`)

skintyee.ca's DNS is **not** in this Azure subscription, so add these two records
manually at the DNS host. Both are required; the managed TLS cert issues
automatically once they resolve.

| Type  | Host / Name   | Value |
|-------|---------------|-------|
| CNAME | `vault`       | `vaultwarden.mangoglacier-ce3e1265.canadacentral.azurecontainerapps.io` |
| TXT   | `asuid.vault` | `6EE1F234E5BE241ECD520220C5A9918C632BFB7761B2F924DB1CF4C4E3ABA735` |

- **CNAME** target = the Container App FQDN (`<app>.<env-default-domain>`). The
  env default domain is `mangoglacier-ce3e1265.canadacentral.azurecontainerapps.io`.
- **TXT** value = the Container Apps **`customDomainVerificationId`**, which is
  **subscription-wide** — the *same* ID `api.skintyee.ca` uses, so it's stable
  and valid even before the `vaultwarden` app exists. Re-confirm any time:
  ```bash
  az containerapp show -g skintyee-prod-rg -n api-prod \
    --query properties.customDomainVerificationId -o tsv
  ```
- After the records resolve, the bind happens automatically on the next
  `pnpm vaultwarden:setup`, or run it directly:
  ```bash
  az containerapp hostname bind -g skintyee-prod-rg -n vaultwarden \
    --hostname vault.skintyee.ca --environment skintyee-prod-env --validation-method CNAME
  ```

## Provisioning notes (status + caveats)

- **Live:** the `vaultwarden` Container App is created and running
  (`RunningAtMaxScale`, 1 replica), vault data in the `vaultwarden` Postgres db,
  secrets set. Default URL works; `vault.skintyee.ca` cert binding in progress.
- **`az containerapp create --yaml` is broken** in the containerapp extension
  **1.3.0b4** (`400 … could not be converted to System.Boolean`). The script +
  this guide create the app with **flags** instead; [`containerapp.yaml`](containerapp.yaml)
  is kept as the reference spec for when the extension is back on a stable release.
- **`/data` Azure Files volume — one-time TODO:** flags can't attach a volume, so
  add it once via **Portal → Container App `vaultwarden` → Volumes →** AzureFile
  storage **`vwdata`** mounted at **`/data`** (or
  `az containerapp update --yaml containerapp.yaml` on a stable extension). Until
  then vault entries are safe (Postgres), but the **RSA JWT key + attachments +
  Sends** sit on ephemeral disk — a revision roll logs everyone out and drops
  attachments. **Add the volume before real use.**

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

Part of the band backup plan (`README.md` → *What IS backed up* →
`vaultwarden-backup`). **Not implemented yet** — the floor today is Microsoft's
7-day Postgres PITR. Two things to back up:

1. **Vault contents — the `vaultwarden` Postgres db** (the critical part: all
   passwords/items, encrypted). Plan: extend the **`postgres-dumps`** workload to
   `pg_dump` the `vaultwarden` db alongside `api`, same GFS rotation, into
   `skintyeebackups`. Near-term floor: the flex server's automated backups +
   **7-day PITR** already cover it.
2. **`/data` Azure Files share (`vwdata`)** — the RSA JWT key, attachments,
   Sends, and `config.json`. Plan: enable **Azure Files snapshots + soft-delete**
   on the share, plus a periodic copy to the `skintyeebackups` Blob for
   off-share safety.

**Restore:** recreate the app (`setup-vaultwarden.sh`) → restore the
`vaultwarden` db (PITR or a `pg_dump`) → restore `/data` from a Files snapshot.
The vault is end-to-end encrypted, so a restored db is useless without users'
master passwords — back up the data, not the plaintext.

> Tracking item: add a `vaultwarden-backup` to the postgres-dumps pipeline + a
> Files snapshot policy when the backup pipelines are stood up.

## Cost — why Vaultwarden over 1Password (no per-user fees)

The deciding factor: **Vaultwarden has no per-user subscription** — it's
open-source, self-hosted, unlimited users for **\$0 licensing**. 1Password (and
Bitwarden's hosted tiers) bill **per user per month, forever**, which for an NGO
adding staff over time only grows.

| | Licensing | ~15 staff (monthly) | ~15 staff (annual) |
|---|---|--:|--:|
| **Vaultwarden (self-hosted)** | **\$0** (unlimited users) | **~\$3–5** hosting only | **~\$40–60** |
| 1Password Business | \$7.99 / user / mo | ~\$120 | ~\$1,440 |
| 1Password Teams (≤10 users) | \$19.95 / mo flat (caps at 10) | \$19.95 | \$240 |
| Bitwarden Teams (hosted) | \$4 / user / mo | ~\$60 | ~\$720 |

- The only Vaultwarden cost is **hosting**: Container Apps consumption (min-1 warm
  replica, tiny CPU) **~\$3–5/mo**; **Postgres \$0** (reuse `skintyee-prod-pg`);
  Azure Files (5 GB) **~\$0.30/mo**; DNS + TLS **\$0**.
- **Same clients, no lock-in:** staff use the *official Bitwarden apps* either way,
  so this isn't a downgrade — it's the same UX without the per-seat bill.
- **Trade-off:** we run the server (vs 1Password's managed SaaS + support). For a
  small internal tool on infra we already operate, the recurring savings win.
- Even with 1Password's nonprofit discount, it stays a **recurring per-user** cost
  that scales with headcount; Vaultwarden stays flat at ~\$0 regardless of users.

## Deferred

- **Entra OIDC SSO** exists in newer Vaultwarden but is experimental — start
  invite-only + master password; revisit SSO once stable.
