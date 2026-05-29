# Azure resource config backup — planning doc

Fourth unit of work in the Skin Tyee backup architecture, alongside:

| # | What | Doc | Status |
|---|---|---|---|
| 1 | **M365 email/calendar/contacts** (Exchange Online — content data) | [`docs/365/email-backup.md`](../365/email-backup.md) | Doc done; scripts not yet written |
| 2 | **M365 SharePoint** (org docs — content data) | `docs/365/sharepoint-backup.md` (future) | Planning stub not yet written |
| 3 | **Entra ID** (users, groups, roles, app registrations — identity + config data) | [`../365/entra-backup.md`](../365/entra-backup.md) | Planning stub done |
| 4 | **Azure resource config** (resource definitions, RBAC, policies — Azure-side config data) | **This doc** | Planning stub (this doc) |

> **Status:** planning / scoping. Implementation not yet done. This doc
> exists so the work isn't forgotten and so we don't restart from a blank
> page when we pick it up.

All four are stored in the same Azure storage account
(**`skintyeebackups`**) but in separate containers — one immutability
policy, one set of credentials, one monitoring story. See
[`./azure-naming.md`](./azure-naming.md) for the storage account naming
decision.

---

## Why this is its own unit of work

The three other backup units handle distinct shapes of data:

- **Email backup** handles **content** (immutable stream of messages,
  append-only, delta-synced).
- **Entra backup** handles **identity + tenant config** (small, highly
  structured, daily snapshots in git).
- **Azure resource backup** handles **resource config** (ARM/Bicep
  definitions for every resource we provision: Container Apps, Postgres,
  storage accounts, SWAs, ACR, role assignments, alert rules, etc.).

Same JSON-snapshot-to-git pattern as Entra backup, but the **API surface
is completely different** (Azure Resource Manager + Azure Resource Graph
instead of Microsoft Graph), so it gets its own script + its own doc.

---

## What's in scope

### Tier 1 — must back up

Everything that, if lost, requires hours-to-days to rebuild from memory
+ git archaeology:

| Resource | Why it matters | How to capture |
|---|---|---|
| **All resources in `skintyee-prod-rg`** — full ARM template | The Skin-Tyee-shape of our infrastructure: every Container App's image, env vars, ingress config, scale rules, target ports; every SWA's hostname bindings; the Postgres server's SKU + firewall rules; ACR + its replication; managed certs; etc. | `az group export --resource-group skintyee-prod-rg --include-parameter-default-value` → one big JSON, but **also** per-resource exports for diff-friendliness |
| **Per-resource snapshots** (individual `az X show -o json` for each resource) | Easier to diff line-by-line than the giant group export | `az resource list -g skintyee-prod-rg` → loop → `az resource show --ids <id> -o json` |
| **RBAC role assignments** (who has Contributor on what) | After tenant compromise / rebuild, this is exactly the list "who got what perms"; impossible to reconstruct from memory | `az role assignment list --scope <subscription/rg/resource> -o json` |
| **Container App revision history** (image SHAs deployed over time) | Lets us see "production was on image sha-X before someone pushed sha-Y" — useful for audit + rollback planning | `az containerapp revision list` per app |
| **Managed certificate metadata** (which custom domain → which cert ID) | After custom domain re-binding, we'd want to see the chain of who-was-bound-where | already in the per-resource snapshot above |
| **Application Insights config + dashboards** | Org-specific monitoring config | per-resource snapshot |
| **Action Groups + Alert rules** (the alerting paths themselves) | The "how do we get told something's broken" config | per-resource snapshot |

### Tier 2 — nice to have

| Resource | Notes |
|---|---|
| **Subscription-level policy assignments** | If we ever add Azure Policy to enforce org-wide standards |
| **Diagnostic settings** (which resources are exporting metrics/logs to which Log Analytics) | Currently we don't have any; if we add them, capture |
| **Network Security Groups, VNet config** | We're currently flat-public (Container Apps + SWAs only); if/when we add a VNet, capture |
| **Cost-management exports + budgets** | Org accounting — would be useful for audits |

### Explicitly out of scope

