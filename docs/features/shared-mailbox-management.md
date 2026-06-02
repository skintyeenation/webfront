# Shared mailbox management

How the app reads and writes Exchange Online shared-mailbox permissions
(`chief@`, `it@`, `bandmanager@`, etc.) — including why we don't do it
through Microsoft Graph and what's running where.

## The problem

Skin Tyee has 13 shared mailboxes that staff need on/off-boarding access to:

```
chief@skintyee.ca         it@skintyee.ca           bandmanager@skintyee.ca
councillor1@skintyee.ca   councilllor2@skintyee.ca finance@skintyee.ca
firechief@skintyee.ca     forestry@skintyee.ca     housing@skintyee.ca
landresources@skintyee.ca gis@skintyee.ca          media@skintyee.ca
referrals@skintyee.ca
```

These are normal Exchange user mailboxes with no license. **Permissions to
open them live in Exchange Online's mailbox database** — `FullAccess`
(receive in Outlook), `SendAs` (mail leaves as the shared identity), and
`SendOnBehalf`.

**Microsoft Graph v1.0 does not expose these permissions.** The only
programmatic interface is **Exchange Online PowerShell**
(`Get-/Add-/Remove-MailboxPermission`, `Add-/Remove-RecipientPermission`).

## Architecture

```
   ┌──────────────────┐   PATCH /v1/directory/:id/    ┌──────────────────┐
   │ React Native     │   mailbox-access              │  NestJS api/     │
   │ EditMember /     │ ────────────────────────────▶ │  (Container Apps)│
   │ SharedMailboxes  │                               │                  │
   └──────────────────┘                               └────────┬─────────┘
                                                               │
                       HTTPS POST  + function key              │ DB-as-truth:
                       { op: "grant",                          │ mailboxMemberships
                         mailbox: "chief@…",                   │ column tracks
                         user:    "lucas@…" }                  │ intent + audit
                                                               ▼
                                                  ┌──────────────────────────┐
                                                  │ Azure Function           │
                                                  │ (PowerShell 7.4, Linux,  │
                                                  │  Consumption plan)       │
                                                  │                          │
                                                  │ 1. Pull cert from KV     │
                                                  │ 2. Connect-ExchangeOnline│
                                                  │ 3. Add/Remove permission │
                                                  │ 4. Disconnect            │
                                                  │ 5. Return JSON           │
                                                  └──────────┬───────────────┘
                                                             │ cert auth
                                                             ▼
                                                  ┌──────────────────────────┐
                                                  │ Exchange Online          │
                                                  │ outlook.office365.com    │
                                                  └──────────────────────────┘
```

## Why an Azure Function (not a sidecar / not local pwsh)

| Option considered | Outcome |
|---|---|
| **NestJS shells out to local pwsh** | Worked on Linux container, **fails on macOS** for local dev. The PowerShell EXO module's MSAL layer can't acquire confidential-client tokens from a cert on darwin (`PlatformNotSupportedException: macOS …`). |
| **Container Apps sidecar** | Works, but adds an always-on container + image-build pipeline for low-frequency admin operations. |
| **Azure Function (chosen)** | PowerShell 7.4 runtime on Linux, cert from Key Vault, near-zero cost on Consumption plan, no macOS issues, deploys with `func azure functionapp publish`. |

Mailbox edits are rare admin actions — cold start (~1-2s after 20min idle)
is fine for this use case.

## Auth chain

```
NestJS api/
  │
  ├─ EXO_FUNCTION_URL + EXO_FUNCTION_KEY (Function host key)
  ▼
Azure Function (managed identity)
  │
  ├─ Reads cert from Key Vault via MI (Cert User + Secret User roles)
  ▼
Cert (skintyee-exo-app, RSA 2048, 2yr)
  │
  ├─ Registered as a keyCredential on the skintyee-app-graph Entra app
  ▼
Entra app skintyee-app-graph
  │
  ├─ Exchange.ManageAsApp (Application permission)
  ├─ Exchange Recipient Administrator (directoryRole)
  ▼
Exchange Online
```

Three distinct credentials, no overlap:
- The **Graph SP secret** (in api/.env) is for Microsoft Graph (band-member
  directory, M365 Groups, Planner)
- The **EXO cert** (in Key Vault, never on api/) is for Exchange Online
- The **Function key** (in api/.env) is just for api/ → Function transport

## What the function exposes

Single HTTP POST endpoint, op-switched body:

| op | body | response |
|---|---|---|
| `list` | `{op:'list'}` | All shared mailboxes in the tenant |
| `list-access` | `{op:'list-access', mailbox}` | Who has FullAccess / SendAs |
| `list-for-user` | `{op:'list-for-user', user}` | What mailboxes a user can open |
| `grant` | `{op:'grant', mailbox, user}` | Adds FullAccess + SendAs |
| `revoke` | `{op:'revoke', mailbox, user}` | Removes FullAccess + SendAs |

