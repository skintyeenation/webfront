# Backup architecture — the five workloads + one storage account

Bird's-eye map of every "what gets backed up where" decision for Skin
Tyee. Companion to [`./deploy-architecture.md`](./deploy-architecture.md)
(which maps what gets *deployed*) — this maps what gets *backed up*.

## The architecture in one diagram

```
                     ┌────────────────────────────────┐
                     │   Microsoft 365 / Exchange     │
                     │   (graph.microsoft.com)        │
                     ├────────────────────────────────┤
                     │  • mail + calendar + contacts  │  ──┐
                     │  • SharePoint document libs    │  ──┼──┐
                     │  • Entra ID (users/groups/...) │  ──┼──┼──┐
                     └────────────────────────────────┘    │  │  │
                                                           │  │  │
                     ┌────────────────────────────────┐    │  │  │
                     │   Azure (canadacentral)        │    │  │  │
                     ├────────────────────────────────┤    │  │  │
                     │  • All resources in skintyee-  │  ──┼──┼──┼──┐
                     │    prod-rg + RBAC + policies   │    │  │  │  │
                     │  • Postgres `api` DB content   │  ──┼──┼──┼──┼──┐
                     │    (rows in skintyee-prod-pg)  │    │  │  │  │  │
                     └────────────────────────────────┘    │  │  │  │  │
                                                           ▼  ▼  ▼  ▼  ▼
                          ┌──────────────────────────────────────────────┐
                          │  Backup Server (Physical, Onsite — Win 2022) │
                          │  D:\backups\                                 │
                          │    m365-email\                               │
                          │    m365-sharepoint\                          │
                          │    entra\                                    │
                          │    azure\                                    │
                          │    postgres\                                 │
                          └──────────────────────────┬───────────────────┘
                                                     │   azcopy sync nightly,
                                                     │   write-only SAS,
                                                     │   90-day immutability
                                                     ▼
              ┌─────────────────────────────────────────────────────────────┐
              │  Azure Blob Storage Account: skintyeebackups                │
              │  (Cool tier, LRS, canadacentral, 90-day immutability policy)│
              │                                                             │
              │  ├── m365-email-archive       ← Exchange Online             │
              │  ├── m365-sharepoint-archive  ← SharePoint document libs    │
              │  ├── entra-snapshots          ← Entra ID daily JSON         │
              │  ├── azure-snapshots          ← Azure ARM/RBAC daily JSON   │
              │  └── postgres-dumps           ← pg_dump GFS rotation        │
              │                                                             │
              └─────────────────────────────────────────────────────────────┘
```

## The five workloads

