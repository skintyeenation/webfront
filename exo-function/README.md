# exo-function — Exchange Online PowerShell, hosted

HTTP-triggered Azure Function that the NestJS `api/` calls for shared-mailbox
permission operations. Runs on the **PowerShell 7.4** runtime so that
`ExchangeOnlineManagement` + cert-based app-only auth work reliably (the
local-macOS .NET cert-binding limitation that motivated this architecture).

## Why an Azure Function

Microsoft Graph v1.0 has no API for Exchange Online mailbox permissions.
The only programmatic path is `Exchange Online PowerShell`. We host it
in Azure because:

- The PowerShell EXO module's MSAL layer can't acquire confidential-client
  tokens from a cert on macOS (`PlatformNotSupportedException`). Linux
  Functions runtime is fine.
- Mailbox operations are infrequent admin actions — cold-start cost is
  acceptable, and Consumption plan keeps it near-free.
- The cert lives in Key Vault, accessed via the Function App's managed
  identity. No secrets in app settings.

## Architecture

```
NestJS api/  ──(HTTP POST + function key)──▶  Azure Function  ──▶  Exchange Online
                                                     │
                                                     └─── Key Vault (cert)
```

## Operations (POST body)

| op              | body                                     | response                  |
|-----------------|------------------------------------------|---------------------------|
| `list`          | `{op:'list'}`                            | all shared mailboxes      |
| `list-access`   | `{op:'list-access', mailbox:'chief@…'}`  | users w/ FullAccess+SendAs|
| `list-for-user` | `{op:'list-for-user', user:'lucas@…'}`   | mailboxes user can open   |
| `grant`         | `{op:'grant', mailbox, user}`            | grants FullAccess + SendAs|
| `revoke`        | `{op:'revoke', mailbox, user}`           | removes both              |

## App settings (set by `scripts/setup-exo-function.sh`)

| Name | Value |
|---|---|
| `KEY_VAULT_NAME` | the KV holding the cert |
| `EXO_CERT_NAME` | cert name in KV |
| `EXO_APP_ID` | Entra appId of `skintyee-app-graph` |
| `EXO_ORGANIZATION` | `skintyeenation.onmicrosoft.com` |

## Local dev

You **can't** run this locally on macOS — that's the whole point. The
NestJS `api/` calls the deployed Function via `EXO_FUNCTION_URL` +
`EXO_FUNCTION_KEY` env vars. If those aren't set, the api/ falls back
to DB-only mode (intent tracking; no real EXO writes).
