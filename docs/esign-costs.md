# E-signature cost record — self-hosted OpenSign (`esig.skintyee.ca`)

**Purpose:** cost basis for the band's **e-signature** capability — a
self-hosted **OpenSign** instance that collects signatures on band documents
(onboarding forms, NDAs, TD1/TD1BC, employment records). Decision + compliance
rationale: **ADR-17** in
[`architecture-decisions.md`](architecture-decisions.md). One-page summary of
all costs: [`pricing-overview.md`](pricing-overview.md).

This is an **ordinary operating expense, 100% tax-deductible** under Canadian law
(current expense, not capital — same s.9 / s.18(1)(a) framing as the website
hosting; see [`365/pricing.md`](365/pricing.md#canadian-tax-treatment--100-deductible)).
Not tax advice.

## What the expense is for

- **OpenSign** — an open-source (AGPL-3.0) e-signature platform, **self-hosted**
  so signer data stays in the band's own tenant rather than a third-party SaaS.
  Replaces a per-seat subscription like **DocuSign / Adobe Acrobat Sign**.
- **Document storage is NOT a line here** — the band's documents (and the
  completed, sealed PDFs) live in **SharePoint**, which is already part of the
  **Microsoft 365** subscription. SharePoint storage is therefore **$0
  incremental** (see [`365/pricing.md`](365/pricing.md)).

## Architecture (decision: all-in-one VM — ADR-17)

OpenSign's four containers — Parse Server backend, React UI, **MongoDB**, and
**Caddy** (reverse proxy + automatic Let's Encrypt TLS) — run via **Docker
Compose** on a single small **Azure VM**, mirroring the website host. Persistent
data (Mongo + OpenSign's local document store) sits on **Azure Files** volumes
so it survives VM rebuilds and is backed up independently. The completed sealed
PDF is handed off to the SharePoint library via Microsoft Graph.

- **Why self-host (not DocuSign/Adobe Sign):** signer data stays in-tenant;
  fixed small VM cost instead of per-seat SaaS; fits the NGO own-your-data +
  auditability priority. **MongoDB runs in a container** (OpenSign requires
  Mongo, not a relational DB), so there is **no managed-DB licence cost**.

## Itemized monthly & annual cost basis

Azure PAYG list prices, `canadacentral`, converted to CAD (~1.36 USD→CAD).
Confirm against the actual invoice; reserved-instance commitments can cut the VM
~40%.

### Recommended starting tier

| Line item | Spec | Monthly (CAD) | Annual (×12) |
|---|---|--:|--:|
| App VM (OpenSign Compose: Parse + UI + Mongo + Caddy) | **B2s** · 2 vCPU / 4 GB | ~$42 | ~$504 |
| Managed OS disk | 64 GB Standard SSD | ~$10 | ~$120 |
| Azure Files (Mongo data + OpenSign doc store) | a few GB, Standard SMB | ~$3 | ~$36 |
| Egress / bandwidth | low-volume internal use | ~$2 | ~$24 |
| MongoDB | container on the VM | **$0** | **$0** |
| TLS certificate | Caddy / Let's Encrypt | **$0** | **$0** |
| DNS (`esig.skintyee.ca`) | record in the existing Azure DNS zone | **$0** | **$0** |
| SharePoint document storage | included in Microsoft 365 | **$0** | **$0** |
| **Total — recommended starting tier** | | **~$55–60** | **~$660–720** |

### Lean tier (if the B1ms fits the load)

| Line item | Spec | Monthly (CAD) | Annual (×12) |
|---|---|--:|--:|
| App VM | **B1ms** · 1 vCPU / 2 GB | ~$22 | ~$264 |
| Disk + Azure Files + egress | as above | ~$13 | ~$156 |
| **Total — lean tier** | | **~$35–40** | **~$420–480** |

> ⚠️ **B1ms is tight** — MongoDB + Parse + a React build + Caddy on 2 GB RAM
> will be sluggish and risks OOM under concurrent signing. Use it only for a
> light proof-of-concept; **B2s is the recommended baseline.**

### Managed-DB variant (optional, lower-risk Mongo)

If `mongodump`-backed MongoDB on Azure Files (see ADR-17 caveat) ever shows
trouble, move the database off the VM:

| Line item | Spec | Monthly (CAD) | Annual (×12) |
|---|---|--:|--:|
| App VM | B2s | ~$42 | ~$504 |
| **Cosmos DB for MongoDB (vCore M10)** | managed, ~US $14 | ~$19 | ~$228 |
| Disk + Files + egress | | ~$15 | ~$180 |
| **Total — managed-DB variant** | | **~$75–80** | **~$900–960** |

> Note: Cosmos's Mongo API has compatibility gaps vs. real MongoDB; **verify
> Parse Server runs cleanly on it** before adopting (ADR-17).

## Notes

- **No per-seat / per-signature fees** — the OpenSign **community (self-host)
  edition is free with unlimited signatures** (AGPL-3.0). Two features to verify
  before relying on them, both flagged in ADR-17: **(1)** the self-host **API /
  programmatic access may be gated to a paid plan** (needed for app→OpenSign
  automation — UI signing works without it); **(2)** **Entra ID SSO (OIDC)** may
  be a paid/unsupported feature in the community edition.
- **SharePoint = $0 incremental.** Document storage rides the existing M365
  licences; this record covers only the OpenSign compute.
- **Backups:** budget no extra line — Mongo logical backups (`mongodump`) and the
  Azure Files snapshots go to the existing backup Blob (see the backup runbook).
- **Currency:** Azure is quoted in USD; figures here are CAD estimates. Confirm
  on the invoice.
- **Evidence for tax:** the authoritative record is the **Azure invoice** — keep
  it with these docs.
