# Entra ID backup — planning doc

Companion to [`docs/365/email-backup.md`](./email-backup.md). The email
backup script handles **message data** (mail + calendar + contacts).
This doc covers the **separate** problem of backing up **identity and
configuration** — users, groups, roles, app registrations, policies.

> **Status:** planning / scoping stub. The implementation has not been
> done yet. This doc exists so that (a) the work isn't forgotten, and
> (b) when we pick it up, we don't start from a blank page.

## Why this is a different unit of work

The email backup is about **content** — a stream of immutable message
data, flat-filed by message ID, growing over time. The right design is
"never delete, append-only, incremental delta."

Entra ID backup is about **configuration** — a relatively small but
highly-structured graph of related objects (users belong to groups,
groups have roles, roles have scopes, apps have permissions, policies
reference users + apps). The right design is "snapshot the full
configuration regularly, store as version-controlled JSON, diff between
snapshots to see what changed."

Different problem → different tooling → different doc.

## What's in scope to back up

### Tier 1 — must back up (org continuity depends on it)

| Object | Why it matters | Graph endpoint |
|---|---|---|
| **Users** (UPN, display name, mail, manager, dept, MFA methods, account-enabled flag, license assignments) | Identity inventory; without this we don't know who *was* in the tenant after a breach/wipe | `/users` |
| **Groups** (Microsoft 365 Groups, Security Groups, Mail-enabled groups) — name, membership, owners | Membership drives access to shared mailboxes, SharePoint sites, Teams | `/groups` + `/groups/{id}/members` + `/groups/{id}/owners` |
| **Directory roles + assignments** (Global Admin, User Admin, etc.) | Who can do what at the admin level | `/directoryRoles` + `/directoryRoles/{id}/members` |
| **Custom Entra roles** (if any) | Org-specific authz definitions | `/roleManagement/directory/roleDefinitions` |
| **App registrations** (display name, app ID, redirect URIs, API permissions, federated credentials, client secret metadata — NOT the secret values themselves) | Every app integration into the tenant: this repo's `skintyee-prod-deploy`, `it-project-docs-publisher`, the new `skintyee-m365-backup` etc. | `/applications` |
| **Service principals** (consents, owners, role assignments) | The grant + consent state for each app | `/servicePrincipals` |
| **Conditional Access policies** (if + when we have any) | Org-wide authn / authz rules | `/identity/conditionalAccess/policies` |

### Tier 2 — nice to have

| Object | Notes |
|---|---|
| **Tenant settings** (domain ownership records, branding, organization-wide settings) | Useful for re-provisioning if we ever move tenants |
| **Authentication methods policies** (which MFA methods allowed, etc.) | Org policy snapshot |
| **License inventory** (SKUs assigned per user) | Drives M365 billing reconciliation; we'd want this for audits |
| **B2B guest users + their host org details** | If we collaborate with external orgs via guest accounts |

### Out of scope — handled elsewhere or not needed

| Item | Why not |
|---|---|
| **Client secret values** | We deliberately do NOT export secret values. They live in 1Password (the durable source of truth). The backup notes "app X had a secret with key ID Y expiring on Z" — sufficient for audit, not a credential leak. |
| **Federated credential certificates** | Same reasoning — store in 1Password, list metadata in the backup. |
| **MFA secrets** (TOTP keys, FIDO2 attestations) | Held only in the user's authenticator app + Microsoft's HSM. Not extractable; not our problem to back up. (Recovery flow on user device loss is a re-enroll, not a restore.) |
| **Bitlocker recovery keys stored in Entra** | Already an Entra concern, but their primary safety net is 1Password (see `docs/1password/`) — Entra holds them as a convenience. |
| **Email / calendar / contacts** | Covered by [`docs/365/email-backup.md`](./email-backup.md). |
| **SharePoint / OneDrive content** | Covered by future `docs/365/sharepoint-backup.md`. |

## Approach (sketch)