| Item | Why not |
|---|---|
| **Postgres data** (the rows in the database) | Microsoft's PITR (point-in-time restore) for Flexible Server already provides 7 days of automatic backups, restorable to any second. If we want longer retention, that's `pg_dump` to Blob storage — a separate, content-data pipeline, not a config-snapshot one. |
| **Blob storage contents** (the `m365-email-archive` files etc.) | They ARE the backup — backing up the backup creates an infinite regress. Their durability comes from Azure Blob's 99.999999999% (eleven 9s) durability spec + the 90-day immutability policy. Offsite copy: we'd need a different cloud (S3, GCS). Out of scope for Phase 1. |
| **ACR image blobs** (the actual Docker layers) | ACR has its own redundancy + retention; we don't try to mirror the binary image data. Just the metadata (which tag → which sha at which time). |
| **Secret VALUES** (Container App secrets, Postgres password, SP client secrets, SAS tokens) | Live in 1Password (the durable source of truth) + the ADO variable group (the operational copy). The Azure config snapshot records that secret `anthropic-api-key` exists on `lookup-prod` — not its value. |
| **Active runtime state** (which container revision is actively serving traffic right now; which replicas are healthy) | This is observable from logs + Application Insights, not config. Restoring "the state at time T" means restoring config + restarting; the system converges to the new running state on its own. |

---

## Approach (sketch)

A nightly bash script — `scripts/azure-backup/snapshot-azure.sh` — runs
either:

- **On the Server 2022** (alongside the M365 backup) — uses az CLI +
  authenticates as a read-only SP `skintyee-azure-backup`. Output
  written to `D:\Azure-Backups\` then mirrored to `azure-snapshots`
  container in `skintyeebackups`.
- **OR as an ADO pipeline** — `azure-pipelines/azure-config-snapshot.yml`
  on a daily schedule. Output committed to a private git repo (the same
  `webfront` repo's `.snapshots/azure/` branch, or a dedicated repo).

Probably both eventually, but Phase 1 is just the Server 2022 path (one
fewer system to depend on, matches the email backup pattern).

### Output layout

```
D:\Azure-Backups\
  YYYY-MM-DD\                              # one snapshot per day
    subscription.json                       # subscription metadata
    rg-skintyee-prod-rg\
      _group-export.json                    # az group export — single giant ARM template
      resources\
        Microsoft.App-containerApps-api-prod.json
        Microsoft.App-containerApps-lookup-prod.json
        Microsoft.App-managedEnvironments-skintyee-prod-env.json
        Microsoft.App-managedEnvironments-skintyee-prod-env-managedCertificates-mc-...
        Microsoft.ContainerRegistry-registries-skintyeeprodacr.json
        Microsoft.DBforPostgreSQL-flexibleServers-skintyee-prod-pg.json
        Microsoft.Storage-storageAccounts-skintyeebackups.json
        Microsoft.Web-staticSites-skintyee-prod-app.json
        Microsoft.Web-staticSites-skintyee-prod-lookup-app.json
        Microsoft.Insights-components-ai-m365-backup.json
        Microsoft.Insights-actionGroups-ag-m365-backup-critical.json
        ...
    rbac\
      role-assignments.json                 # full role assignments for the RG
      role-definitions.json                 # any custom roles
    container-app-revisions\
      api-prod.json                         # revision history (image SHAs + times)
      lookup-prod.json
    _manifest.json                          # script version, snapshot timestamp, checksums
  YYYY-MM-DD-diff.json                      # daily diff vs previous snapshot — added/removed/modified resources