Source: [`exo-function/ExoFunction/run.ps1`](../../exo-function/ExoFunction/run.ps1).

## Source-of-truth model

```
┌─────────────────────┐         ┌──────────────────────┐
│   Postgres          │  diff   │   Exchange Online    │
│   BandMember        │ ───────▶│   mailbox            │
│   mailboxMemberships│         │   permissions        │
│   (INTENT)          │         │   (ACTUAL)           │
└─────────────────────┘         └──────────────────────┘
```

**DB is the intent + audit log.** Each `BandMember.mailboxMemberships` row
is a comma-separated list like:

```
chief@skintyee.ca|fullaccess,it@skintyee.ca|fullaccess
```

When admin saves in the app, the api/:
1. Diffs new desired list vs current `mailboxMemberships`
2. Calls Function `grant` for each addition, `revoke` for each removal
3. On success: updates the DB
4. On failure: rejects the PATCH, DB stays unchanged

A separate **reconcile** endpoint (`POST /v1/admin/shared-mailboxes/reconcile`)
re-pulls the EXO truth, diffs against the DB, and flags drift. Useful for
detecting changes made in Exchange admin center directly.

## Setup (one-time)

```bash
# 1. Cert + Entra permissions for the SP
bash scripts/setup-app-exo.sh

# 2. Azure Function infrastructure + deploy
bash scripts/setup-exo-function.sh
```

The two scripts together:
- Generate a cert and register it against `skintyee-app-graph`
- Add `Exchange.ManageAsApp` permission + admin-consent
- Assign `Exchange Recipient Administrator` to the SP
- Stand up Resource Group + Storage + Key Vault + Function App
- Upload the cert to Key Vault
- Grant the Function's managed identity → KV (Cert User + Secret User)
- Set app settings (KEY_VAULT_NAME, EXO_CERT_NAME, EXO_APP_ID, EXO_ORGANIZATION)
- Deploy the function code
- Write `EXO_FUNCTION_URL` + `EXO_FUNCTION_KEY` to `api/.env`

Total time: ~5 minutes (mostly Azure provisioning).

## Local development

There's **no** local PowerShell path — that's intentional. Local api/
calls the deployed Function via `EXO_FUNCTION_URL`. If those env vars
aren't set, `ExoService` degrades to DB-only mode (the EditMember screen
can still save intent, but no real Exchange writes happen — useful for
UI development without touching production permissions).

## Cost

| Resource | SKU | Monthly cost |
|---|---|---|
| Function App | Consumption (Y1) | ~$0 — 1M free executions, ~10s avg per call |
| Storage account | Standard_LRS | ~$0.10 — tiny blob storage |
| Key Vault | Standard | $0.03/10K ops — negligible |
| **Total** | | **< $1/mo** |

## Operations

### Test connectivity

```bash
source api/.env
curl -sX POST "$EXO_FUNCTION_URL?code=$EXO_FUNCTION_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"op":"list"}'
```

### Look at what permissions exist for a mailbox

```bash
curl -sX POST "$EXO_FUNCTION_URL?code=$EXO_FUNCTION_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"op":"list-access","mailbox":"chief@skintyee.ca"}'
```

### Tail Function logs

```bash
az functionapp log tail --name skintyee-exo-fn --resource-group skintyee-exo
```

### Re-deploy after editing the .ps1

```bash
( cd exo-function && func azure functionapp publish skintyee-exo-fn --powershell )
```

### Rotate the cert

```bash
bash scripts/setup-app-exo.sh --rotate-cert
az keyvault certificate delete --vault-name skintyee-exo-kv --name skintyee-exo-app
az keyvault certificate purge  --vault-name skintyee-exo-kv --name skintyee-exo-app
bash scripts/setup-exo-function.sh
```

### Rotate the Function key

```bash
az functionapp keys set --name skintyee-exo-fn --resource-group skintyee-exo \
  --key-type functionKeys --key-name default
# then re-run setup-exo-function.sh to pick up the new key
```

## Files

| Path | Purpose |
|---|---|
| `exo-function/host.json` | Function host config (extension bundle, managed deps) |
| `exo-function/requirements.psd1` | PowerShell module deps (EXO, Az.KeyVault, Az.Accounts) |
| `exo-function/profile.ps1` | Per-worker startup; logs into Az with MI |
| `exo-function/ExoFunction/run.ps1` | The actual EXO logic, op-switched |
| `exo-function/ExoFunction/function.json` | HTTP trigger binding |
| `scripts/setup-app-exo.sh` | Cert + Entra permissions for the SP |
| `scripts/setup-exo-function.sh` | Azure infra + Function deployment |
| `api/src/exo.service.ts` | NestJS HTTP client → Function |
| `api/src/controllers.ts` | Shared-mailbox endpoints (added by ADR-15) |