A second PowerShell script — `scripts/m365-backup/Get-EntraConfig.ps1` —
runs nightly **before** the mail backup, authenticated as a **different**
Entra app (let's call it `skintyee-entra-backup`) with read-only directory
permissions:

```
Application permissions required:
  Directory.Read.All        — users, groups, roles, role assignments
  Application.Read.All      — app registrations + service principals
  Policy.Read.All           — conditional access + auth methods policies
  RoleManagement.Read.All   — custom role definitions
  Organization.Read.All     — tenant-level settings
```

Output layout:

```
D:\M365-Backups\
  entra\
    YYYY-MM-DD\                 # one snapshot per day
      users.json                # all users, full attribute set
      groups.json               # all groups + their memberships + owners
      roles.json                # directory + custom roles, their assignments
      applications.json         # app registrations (secrets/certs metadata only)
      servicePrincipals.json    # SPs + their consents
      conditionalAccess.json    # CA policies
      authMethodsPolicies.json
      tenantSettings.json
      _manifest.json            # checksums, snapshot timestamp, script version
    YYYY-MM-DD-diff.json        # change summary vs yesterday (added users, role assignments, etc.)
```

Two things that make this design useful as an audit tool:

1. **Daily snapshots committed to a git repo** (could be a private
   gitea/git on the Server 2022; or a private Azure DevOps repo with
   the variable group's SAS for write). Each commit is one day's
   snapshot. `git log` becomes a directory change history. `git diff
   2026-01-15 2026-06-15` shows everything that changed in 6 months.
2. **`_diff.json` written by the script** — explicit list of
   `{added: [...], removed: [...], modified: [...]}` per object type,
   so the IT lead's inbox gets a daily "Entra change report" with no git
   knowledge needed.

## Restore scenarios

### A. Reconstruct after a tenant-wide compromise

If a malicious admin nukes app registrations, role assignments, or user
data:

1. Pull the most recent clean snapshot from the local backup volume
2. Use the JSON as the input to a re-provisioning script — `New-MgUser`,
   `New-MgApplication`, etc., recreating objects from their JSON
3. **Secret material gets re-issued, not restored** — for each app
   registration, create a new secret/cert from 1Password; for each user,
   send a password reset email (Entra does this part natively)
4. Re-attach role assignments + group memberships from the snapshot

This isn't a one-click restore. It's a "recovery runbook with concrete
data". The snapshot makes the recovery runbook executable in hours rather
than days.

### B. "Who had access to X on date Y?"

Audit / compliance query, especially relevant for an NGO that needs to
prove governance. Open the snapshot for date Y, grep groups + role
assignments. Done.

### C. "Did anyone create / delete a sensitive app registration in the last 90 days?"

`git log` the `applications.json` file over the date range; eyeball the
diffs. (Also covered by Microsoft's own Entra audit log, which retains
~30 days for free tier and longer for paid SKUs — our git history is the
durable supplement.)

## Cost projection

A daily JSON snapshot of all directory objects is **tiny** by data
standards — typical NGO tenant snapshot is **<10 MB/day** total, ~3 GB/year.

| Cost line | Year 1 |
|---|---|
| Disk (negligible on the 500 GB backup volume) | $0 |
| Azure Blob copy (if mirrored offsite — same pattern as email backup) | < $1/year |
| Software licenses | $0 |
| Maintenance time | ~1 hour/quarter |

## Open follow-ups

| Task | Notes |
|---|---|
| Decide the Entra app name + permissions | Likely `skintyee-entra-backup`; permissions listed above |
| Write `scripts/m365-backup/Get-EntraConfig.ps1` | Daily snapshot job |
| Decide where the git repo for snapshots lives | Likely a private gitea on the Server 2022; or a private ADO repo |
| Decide the daily "change report" email format + recipients | Probably `it@skintyee.ca`; HTML email with a `<pre>` block of the day's diff |
| Build the recovery runbook for Scenario A | A separate `docs/365/entra-recovery.md` documenting the steps to use a snapshot to rebuild the tenant config |

## See also

- [`docs/365/email-backup.md`](./email-backup.md) — the message-data
  backup (companion doc; same overall pattern but different data type)
- [`docs/365/entra-id.md`](./entra-id.md) — what Entra ID is + how Skin Tyee
  uses it
- [`docs/365/entra-usage.md`](./entra-usage.md) — current Entra app
  registrations + their purposes
- [Microsoft Graph directory APIs](https://learn.microsoft.com/en-us/graph/api/resources/directory-overview)
- [Microsoft 365 audit log retention](https://learn.microsoft.com/en-us/purview/audit-log-retention-policies) — what Microsoft keeps natively, for how long, and at what SKU
