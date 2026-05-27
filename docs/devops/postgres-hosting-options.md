# Postgres hosting options on Azure (and why we picked Flexible Server)

The full landscape of "where do we run PostgreSQL for the
`api/` stack" and the trade-off math that led us to **Azure
Database for PostgreSQL — Flexible Server (B1ms, Burstable)**.

Companion to [ADR-7](../architecture-decisions.md#adr-7--api-nestjs--prisma--azure-mysql-contract-first-openapi)
(which picks the broader API stack) and
[`deployment-plan.md`](./deployment-plan.md) (which captures the
Container Apps + Postgres deploy plan).

## TL;DR — what we picked + why

- **Azure Database for PostgreSQL — Flexible Server, B1ms (Burstable)** with **PostGIS** allowlisted.
- **~$18 CAD/month** at the floor of "boring and right."
- Managed: Microsoft owns patching / backups / HA failover / OS;
  we own schema / users / data.
- PostGIS-capable (required by ADR-7 for land-allocation / mapping).
- Single billing surface, same Microsoft tenant as everything else.

## The full options landscape (Azure-first, with AWS / third-party fallbacks)

| Option | What it is | Min cost (USD/mo) | When to pick it |
|---|---|---|---|
| **Azure Database for PostgreSQL — Flexible Server (Burstable)** ← chosen | Managed PaaS, B/D-series VM under the hood, PostGIS supported | **~$13** (B1ms) | Default for any standard Postgres workload at small / mid scale |
| Azure Database for PostgreSQL — Flexible Server (General Purpose / Memory Optimized) | Same product, bigger SKUs | $90+ | Production workloads needing dedicated compute, HA, predictable perf |
| Azure Database for PostgreSQL — **Single Server** | Older PaaS — **deprecated, retiring** | n/a | Don't use; Microsoft is sunsetting it |
| **Azure Cosmos DB for PostgreSQL** (formerly Citus Hyperscale) | Distributed Postgres — horizontal scaling across nodes | ~$200 (smallest cluster) | Petabyte scale, low-latency multi-region, >5K writes/sec |
| Azure VM running self-managed Postgres | You install + run Postgres on a B1ls or bigger VM | **~$7** (B1ls VM) + ops time | Only if you have ops staff who want full control + are OK owning backups / patching / HA / monitoring |
| Azure Arc-enabled PostgreSQL | On-prem / hybrid Postgres with Azure control plane | varies | Existing on-prem DB you want to govern from Azure |
| **Azure does NOT have true serverless Postgres** | (There's Azure SQL Database serverless — but that's SQL Server, not Postgres) | — | If you want scale-to-zero Postgres in 2026, cross to AWS Aurora Serverless or third-party Neon / Supabase |

## Why Flexible Server B1ms (over each alternative)

### vs Self-managed Postgres on a VM (~$7/mo)

- **Save:** $5–10/mo
- **Cost:** Hours/year of ops attention for patching, backups,
  failover, monitoring, security CVEs, OS upgrades, certificate
  rotation. Each of those is solved-and-forgotten on Flexible
  Server.
- **Verdict:** bad trade. Postgres ops is one of those problems
  the world has paid for already.

### vs Cosmos DB for PostgreSQL (~$200/mo)

- Designed for **distributed Postgres** (Citus extension under the
  hood). Multi-node, automatic sharding, multi-region writes.
- **Save:** nothing — costs ~10× our entire other infra combined.
- **Cost:** Massive overspec — we'll have one Container App writing
  single-digit writes/sec to one DB.
- **Verdict:** revisit only at >5K writes/sec sustained or
  petabyte-scale data.

### vs AWS Aurora Serverless (~$0 idle, $0.06/ACU-hour)

- Aurora Serverless v2 is genuinely impressive: scales to zero,
  pay-per-second.
- **Save:** ~$10/mo at POC scale (idle most of the day)
- **Cost:** Second cloud vendor. Second IAM model. Second billing
  surface. Second org for the team to track. Network egress between
  Azure Container App ↔ AWS Aurora = additional latency + bandwidth
  charge. Cross-cloud secrets management.
- **Verdict:** not worth the complexity for one component.

### vs Neon / Supabase (third-party Postgres SaaS, free tier each)

- Both have generous free tiers and serverless / scale-to-zero
  semantics — would be cheap, even free, for the POC.
- **Save:** ~$18/mo (the entire Flexible Server cost)
- **Cost:** Third-party vendor (not Microsoft). Org policy
  preference is first-party Azure where reasonable for governance
  + audit-log + identity reasons. Also adds another secret to
  rotate (connection-string format secrets, not workload-identity).
- **Verdict:** would consider for personal projects; not for this org.

### vs "Just stick it in the Container App as a sidecar"

- Tempting at POC scale, but Container Apps don't have persistent
  volumes by default — Postgres data would evaporate on restart.
- **Verdict:** never appropriate for production data. Even at POC
  scale, this is the kind of "save $13/mo, lose all data on a
  Container App revision swap" decision you regret.

## What "Flexible Server is VM-priced" actually means

Yes, B1ms = "burstable, 1 vCPU, 2 GB RAM" — the same nomenclature
as a B1ms VM. Pricing tracks compute hours.

But the operational surface is **purely managed**:

| Operational concern | On a self-managed VM | On Flexible Server |
|---|---|---|
| OS patching | You schedule + test + run | Microsoft, transparent |
| Postgres minor-version upgrades | You schedule downtime | Microsoft, transparent |
| Postgres major-version upgrades | You do `pg_upgrade` + test | Microsoft offers in-place via portal/CLI |
| Backups | You write wal-g / barman cron | Automatic, 7-day point-in-time retention free, configurable up to 35 days |
| Restore | You restore from your S3/blob backup | Click "Restore" in portal, pick a timestamp |
| HA | You set up streaming replica + failover | Toggle HA on, get zone-redundant standby + auto-failover |
| Monitoring | Prometheus + Grafana, your problem | Azure Monitor built in, free baseline metrics |
| Storage scaling | You resize the VM disk + grow the FS | Click "+ Add storage", no downtime |
| TLS / cert rotation | You renew certs every 60–90 days | Managed, you flip "Require SSL" on and forget |

You're paying for the **management plane**, not the VM. The "VM
pricing tier" naming is honest about the underlying compute but
hides ~6 categories of operational tax that managed services
absorb.

## When we'd reconsider

| Trigger | Move to |
|---|---|
| Sustained >100 concurrent connections | Flexible Server **General Purpose** D2s_v3 (~$90/mo) |
| Need HA / zone redundancy | Flexible Server with **HA enabled** (~2× cost, ~$36/mo on B1ms) |
| App data grows beyond ~100 GB | Bump storage on the existing server (independent of compute tier) |
| App becomes write-heavy across regions | Cosmos DB for PostgreSQL (real distributed scaling) |
| Want pure scale-to-zero | AWS Aurora Serverless or Neon (cross-cloud) — likely never for this org |
| Postgres becomes hardware-bound at single-node | Cosmos DB for PostgreSQL (multi-node) |

## Phase 2 follow-ups (after POC validates)

Not blocking the deploy, but worth scheduling:

- **Backup retention bump** — from 7 days to 14 or 35 days
  (negligible cost, real DR value).
- **HA enable** — when the app is in real production, the ~$18 →
  ~$36/mo cost buys an auto-failover replica in a different
  availability zone. Single-AZ failure goes from "outage" to
  "30-second blip."
- **Connection pooling** — Flexible Server includes built-in
  PgBouncer; turn it on when concurrent connections grow.
- **Entra ID auth** — replace the `pgadmin` / password admin user
  with an Entra-ID-authenticated user. Brings Postgres into the
  same identity surface as everything else; password rotation
  goes from "manual" to "Entra revokes on offboard."

## See also

- [`../architecture-decisions.md` § ADR-7](../architecture-decisions.md#adr-7--api-nestjs--prisma--azure-mysql-contract-first-openapi)
  — the broader API stack decision (NestJS + Prisma + Postgres + Entra)
- [`deployment-plan.md`](./deployment-plan.md) — the Container Apps + Postgres deploy plan (cost table + Phase 1 steps)
- [`deploy-architecture.md`](./deploy-architecture.md) — bird's-eye map (Postgres appears in the hosting service summary)
- [`deploy-status.md`](./deploy-status.md) — point-in-time state; Postgres provisioning happens in Step 3 (`setup-api-azure.sh`)