| # | Source | Container in `skintyeebackups` | Doc | Status |
|---|---|---|---|---|
| 1 | **Microsoft 365 — Exchange Online** (mail, calendar, contacts) — content data | `m365-email-archive` | [`../365/email-backup.md`](../365/email-backup.md) | Doc complete; scripts not yet built |
| 2 | **Microsoft 365 — SharePoint** (organizational documents) — content data | `m365-sharepoint-archive` | `../365/sharepoint-backup.md` (future) | Planning doc not yet written |
| 3 | **Entra ID** (users, groups, roles, app registrations, conditional access) — identity + config data | `entra-snapshots` | [`../365/entra-backup.md`](../365/entra-backup.md) | Planning doc complete; scripts not yet built |
| 4 | **Azure resources** (resource definitions, RBAC, alert rules, monitoring config) — Azure-side config data | `azure-snapshots` | [`./azure-backup.md`](./azure-backup.md) | Planning doc complete; scripts not yet built |
| 5 | **Postgres database content** (rows in `skintyee-prod-pg`) — content data via Postgres wire protocol | `postgres-dumps` | [`./postgres-backup.md`](./postgres-backup.md) | Planning doc complete (Phase 2 per [`./deployment-plan.md` § Phase 2](./deployment-plan.md#phase-2--production-ready-later-after-poc-validates)); Microsoft's 7-day PITR covers near-term needs |

## What's NOT in this architecture (and where it lives instead)

| Item | Why it's not here | Where it actually is |
|---|---|---|
| **Microsoft 365 OneDrive** (personal user drives) | Policy decision: personal scratch space; org-critical files belong in SharePoint instead | See [`../365/email-backup.md` § Decision: don't back up OneDrive](../365/email-backup.md#decision-dont-back-up-onedrive) |
| **Microsoft Teams chat history** | Lives in a hidden Exchange folder; addable to the email-backup script later if needed | [`../365/email-backup.md` § Phase 2 considerations](../365/email-backup.md#phase-2-considerations) |
| **Container image binaries** (the actual Docker layers in `skintyeeprodacr`) | ACR has its own durability + retention. We back up the *metadata* (which tag → which sha at which time) as part of the Azure config snapshot, not the binary data. | n/a |
| **Secret VALUES** (Postgres password, SP client secrets, SAS tokens, Anthropic API key) | These don't get backed up to the archive at all. They live in 1Password (the durable source of truth) + the ADO variable group + Container App secrets (the operational copies). The config snapshots record that a secret *exists*, not its value. | 1Password vault `IT/Admin` |
| **The backups themselves** (the contents of `skintyeebackups`) | Backing up the backup creates infinite regress. The durability comes from Azure Blob's 99.999999999% spec + the 90-day immutability policy + the on-prem Server 2022 copy. | Phase 2 consideration: mirror to a *different* cloud (S3 / GCS) for true cross-cloud redundancy |

## Why one storage account, not many

The decision was made 2026-05-27. Five workloads, one bucket
(`skintyeebackups`), five containers — instead of five separate storage
accounts (`skintyeem365backups`, `skintyeesharepointbackups`,
`skintyeeentrabackups`, `skintyeeazurebackups`, `skintyeepostgresbackups`).

Reasoning:

| Concern | One account, five containers | Five separate accounts |
|---|---|---|
| **Immutability policy** | One policy, applies to all five containers automatically | Five separate policies to keep in sync |
| **Access credentials** | One write-only SAS per workload (still rotatable independently — SAS scope is per-container) | Four credentials, four rotation calendars |
| **Monitoring** | One Application Insights, one Action Group, one alerting story | Four sets of monitoring config |
| **Cost** | Each Azure storage account has a flat-fee baseline (~$0); negligible difference at our scale either way | Same |
| **Naming** | `skintyeebackups` is shorter + works for any future backup type without renaming | If we ever add a 5th workload, we'd add a 5th account; with the one-account model we just add a 5th container |
| **Per-workload isolation** | Containers provide enough isolation — SAS tokens are scoped to a single container, immutability is per-container | Stronger isolation (full account boundary) — but we don't have an attack-model where this matters at our scale |
| **Recoverability** | Same Azure region, same redundancy class for all four (Cool LRS canadacentral) | Could vary per account, but at our scale we'd pick the same anyway |

Net: one storage account is strictly simpler with no real cost. We pick
that.

## Container layout details

Each container is configured the same way at the storage-account level:

| Container | Access tier | Immutability policy | Versioning | Soft delete | SAS permissions for the writer |
|---|---|---|---|---|---|
| `m365-email-archive` | Cool | 90-day legal hold | enabled | 30 days | Create + Write (no Delete, no Read) |
| `m365-sharepoint-archive` (future) | Cool | 90-day legal hold | enabled | 30 days | Create + Write |
| `entra-snapshots` (future) | Cool | 90-day legal hold | enabled | 30 days | Create + Write |
| `azure-snapshots` (future) | Cool | 90-day legal hold | enabled | 30 days | Create + Write |
| `postgres-dumps` (Phase 2) | Cool | 90-day legal hold | enabled | 30 days | Create + Write |

The 90-day legal hold means even a fully-compromised SAS holder cannot
delete blobs less than 90 days old. The 30-day soft delete is the safety
net for *new* blobs whose immutability hasn't kicked in yet (or for
restore-from-here scenarios).

## Per-workload sizing estimate (3-year horizon)

| Workload | Estimated 3-year volume | Annual Azure Blob cost (Cool, LRS, canadacentral) |
|---|---|---|
| Email (5-15 mailboxes, growing) | ~50-150 GB | $1-3/month |
| SharePoint (org docs) | **highly variable** — could be 100 GB → 10 TB. Drives its own design pass. | $2 - $200/month depending on scope |
| Entra snapshots (JSON, tiny) | <10 GB | <$0.20/month |
| Azure config snapshots (JSON, tiny) | <10 GB | <$0.20/month |
| Postgres dumps (GFS rotation; small `api` DB) | <5 GB | <$0.30/month |
| **Total (excl. SharePoint)** | **<200 GB** | **~$3.80/month** |

SharePoint's variability is why it's a separate planning unit — it could
be the dominant cost driver and deserves its own analysis before we
commit storage class + retention.

## Cross-workload concerns (intentionally shared)

All five backup pipelines share these patterns by design — change once,
applies to all:

| Pattern | Where defined | Why shared |
|---|---|---|
| **Storage account `skintyeebackups`** | This doc + [`./azure-naming.md`](./azure-naming.md) | Single bucket, simpler |
| **Write-only SAS pattern** | [`../365/email-backup.md` § Secondary copy → Azure Blob](../365/email-backup.md#secondary-copy--azure-blob) — used by all 4 | Defence-in-depth (compromised writer cannot read or delete) |
| **Multi-channel alerting via Azure Monitor Action Group `ag-backup-critical`** | [`../365/email-backup.md` § Monitoring & alerting](../365/email-backup.md#monitoring--alerting) — used by all 4 | SMS+voice+email if any backup misses heartbeat. Quarterly drill to verify the path. |
| **Heartbeat metric → Application Insights `ai-backup`** | each script pushes `<workload>_backup_success_total` | One alerting infrastructure |
| **1Password CLI for credential injection** | each script reads tenant ID + client ID + client secret from 1Password at task-start time | Secrets never on disk in plaintext |
| **Restore drill SOP — monthly** | each doc records its own drill in `D:\backups\drill-log.md` | Backup that never gets restored from is theoretical |

So when we set up the alerting, we set it up *once* for all four
workloads. When we set up the storage account, we set it up *once*. The
per-workload scripts each just create their own container + push their
own heartbeat metric.

## Server-side disk layout (Backup Server 2022)

Mirrors the cloud-side container layout, with a shared scaffolding:

```
D:\backups\
├── m365-email\                       # → mirrored to m365-email-archive
│   ├── mailboxes\
│   ├── state\
│   ├── logs\
│   └── ...
├── m365-sharepoint\                  # → mirrored to m365-sharepoint-archive (future)
│   └── ...
├── entra\                            # → mirrored to entra-snapshots (future)
│   └── YYYY-MM-DD\
├── azure\                            # → mirrored to azure-snapshots (future)
│   └── YYYY-MM-DD\
├── drill-log.md                      # SHARED — monthly restore drill records
├── _alerting\                        # SHARED — heartbeat / failure metadata
│   ├── .last-success-email
│   ├── .last-success-sharepoint
│   ├── .last-success-entra
│   └── .last-success-azure
└── _logs\                            # SHARED — log retention is per-pipeline but root dir is shared
    └── ...
```

Each `<workload>` subfolder is the responsibility of its own script.
The `_alerting\` and `drill-log.md` files are shared infrastructure.

## Open follow-ups (cross-workload)

| Task | Notes |
|---|---|
| Write `scripts/setup-backup-cloud.sh` | Provisions `skintyeebackups` storage account + the five containers + immutability policies + a write-only SAS per container + Application Insights `ai-backup` + Action Group `ag-backup-critical` + heartbeat alert rules. Idempotent. **Replaces what was originally scoped as five separate per-workload `setup-*-cloud.sh` scripts** — one script for the whole backup infrastructure, then each per-workload script just registers its Entra app + script. |
| Write `scripts/setup-backup-server.ps1` | Server 2022 install: PS 7, azcopy, BitLocker on `D:`, service account `svc-backups` (one account for all four pipelines), the `D:\backups\` directory tree, the Task Scheduler entries (one per workload), the heartbeat-log-rotation task. |
| Write each per-workload script | One bash to create the Entra app + grant scopes + push the .ps1; one .ps1 for the actual backup work. Per [`../365/email-backup.md`](../365/email-backup.md), [`../365/entra-backup.md`](../365/entra-backup.md), [`./azure-backup.md`](./azure-backup.md). |
| Document recovery runbook | A consolidated `docs/devops/disaster-recovery.md` covering Scenario C (full subscription rebuild) for *all five* workloads — uses snapshots from all five containers as recovery inputs. |
| Wire SharePoint backup planning | `docs/365/sharepoint-backup.md` — needs design pass on storage sizing, dedup strategy, retention (could be the biggest single line item) |

## See also

- [`./deploy-architecture.md`](./deploy-architecture.md) — the deployment
  side (this doc is the backup side)
- [`./azure-naming.md`](./azure-naming.md) — Azure resource naming rules
  + Skin Tyee's conventions
- [`../365/email-backup.md`](../365/email-backup.md) — workload #1, the
  one being built first
- [`../365/entra-backup.md`](../365/entra-backup.md) — workload #3
- [`./azure-backup.md`](./azure-backup.md) — workload #4
- [`./postgres-backup.md`](./postgres-backup.md) — workload #5 (Phase 2; Microsoft's 7-day PITR covers the near-term floor)
- `../365/sharepoint-backup.md` — workload #2 (future)
- The architecture PDF [`../SkinTyee.drawio.pdf`](../SkinTyee.drawio.pdf)
  — page 2 has the original "Backup Server (Physical, Onsite)" + "Email
  Backup Azure Storage (Cloud)" sketch this implements
