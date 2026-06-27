# Hosting cost record — skintyee.ca website

**Prepared:** 2026-05-21
**Purpose:** Cost basis and justification for the website hosting expense, kept
as supporting documentation for business expense / tax substantiation.
**Provider:** Microsoft Azure · **Region:** Canada Central · **Currency:** USD

> **Note on evidence:** the figures below are the planned cost basis. The
> authoritative receipts for a tax claim are the **monthly itemized Azure
> invoices** (Azure Portal → Cost Management + Billing → Invoices). This
> document records *what* is being paid for and *why* it is a necessary business
> expense; attach the actual invoices alongside it.

## What the expense is for

Hosting the Skintyee First Nation public website (`skintyee.ca`) — a self-hosted
WordPress site migrated from the previous Site123 service. Hosting is required
to operate the organization's website (information, news, leadership, programs).

## Architecture (decision: managed database)

The site is **headless**: WordPress is the content **CMS** (`cms.skintyee.ca`) and
a **Next.js** frontend (`skintyee.ca`) renders it. Both run as Docker containers on
an Azure VM. WordPress's database is a **managed Azure Database for MySQL –
Flexible Server** — **WordPress requires MySQL and cannot use Postgres**, so it
needs its own server. (The separate `api/` service uses the existing managed
**PostgreSQL** server `skintyee-prod-pg`, billed under the API — not here.) The
headless rebuild added the Next.js frontend but **did not change the database
cost**: the same managed MySQL is used. See [`../CLAUDE.md`](../CLAUDE.md) and
`website/docker-compose.prod.yml`.

### Why the managed database was chosen

As a **non-profit (NGO)**, hosting is an operating expense that is **tax
deductible**, so the decision was made to **prioritize easy backups and
auditability over minimizing cost**. The managed Flexible Server is preferred
specifically because it provides:

- **Easy backups** — automated daily backups with **point-in-time restore**
  (7–35 day window), no scripts or operator action required.
- **Auditability** — a managed backup/restore history, server logs, and clear
  per-resource billing line items suitable for financial and operational audit.

A self-managed database container would be cheaper but would put backup
reliability and audit trail on the operator; for an NGO that must be able to
demonstrate good stewardship of its data and funds, the managed service's
predictability is worth the higher cost.

## Itemized monthly & annual cost basis

All prices approximate, USD, Canada Central, as of 2026-05-21. Source:
[Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/).

| Line item | Spec | Monthly | Annual (×12) |
|---|---|--:|--:|
| App VM (WordPress CMS + Next.js, Docker) | B1ms · 1 vCPU / 2 GB | $16 | $192 |
| Managed OS disk | 64 GB Premium SSD | $10 | $120 |
| Azure DB for MySQL – Flexible Server | Burstable B1ms · 32 GB + backups | $25 | $300 |
| Blob storage (wp-content backups) | a few GB | $2 | $24 |
| Egress / bandwidth | low-traffic site | $3 | $36 |
| **Total — recommended starting tier** | | **~$56** | **~$672** |

### Headroom tier (if traffic grows)

| Line item | Spec | Monthly | Annual (×12) |
|---|---|--:|--:|
| App VM | B2s · 2 vCPU / 4 GB | $35 | $420 |
| Managed disk | 64 GB Premium SSD | $10 | $120 |
| Azure DB for MySQL – Flexible Server | Burstable B2s · 64 GB | $50 | $600 |
| Blob + egress | | $5 | $60 |
| **Total — headroom tier** | | **~$100** | **~$1,200** |

## Optional add-on — Remote desktop (Apache Guacamole)

Browser-based remote desktop into band PCs — the app's **Assets → Devices →
Browser** connect mode. The software is free; the cost is the host plus, if it's
cloud-hosted, a VPN back to the office so it can reach the on-prem PCs. Full
breakdown + deploy: [`guacamole/README.md`](../guacamole/README.md).

| Line item | Spec | Monthly | Annual (×12) |
|---|---|--:|--:|
| Apache Guacamole | Apache 2.0 OSS — unlimited users | \$0 | \$0 |
| Host — **on-prem** LAN box (recommended) | reuse existing server | \$0 | \$0 |
| Host — Azure VM alternative | `B1ms` 1 vCPU / 2 GB | \$15 | \$180 |
| Database | reuse `skintyee-prod-pg` (new `guacamole_db`) | \$0 | \$0 |
| VPN to office (**only** if cloud-hosted) | Azure VPN Gateway *Basic* | \$27 | \$324 |
| **Total — on-prem host** | | **~\$0** | **~\$0** |
| **Total — Azure-hosted** | | **~\$42** | **~\$504** |

On-prem hosting is \$0 extra and is the only option that reaches the on-prem
fleet without a VPN; Azure hosting adds the VM + a site-to-site VPN. Not deployed
yet — costs apply only if/when the Browser connect mode is turned on.

## Notes

- One-time / usage-based items not included above: domain registration
  (`skintyee.ca`) renewal, and any data egress above the low-traffic estimate.
- These are projections; reconcile against the actual monthly invoices.
- A lower-cost equivalent on DigitalOcean (droplet + managed MySQL) runs
  ~$33/mo if the hosting provider is changed later.
