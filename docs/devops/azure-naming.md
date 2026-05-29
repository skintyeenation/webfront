# Azure resource naming — rules, conventions, and the catalog

The doc you wish you'd had before the first time you ran `az foo create
--name skintyee-prod-foo` and Azure said "no, not that one." Every
Azure resource type has its own naming rules, and they are NOT uniform.
This doc catalogs:

1. **Per-resource-type naming rules** (Microsoft's constraints — lifted
   here so you don't re-discover them mid-script)
2. **Skin Tyee's naming conventions** (the patterns we picked + why)
3. **The catalog** — every Azure resource that exists or is planned, with
   its actual name and the decision behind it

---

## Per-resource-type naming rules

A reference table of the constraints that matter at provisioning time.
**Read this BEFORE writing a new `setup-*.sh` script** to avoid a
50-line script that fails at line 23 because of a hyphen.

| Resource type | Length | Allowed chars | Globally unique? | Notes |
|---|---|---|---|---|
| **Subscription** | n/a (system-assigned GUID) | — | — | Display name only is freely set |
| **Resource group** | 1-90 | letters, digits, periods, underscores, hyphens, parentheses (unicode OK) | within subscription | Most permissive. `skintyee-prod-rg` works. |
| **Storage account** ⚠ | **3-24** | **lowercase letters + digits ONLY** | **globally** | No hyphens, no uppercase, no underscores, no periods. Most restrictive common type. This is why we use `skintyeebackups` not `skintyee-backups`. |
| **Storage container** (inside a storage account) | 3-63 | lowercase letters, digits, hyphens (no consecutive hyphens; no leading/trailing hyphen) | within account | Hyphens OK here, unlike the parent account name. `m365-email-archive` is fine. |
| **Storage blob** (file inside a container) | 1-1024 | almost anything | within container | Slashes create virtual folders. |
| **Azure Container Registry (ACR)** ⚠ | 5-50 | **letters + digits ONLY** | **globally** | Same restriction shape as storage account. This is why our ACR is `skintyeeprodacr` (no hyphens). |
| **ACR repository** (inside ACR) | 2-256 | lowercase letters, digits, periods, hyphens, slashes, underscores | within ACR | Hyphens/slashes OK here. Image names like `api`, `lookup`, `library/foo` all fine. |
| **Container Apps environment** | 1-32 | letters, digits, hyphens (no leading/trailing hyphen) | within RG | Hyphens fine. `skintyee-prod-env`. |
| **Container App** | 1-32 | lowercase letters, digits, hyphens (no leading/trailing hyphen) | within environment | Hyphens fine. `api-prod`, `lookup-prod`. |
| **Container App revision name** | derived | letters, digits, hyphens | within Container App | Set by `--revision-suffix`; the prefix is the Container App name. e.g. `api-prod--sha-eccfd9b` (note the double-hyphen separator, that's Azure's convention). |
| **Static Web App** | 2-60 | letters, digits, hyphens | within RG | `skintyee-prod-app`, `skintyee-prod-lookup-app`. Hyphens fine. |
| **PostgreSQL Flexible Server** | 3-63 | lowercase letters, digits, hyphens | globally | `skintyee-prod-pg`. Hyphens fine. |
| **PostgreSQL database** (inside the server) | 1-63 | lowercase letters, digits, hyphens, underscores | within server | Hyphens + underscores fine. `api`. |
| **Key Vault** | 3-24 | letters, digits, hyphens (must start with letter, no consecutive hyphens) | **globally** | Globally unique. Hyphens OK. Different rule from storage account. |
| **Application Insights** | 1-260 | letters, digits, hyphens, spaces, parentheses, periods | within RG | Permissive. `ai-m365-backup`. |
| **Log Analytics workspace** | 4-63 | letters, digits, hyphens | within subscription | `log-skintyee-prod`. |
| **Action Group** (Azure Monitor alerting target) | 1-260 (display name); 1-12 (short name) | letters, digits, hyphens | within RG | The "short name" is the 12-char one used in SMS messages — pick wisely. `ag-m365-backup-critical` (display) / `M365Backup` (short). |
| **Metric Alert rule** | 1-260 | most chars | within RG | Permissive. |
| **Entra app (App Registration)** | 1-120 (display name) | anything | within tenant | Display name only; the appId is a GUID assigned by Azure. `skintyee-m365-backup`. |
| **Entra group** | 1-256 (display name) | most chars | within tenant | Permissive. `it-admins`. |
| **DNS zone** (Azure DNS) | n/a — the FQDN | the DNS RFC rules | within tenant | We don't use Azure DNS — DNS stays at GoDaddy (see [`../godaddy/dns-hosting-tradeoff.md`](../godaddy/dns-hosting-tradeoff.md)). |
| **Storage SAS token** | n/a (generated) | — | — | Lifetime + permissions set at create; the token string itself is opaque. |
| **Managed Identity** | 3-128 | letters, digits, hyphens, underscores | within RG | Permissive. |

⚠ **The two big traps** are **Storage Account** and **ACR** — both have
the same harsh "lowercase letters + digits only, no separators" rule.
If a script needs a friendly name with hyphens to identify its purpose,
**use the container or repository sub-resource for that** — the parent
resource name has to stay plain.

### Why the rules vary so much

Different Azure services were built by different teams over a 15-year
span, each picking its own constraints. **Storage** and **ACR** names
become parts of FQDNs (`skintyeeprodacr.azurecr.io`,
`skintyeebackups.blob.core.windows.net`), and DNS labels historically
couldn't include certain chars in some legacy resolvers, so Microsoft
chose maximum compatibility. **Container Apps** and **SWA** are newer
and don't have the same DNS-label-history baggage, so they allow
hyphens.

You don't need to remember the history; you just need this table when
you're writing a script.

---

## Skin Tyee's naming conventions

Patterns we use consistently across the platform, so a new contributor
can guess names without grepping:

### Prefix: `skintyee` (or `skintyeenation` for Entra-tenant-wide things)

| Pattern | Where used | Examples |
|---|---|---|
| `skintyee` | Most resources (RGs, Container Apps env, SWAs, Postgres, Application Insights) | `skintyee-prod-rg`, `skintyee-prod-env`, `skintyee-prod-app` |
| `skintyeenation` | The Entra **tenant** name (Microsoft chose this — has to match the org domain prefix) + the ADO **organization** name (chosen to match) | `skintyeenation.onmicrosoft.com` (Entra), `dev.azure.com/skintyeenation` (ADO) |
| `skintyee<nohyphens>` | Resources that disallow hyphens (Storage, ACR) | `skintyeeprodacr`, `skintyeebackups` |
| `st<thing>` | Reserved for an abbreviated short form if we ever need it; not currently used | (not in use) |

### Environment indicator: `prod` (or `dev` / `stg` in future)

Most resources live in `prod` — Skin Tyee is currently single-environment
(POC + production are the same tenant). The `prod` suffix is there for
when we add a dev tenant down the line; the naming is forward-compatible.

| Pattern | Examples |
|---|---|
| `skintyee-prod-<resourcetype>` | `skintyee-prod-rg`, `skintyee-prod-env`, `skintyee-prod-app`, `skintyee-prod-lookup-app`, `skintyee-prod-pg` |
| `skintyeeprodacr` | The single non-hyphenated form |
| `<workload>-prod` (where workload is a service, not a resource type) | `api-prod`, `lookup-prod` (Container Apps inside the env) |

### Region: `canadacentral`

Picked once, used everywhere. Cost reasons (data residency for an
Indigenous Nation in BC, Canada Central is the closest region). Also
mentioned in [`./deployment-plan.md`](./deployment-plan.md).

### Per-workload qualifier

| Pattern | Why |
|---|---|
| `api-prod` | The primary NestJS api |
| `lookup-prod` | The lookup-api (Node) |
| `skintyee-prod-app` | The SWA hosting the main community app web bundle |
| `skintyee-prod-lookup-app` | The SWA hosting the lookup web UI |

The `-prod` is part of the Container App name (not separated by a
slash or path) because Container Apps puts the name into the FQDN.

### Resource Group: one

Everything lives in `skintyee-prod-rg`. There's no reason to split into
multiple RGs at this scale — it complicates IAM and adds nothing. If
we ever need to isolate (e.g. a separate dev tenant), we make a new
RG `skintyee-dev-rg`.

### Naming for backup destinations (specifically)

A 2026-05 decision worth its own line:

- **Storage account: `skintyeebackups`** — singular for *all* Skin Tyee
  backup destinations. Not per-workload (i.e., not `skintyeem365backups`
  + `skintyeesharepointbackups` + `skintyeeentrabackups` +
  `skintyeeazurebackups` — that'd be 4 separate accounts with no
  value-add).
- **Container per backup target**, hyphens allowed inside container names:
  - `m365-email-archive` — Exchange Online backup
    ([`../365/email-backup.md`](../365/email-backup.md))
  - `m365-sharepoint-archive` — SharePoint backup (future)
  - `entra-snapshots` — Entra ID daily JSON snapshots
    ([`../365/entra-backup.md`](../365/entra-backup.md))
  - `azure-snapshots` — Azure resource config daily JSON snapshots
    ([`./azure-backup.md`](./azure-backup.md))
- This means **one immutability policy + one set of credentials + one
  monitoring story** covers all four backup workloads.

See [`./backup-architecture.md`](./backup-architecture.md) for the
bird's-eye map of all four backup workloads + the one-storage-account
decision rationale.

---

## The catalog — every Azure resource (current + planned)

Living list. Add a row when you create a new resource. Indicates the
resource type's constraint that drove the name + the doc/script that
created it.

### Currently provisioned

| Name | Type | Constraint that mattered | Created by | Status |
|---|---|---|---|---|
| `skintyee-prod-rg` | Resource Group | None (90 chars, anything) | `setup-api-azure.sh` | ✅ Live |
| `skintyeeprodacr` | Container Registry | letters+digits only, 5-50 chars | `setup-api-azure.sh` | ✅ Live |
| `skintyee-prod-env` | Container Apps env | 32 chars, hyphens OK | `setup-api-azure.sh` | ✅ Live |
| `api-prod` | Container App | 32 chars, lowercase+digits+hyphens | `setup-api-azure.sh` | ✅ Live |
| `lookup-prod` | Container App | same | `setup-lookup-azure.sh` | ✅ Live |
| `skintyee-prod-pg` | PostgreSQL Flexible Server | globally unique, 63 chars | `setup-api-azure.sh` | ✅ Live |
| `api` | PostgreSQL database (in the server above) | within server | `setup-api-azure.sh` | ✅ Live |
| `skintyee-prod-app` | Static Web App | 60 chars, hyphens OK | `setup-app-web-azure.sh` | ✅ Live |
| `skintyee-prod-lookup-app` | Static Web App | same | `setup-lookup-app-web-azure.sh` | ✅ Live |
| `skintyee-prod-azure` | ADO service connection (federated) | n/a (ADO naming) | `setup-api-azure.sh` | ✅ Live |
| `skintyee-prod-azure` | ADO variable group | n/a (ADO naming) | `setup-api-azure.sh` | ✅ Live |
| `skintyee-prod-deploy` | Entra app (deploy SP) | 120 char display name; appId is GUID | `setup-api-azure.sh` | ✅ Live |
| `it-project-docs-publisher` | Entra app (SharePoint publisher) | same | `setup-sharepoint-pipeline.sh` | ✅ Live |
| `skintyeenation-admin-cli` | Entra app (CLI helper for admin tasks) | same | `setup-sharepoint-pipeline.sh` | ✅ Live |
| `mc-skintyee-prod--api-skintyee-ca-2049` | Container Apps managed cert (auto-named) | system-generated | `az containerapp hostname bind` | ✅ Live |
| `mc-skintyee-prod--lookup-api-skint-7909` | Container Apps managed cert | same | same | ✅ Live |

### Planned (not yet provisioned)

| Name | Type | Doc / script that will create it | Notes |
|---|---|---|---|
| `skintyeebackups` | Storage Account | `setup-m365-backup-cloud.sh` (open follow-up) | Shared by ALL Skin Tyee backups (email + future SharePoint + future Entra). lowercase+digits constraint drove the form. |
| `m365-email-archive` | Storage container (in `skintyeebackups`) | same | 90-day immutability policy. Write-only SAS for the on-prem Server 2022. |
| `m365-sharepoint-archive` | Storage container (in `skintyeebackups`) | future `setup-sharepoint-backup-cloud.sh` | TBD. |
| `entra-snapshots` | Storage container (in `skintyeebackups`) | future `setup-entra-backup-cloud.sh` | See [`../365/entra-backup.md`](../365/entra-backup.md). |
| `azure-snapshots` | Storage container (in `skintyeebackups`) | future `setup-azure-backup-cloud.sh` | See [`./azure-backup.md`](./azure-backup.md). |
| `skintyee-m365-backup` | Entra app | `setup-m365-backup-cloud.sh` | Read-only `Mail.Read`/`Calendars.Read`/`Contacts.Read`/`User.Read.All` |
| `skintyee-entra-backup` | Entra app | future `setup-entra-backup-cloud.sh` | Read-only Directory.Read.All etc. |
| `ai-m365-backup` | Application Insights | `setup-m365-backup-cloud.sh` | Heartbeat metric target for the alerting path. |
| `ag-m365-backup-critical` | Action Group | `setup-m365-backup-cloud.sh` | SMS + voice + email targets for backup-missed alerts. |
| `m365-backup-missing-heartbeat` | Metric Alert rule | `setup-m365-backup-cloud.sh` | 36-hour heartbeat window. |
| `m365-backup-failed` | Metric Alert rule | `setup-m365-backup-cloud.sh` | Explicit-failure signal. |

---

## When you're writing a new script

The checklist:

1. ☐ **Look up the resource type in the table above** to find its
   constraint. Don't assume "hyphens are fine" — for Storage and ACR
   they're not.
2. ☐ **Match Skin Tyee's prefix + environment convention** — almost
   always `skintyee-prod-<thing>`, except where the constraint forces
   no-hyphens (then drop them and concatenate).
3. ☐ **Check the catalog for collisions** before you pick. Global
   uniqueness on Storage / ACR / Key Vault means someone else's tenant
   could have taken the name (run `az storage account check-name --name
   foo` to verify).
4. ☐ **Add the new resource to this doc's catalog** as part of the same
   commit that creates it — keeps the catalog living, not theoretical.

---

## See also

- [`./deploy-architecture.md`](./deploy-architecture.md) — the bird's-eye
  map of what gets deployed (resource types, not names)
- [`./deployment-plan.md`](./deployment-plan.md) — ADR-10 + Container
  Apps deploy plan
- [`./deploy-status.md`](./deploy-status.md) — point-in-time deploy status
- Azure naming reference (official):
  - <https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules>
  - <https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming>