```

### Daily diff report

Like Entra backup, the script writes a `_diff.json` summarizing what
changed since the previous snapshot — sent as an HTML email to
`it@skintyee.ca`. Example diff content:

```json
{
  "added": [
    "Microsoft.App/containerApps/new-experiment-prod"
  ],
  "modified": [
    {
      "id": "Microsoft.App/containerApps/api-prod",
      "field": "properties.template.containers[0].image",
      "from": "skintyeeprodacr.azurecr.io/api:eccfd9b...",
      "to":   "skintyeeprodacr.azurecr.io/api:56d17b7..."
    }
  ],
  "removed": []
}
```

— so the IT lead sees "yesterday we deployed api commit 56d17b7" without
needing to know git or read the ADO pipeline page.

---

## Restore scenarios

### A. "What was X configured as on date Y?"

Find date Y in the local snapshot folder, open the relevant
per-resource JSON. Done. This is the 80% case — "did anyone change the
firewall rule on the Postgres server in the last month?" type queries.

### B. Rebuild after accidental deletion

Someone (a script bug, a malicious admin, or a misclick) deletes the
`api-prod` Container App.

1. Find the most recent snapshot of `Microsoft.App-containerApps-api-prod.json`
2. Use it as input to `az resource create --properties @api-prod.json`
3. Re-bind the custom domain (`az containerapp hostname add` + `bind`)
4. Restore the secret VALUE from 1Password (the snapshot only records
   that the secret existed, not its value)
5. Trigger a deploy pipeline to swap in the actual image

This is faster than recreating from memory, and the snapshot is the
authoritative "what was the exact config we wanted" reference.

### C. Full subscription rebuild after a tenant-wide catastrophe

Worst case — we've lost the entire `skintyee-prod-rg`. The snapshot is
the recovery runbook + input data:

1. Run `az group create -n skintyee-prod-rg -l canadacentral` on the
   new subscription
2. Run `az deployment group create --template-file _group-export.json`
   using the most recent snapshot
3. Reconnect secrets from 1Password to each Container App
4. Re-bind custom domains (DNS in GoDaddy is unaffected, so this is just
   `az containerapp hostname add` + `bind` again — minutes of work, not
   hours of figuring out what was bound where)
5. Trigger all pipelines to swap in real images

Without the snapshot: every Container App config is "what do I remember
about ingress and target ports?" With the snapshot: every detail is a
JSON file we can directly redeploy.

### D. Audit / governance

"Show me every role assignment change on production in the last 90
days." Diff `rbac/role-assignments.json` between snapshots.

This is the kind of question NGO boards + auditors ask. Having the data
already-captured turns a half-day project into a 5-minute grep.

---

## Cost projection

Snapshots are tiny by data standards:

- Per-day full snapshot of all `skintyee-prod-rg` resources: **<5 MB**
- 365 days = **~2 GB/year**
- 3-year retention = **6 GB**

| Cost line | Year 1 |
|---|---|
| Storage (Azure Blob, Cool tier in `skintyeebackups`) | < $1/year |
| Bandwidth (no egress in steady state) | $0 |
| Software | $0 |
| Maintenance time (script updates, drill reviews) | ~1 hour/quarter |

Effectively free. The work is writing the script + restore drills, not
storage cost.

---

## Open follow-ups

| Task | Notes |
|---|---|
| Decide the Entra app name + scope: `skintyee-azure-backup` | Read-only `Reader` on the subscription is enough for `az resource list` + `az group export` + most config reads. NO `Owner`, NO write scopes. |
| Write `scripts/azure-backup/snapshot-azure.sh` | The nightly snapshot job |
| Decide: ADO pipeline OR Server 2022 task | Phase 1: Server 2022 (matches email backup); Phase 2 consideration: ADO pipeline for redundancy. |
| Decide where the per-day snapshots live for change history | Probably committed to a private repo (could be the `webfront` repo on a `.snapshots` branch, or a dedicated `infra-snapshots` repo). Need to think about git repo bloat at 365 days × 5 MB = 1.8 GB/year. |
| Build the daily diff report + email | The HTML email pattern matches what the Entra backup will use; possibly factor out into a shared helper |
| Build the recovery runbook for Scenario C | A separate doc `docs/devops/disaster-recovery.md` documenting the full subscription rebuild from snapshots — same pattern as the Entra recovery doc |

---

## See also

- [`./azure-naming.md`](./azure-naming.md) — Azure resource naming rules
  + Skin Tyee's conventions + the `skintyeebackups` decision
- [`../365/email-backup.md`](../365/email-backup.md) — the M365 mail
  backup (same overall pattern but Microsoft Graph, not ARM)
- [`../365/entra-backup.md`](../365/entra-backup.md) — Entra ID config
  snapshot (same shape as this, different API surface)
- [`./deploy-architecture.md`](./deploy-architecture.md) — what we're
  actually backing up the config of
- [Azure Resource Manager export documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/export-template-portal)
- [Azure Resource Graph](https://learn.microsoft.com/en-us/azure/governance/resource-graph/overview) — fast queries across all resources in the tenant
