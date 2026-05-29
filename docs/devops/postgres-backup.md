# Postgres database content backup — planning doc

The fifth backup workload, alongside the four cataloged in
[`./backup-architecture.md`](./backup-architecture.md). Different shape
(database rows, not files; SQL dumps, not JSON snapshots) → separate
script + separate retention policy, but lands in the same storage
account `skintyeebackups`.

> **Status:** planning / scoping. Implementation deferred to Phase 2.
> This doc exists so the design intent is captured before the work
> starts, and so the deployment plan's Phase 2 Postgres item links to
> a real planning document rather than a one-line bullet.

---

## Why this is separate from the other four backup workloads

The four backup workloads in [`./backup-architecture.md`](./backup-architecture.md)
all handle **content that's reachable via an HTTP API** (Microsoft Graph
for M365 + Entra; Azure Resource Manager for Azure config). They share
a script + storage + monitoring pattern.

Postgres is different:

- **Direct database protocol** (TCP-level Postgres wire protocol), not
  an HTTP API
- **`pg_dump` / `pg_restore`** tooling, not Graph queries
- **Content data, not config** — the rows in the `api` database, which
  is product-state for the NestJS api
- **Different retention math** — schema migrations make old dumps
  partially incompatible; the retention horizon meaningfully shorter
  than "keep email forever"

So same storage account, different container, different script, but
the design pattern is distinct enough to warrant its own doc.

---

## Defence in depth: what Microsoft already does for free

Before we build anything, the floor of protection from Azure Postgres
Flexible Server is **not zero**:

| Mechanism | What it gives us | Retention |
|---|---|---|
| **Automated daily backup** | Microsoft writes a backup of `skintyee-prod-pg` daily to geo-redundant storage Microsoft manages | **7 days** by default (configurable up to 35 days) |
| **Point-in-Time Restore (PITR)** | Restore to any second within the retention window | Same 7-day window |
| **Geo-redundant backup** (optional, paid) | If enabled (we currently haven't), the backup is also available in a paired region for disaster scenarios | Same window |
| **High availability** (optional, paid) | Hot standby in a paired AZ | n/a — different concern (uptime) |

**For most "oops" scenarios, PITR is what we'd use** — it's faster,
simpler, and doesn't require us to operate any backup infrastructure.

**Where PITR falls short:**

| Scenario | Why PITR isn't enough |
|---|---|
| Need to recover from > 7 days ago | The PITR window ends |
| Need to recover after the SERVER is destroyed (not just data corruption) | The PITR backup lives with the server; if we accidentally delete the server, the backup goes too. (35-day retention helps marginally.) |
| Compliance / audit needs a quarterly snapshot for legal hold | PITR isn't a snapshot — it's a continuous restore stream |
| Want to restore to a completely separate Azure subscription / tenant | PITR is in-tenant only |
| Want to be able to recover even if Microsoft has a major incident affecting their backup infrastructure | A single cloud provider is a single point of failure |

For those, we need our own pg_dump.

---

## What's in scope

| Item | In/out | Notes |
|---|---|---|
| **`api` database** (the NestJS schema + data) | ✅ In | The thing we're protecting |
| **Future databases** added to `skintyee-prod-pg` | ✅ In (auto) | Script loops over `pg_database` |
| **Postgres extension state** (PostGIS) | ✅ In | `pg_dump` captures `CREATE EXTENSION` statements |
| **Server-level config** (parameters, firewall rules, admin user) | ❌ Out | Covered by [`./azure-backup.md`](./azure-backup.md) (workload 4) — that's config data, not content |
| **Server-level secrets** (admin password) | ❌ Out | Lives in 1Password + ADO variable group (see [`./azure-naming.md`](./azure-naming.md)) |

---

## Approach (sketch)

A nightly bash script — `scripts/postgres-backup/dump-and-upload.sh` —
runs on the **Server 2022** (alongside the other backup pipelines) and:

1. Connects to `skintyee-prod-pg` via the Postgres wire protocol from
   the Server 2022's public IP (need a firewall rule on the Postgres
   server allowing the server's egress IP)
2. Runs `pg_dump --format=custom --compress=9 api` → outputs a
   `.dump` file
3. Encrypts at rest with the Server 2022's GPG key
4. Stages to `D:\backups\postgres\<yyyy-mm-dd>\api.dump.gpg`
5. Uploads to `postgres-dumps` container in `skintyeebackups` with the
   same write-only SAS + 90-day immutability pattern as the other
   workloads
6. Pushes the `postgres_backup_success_total` metric to Application
   Insights → shared Action Group `ag-backup-critical`

### Retention layout

```
skintyeebackups (storage account)
└── postgres-dumps  (new container, alongside the four in backup-architecture.md)
    ├── daily\YYYY-MM-DD\api.dump.gpg     — keep 30 days then prune
    ├── weekly\YYYY-WW\api.dump.gpg       — Sunday's daily promoted to weekly; keep 13 weeks
    ├── monthly\YYYY-MM\api.dump.gpg      — 1st of month promoted; keep 24 months
    └── yearly\YYYY\api.dump.gpg          — Jan 1 promoted; keep forever (legal hold via immutability)
```

This is the classic **GFS rotation** (Grandfather-Father-Son) — daily
cycles deduplicate against weekly/monthly cycles, capping storage growth.

For Skin Tyee's `api` database (currently small — POC with in-memory
data; even at 100K rows of real data we're talking <1 GB):

| Retention tier | Dumps kept | Total per tier | Year 1 cost |
|---|---|---|---|
| Daily | 30 | ~30 × 50 MB = 1.5 GB | <$0.10/mo |
| Weekly | 13 | ~13 × 50 MB = 0.6 GB | <$0.05/mo |
| Monthly | 24 | ~24 × 50 MB = 1.2 GB | <$0.10/mo |
| Yearly | grows | ~5 × 50 MB = 0.25 GB | <$0.05/mo |
| **Total** | | **<5 GB** | **~$0.30/mo** |

Effectively free at our scale. Re-evaluate the math when the database
grows past 10 GB.

---

## Restore scenarios

### A. "I need yesterday's data back"

Use **PITR** in the Azure portal — restores to a new server, fastest
option, no script involved. This is the 95% case.

### B. "I need data from 3 months ago"

PITR window doesn't cover it; use the local dump:

```bash
# On the Server 2022 or another Postgres-tooled host
gpg --decrypt api.dump.gpg | pg_restore --create --clean -h <newhost> -U <admin> -d postgres
```

### C. "The Postgres server was deleted and we need it back"

1. Use the **Azure config snapshot** from
   [`./azure-backup.md`](./azure-backup.md) to recreate the
   `skintyee-prod-pg` server (config restored)
2. Use the most recent `postgres-dumps` archive entry from
   `skintyeebackups` to restore the schema + data (content restored)
3. Restore the admin password from 1Password (credentials restored)

This is the proper "subscription-rebuild" recovery path — two backup
workloads cooperate (config + content).

---

## Open follow-ups

| Task | Notes |
|---|---|
| Confirm Microsoft's PITR window is set to 35 days (max), not 7 (default) | Cheap config change; widens the "use PITR" zone of the recovery tree |
| Write `scripts/postgres-backup/dump-and-upload.sh` | The nightly pg_dump script |
| Decide on GPG key management for `.dump.gpg` files | Probably the Server 2022's `svc-backups` service account's GPG key, with the private key escrowed in 1Password |
| Provision the `postgres-dumps` container in `skintyeebackups` | Done together with the other containers — see [`./backup-architecture.md`](./backup-architecture.md) |
| Configure Postgres server firewall rule allowing the Server 2022's egress IP | Required for the script to reach the database from on-prem |
| GFS rotation script | Promotes daily → weekly → monthly → yearly; prunes the daily tier |
| Restore drill — Scenario B (restore from `.dump.gpg` to a sandbox Postgres) | Monthly drill, same SOP as the other backup workloads |

---

## See also

- [`./backup-architecture.md`](./backup-architecture.md) — the bird's-eye
  map this is the fifth workload of
- [`./azure-backup.md`](./azure-backup.md) — the Azure config backup
  (cooperates with this one for full-rebuild scenarios)
- [`./deployment-plan.md`](./deployment-plan.md#phase-2--production-ready-later-after-poc-validates) — Phase 2 entry that points here
- [`./postgres-hosting-options.md`](./postgres-hosting-options.md) — why
  we picked Postgres Flexible Server in the first place
- [Postgres Flexible Server backup + restore (Microsoft docs)](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore)
- [pg_dump official docs](https://www.postgresql.org/docs/current/app-pgdump.html)
