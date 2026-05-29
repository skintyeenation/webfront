# Microsoft 365 email backup → onsite Windows Server 2022

How the Nation owns its own email archive — a Skin-Tyee-controlled
PowerShell + Microsoft Graph script that pulls messages from M365 to the
**physical onsite Backup Server** every night, with a secondary copy
mirrored to **Azure Blob Storage** for offsite redundancy.

This is the implementation of the two "Automated Backup" arrows shown in
[`docs/SkinTyee.drawio.pdf`](../SkinTyee.drawio.pdf) (page 2): one from
`Email Relay (Outlook Cloud)` into `Backup Server (Physical, Onsite)`,
the other into `Email Backup Azure Storage (Cloud)`.

> **Decision: build it ourselves.** Not Veeam, not MailStore, not
> AvePoint. The reasoning + the alternatives we're explicitly NOT
> choosing are in [§ Alternatives considered](#alternatives-considered)
> below.

---

## Contents

| Section | What's in it |
|---|---|
| [Why DIY](#why-diy) | The decision and what it costs us / buys us |
| [Architecture](#architecture) | How the moving parts fit together (mapped to the diagram) |
| [Entra app (`skintyee-m365-backup`)](#entra-app-skintyee-m365-backup) | The app registration the script authenticates as |
| [Server prep (Server 2022)](#server-prep-server-2022) | OS / disk / firewall layout on the physical box |
| [Storage layout on disk](#storage-layout-on-disk) | Folder structure + immutability semantics |
| [The script](#the-script) | `Get-M365Mail.ps1` — Graph delta queries, ~200 lines |
| [Scheduling](#scheduling) | Windows Task Scheduler, run as a dedicated service account |
| [Monitoring & alerting](#monitoring--alerting) | Failure detection, log retention, where alerts go |
| [Restore procedure](#restore-procedure) | How to put an email back — drill SOP |
| [Secondary copy → Azure Blob](#secondary-copy--azure-blob) | The Cloud half of the diagram (offsite redundancy) |
| [Cost projection](#cost-projection) | What this actually costs over the next 3 years |
| [Alternatives considered](#alternatives-considered) | Veeam, MailStore, M365 Backup, AvePoint, Druva, eDiscovery PST — and why each was passed over |
| [Phase 2 considerations](#phase-2-considerations) | When to revisit, what could grow |
| [Open follow-ups](#open-follow-ups) | What's not done yet |

---

## Why DIY

Three reasons this is the right call for Skin Tyee specifically:

1. **NGO priority is auditability + ownership, not feature breadth.**
   The hosting decision in [`docs/hosting-costs.md`](../hosting-costs.md)
   already established the pattern: pay slightly more / build slightly
   more to keep the data on the Nation's own infrastructure, fully
   inspectable. A Veeam install is a sealed binary on the server doing
   things you can't audit at the byte level. A ~200-line PowerShell
   script that calls public Microsoft Graph endpoints is something a
   council member can read and understand.
2. **$0 recurring cost, indefinitely.** Veeam Community is free up to
   10 users; the moment we cross that we'd start paying ~$3/user/month.
   The DIY approach scales with mailbox count at the cost of Azure Blob
   storage only (~$0.02/GB/month) — same whether we're 5 mailboxes or 500.
3. **Capacity-building over rented capability.** Per the project's
   "Education & open source" goal (README § Purpose), in-community
   technicians and students who can read PowerShell can learn from + extend
   this. They cannot do that with a vendor binary.

What we give up:

- **An employee maintains it.** When Graph changes, we update the script.
  When a run fails silently, we noticed because we wrote the monitoring.
  Veeam handles that for you.
- **No nice UI for ad-hoc restore.** Restore is "find the `.eml` on disk,
  drag into Outlook." That's fine for the once-a-quarter recovery; less
  fine if you need to restore 50 messages from a date range. (Solvable
  with a small read-side script if it ever becomes friction.)
- **No fancy Teams / SharePoint coverage out of the box.** Phase 1 covers
  Exchange Online (mail + calendar + contacts). Teams chat + SharePoint
  + OneDrive can be added later (each is a separate Graph endpoint family;
  ~50 more lines each).

The trade is intentional. We're trading vendor convenience for sovereignty
+ zero cost growth.

---

## What this DOES back up — and what it does NOT

This doc is **specifically about Exchange Online** (mail + calendar +
contacts). Adjacent things that look similar but need their own
treatment:

| Source | In scope here? | Where it'll be covered |
|---|---|---|
| **Exchange Online — mail** (every mailbox + every shared mailbox) | ✅ Yes | This doc |
| **Exchange Online — calendar** | ✅ Yes | This doc |
| **Exchange Online — contacts** | ✅ Yes | This doc |
| **SharePoint document libraries** (where organizational documents actually live — see the explainer below) | ⬜ No — **separate unit of work** | `docs/365/sharepoint-backup.md` (to be written; tracked as an open follow-up). Could be substantial data; deserves its own design pass. |
| **OneDrive for Business** (per-user personal cloud drives) | ❌ No — **explicitly deferred** | `docs/365/onedrive-backup.md` (to be written *if + when* we decide to back up personal drives; might never happen). Likely not backed up at all — see below. |
| **Microsoft Teams** — chat history, channel messages, channel files | ⬜ No — **separate unit of work** | Folded into the SharePoint backup doc (channel files live in SharePoint) + a Teams-chat-history sub-section (chat messages live in a hidden Exchange folder reachable via Graph) |
| **Entra ID — users, groups, roles, conditional access policies, app registrations, service principals, custom RBAC, B2B guests** | ⬜ No — **completely separate unit of work** | [`docs/365/entra-backup.md`](./entra-backup.md) — captured as a parallel project track. The script in *this* doc handles message data only; identity + configuration is a different problem with different tooling. |
| **M365 admin center settings** (organization-level config, license assignments, domain ownership records) | ⬜ No | Folded into the Entra backup doc — same shape, same tooling. |

### Quick aside — where do M365 documents actually live? (SharePoint vs OneDrive)

Common point of confusion when planning backups:

| Question | Answer |
|---|---|
| When someone uploads a doc to a **SharePoint team site**, where does it live? | **SharePoint.** A SharePoint document library is its own storage — files stay there. Not in OneDrive. |
| When someone uploads / saves a file to **OneDrive**, where does it live? | **OneDrive** — that user's personal cloud drive, a per-user storage container. |
| When someone shares a OneDrive file with a colleague, where does it live? | Still in the sharer's OneDrive. The shared link is a pointer; the file doesn't get copied. |
| When someone uploads a file to a **Microsoft Teams channel**, where does it live? | **SharePoint** — every Team has a backing SharePoint site (auto-created when the Team is created). Channel files live in that SharePoint site's document library. |
| When someone shares a file in a **Teams 1:1 chat or group chat (non-channel)**, where does it live? | The sharer's **OneDrive** — in an auto-created folder called `Microsoft Teams Chat Files`. |
| When you "save to OneDrive" from Office (Word/Excel/PowerPoint), where does it live? | Defaults to your **OneDrive**, but Office can also save directly to a SharePoint library — the dialog asks you to pick. |

So the relevant rule for our backup planning:

- **All Skin Tyee organizational documents** (the ones that matter for
  continuity if a person leaves, gets hit by a bus, or their account is
  hijacked) **live in SharePoint** — either explicitly (team sites,
  document libraries) or implicitly (Teams channel files, which are
  SharePoint behind the scenes).
- **OneDrive holds personal-user files** — drafts, individual scratch
  space, sharing-via-1:1-chat attachments. If Jane leaves the Nation,
  her work product that the *Nation* needs should already have been
  saved to a SharePoint team site, not left in Jane's OneDrive.

### Decision: don't back up OneDrive

Given the above:

- **SharePoint will be backed up** as a separate unit of work
  (`docs/365/sharepoint-backup.md`, future) — that's where organizational
  data lives. This could be a LOT of data, so it needs its own design
  pass on storage sizing, dedup, retention.
- **OneDrive will NOT be backed up** by Skin Tyee's automated system.
  - Reasoning: OneDrive is personal scratch space; organizational
    continuity does not depend on what's there. Users who need files
    preserved long-term are expected to put them in the right SharePoint
    location.
  - Trade-off: if a user accidentally deletes a personal file from
    OneDrive, M365's own retention (~30 days for soft-deleted items) is
    their recovery option — nothing on our side.
  - This is a **policy decision** as much as a technical one: tell staff
    in onboarding (see [`docs/onboarding/`](../onboarding/)) that OneDrive
    is "personal scratch, not backed up" — anything they care about
    organizationally goes in SharePoint.
  - Revisit later only if a compliance or legal requirement forces it.

## Architecture

```
                             ┌───────────────────────────────┐
                             │   Microsoft 365 / Exchange    │
                             │       (graph.microsoft.com)   │
                             └───────────────┬───────────────┘
                                             │   HTTPS 443 outbound only
                                             │   App-only token
                                             │   (Entra app:
                                             │    skintyee-m365-backup)
                                             ▼
                ┌────────────────────────────────────────────────────────┐
                │  Backup Server (Physical, Onsite)                      │
                │  Windows Server 2022, BitLocker-encrypted              │
                │                                                        │
                │  C:\Scripts\m365-backup\Get-M365Mail.ps1               │
                │       ↓                                                │
                │  D:\M365-Backups\                                      │
                │       mailboxes\<upn>\messages\<yyyy>\<mm>\*.eml       │
                │       mailboxes\<upn>\events\…                         │
                │       mailboxes\<upn>\contacts\…                       │
                │       state\<userid>.json     (Graph delta tokens)     │
                │       logs\backup-YYYYMMDD.log                         │
                └────────────────────────┬───────────────────────────────┘
                                         │   azcopy sync (nightly)
                                         │   write-only SAS token
                                         ▼
                            ┌───────────────────────────┐
                            │  Azure Blob Storage       │
                            │  skintyeem365backups      │
                            │  Cool tier + 90-day       │
                            │  immutability policy      │
                            └───────────────────────────┘
```

### Why write-only at each hop

**At M365 → Server:** the Entra app has `Mail.Read`, `Calendars.Read`,
`Contacts.Read`, `User.Read.All` — **no `*.Write` scopes**. Even if the app
credential leaks, the attacker can read mail but cannot delete or alter
mailbox contents (and our archive copy on the server is unaffected by
anything that happens to M365). Restoring an email is a manual operation
done by an admin, separately (see [Restore procedure](#restore-procedure))
— the backup pipeline cannot put data back into M365 on its own.

**At Server → Azure Blob:** azcopy uses a SAS token with `Create / Add /
Write` permissions only — no `Delete`, no `Read`. Combined with the
container's **immutability policy** (90-day legal-hold window), this
means a compromised Server 2022 cannot retroactively wipe the offsite
copy. The cloud copy is the "last resort" archive.

This is the classic **3-2-1 backup rule**, made write-only at each step:
3 copies (live mailbox + onsite server + Azure Blob), 2 media (NTFS +
Blob), 1 offsite (Blob). Plus none of the hops are reversible by a single
compromise.

---

## Entra app (`skintyee-m365-backup`)

A dedicated app — not piggy-backing on `it-project-docs-publisher` or
the `skintyee-prod-deploy` SP — because the **least-privilege boundary
matters**: this app gets `Mail.Read` across every mailbox in the tenant,
which is a heavy read scope; we want to be able to revoke / rotate it
independently from any other automation.

### Permissions (Application, not Delegated)

| Permission | ID | Why |
|---|---|---|
| `Mail.Read` | `810c84a8-4a9e-49e6-bf7d-12d183f40d01` | Read every user's mail |
| `Calendars.Read` | `798ee544-9d2d-430c-a058-570e29e34338` | Backup calendar events |
| `Contacts.Read` | `089fe4d0-434a-44c5-8827-41ba8a0b17f5` | Backup contacts |
| `User.Read.All` | `df021288-bdef-4463-88db-98f22de89214` | Enumerate mailboxes to back up |

**No write scopes.** Anything labeled `*.ReadWrite` or `*.Write` is
explicitly excluded; restore is done by a human operator using a
separate, time-limited admin grant (not by this app).

### Create the app

Pattern matches the existing
`scripts/setup-sharepoint-pipeline.sh` workflow — same flow:

```bash
# Create the app
APP_ID=$(az ad app create \
  --display-name skintyee-m365-backup \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)

# Create the SP
az ad sp create --id "$APP_ID"

# Add the 4 application permissions on Microsoft Graph (resource 00000003-0000-0000-c000-000000000046)
for PERM_ID in 810c84a8-4a9e-49e6-bf7d-12d183f40d01 \
               798ee544-9d2d-430c-a058-570e29e34338 \
               089fe4d0-434a-44c5-8827-41ba8a0b17f5 \
               df021288-bdef-4463-88db-98f22de89214; do
  az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000046 \
    --api-permissions "${PERM_ID}=Role"
done

# Grant admin consent (interactive — uses your admin sign-in)
az ad app permission admin-consent --id "$APP_ID"

# Create the client secret (24-month expiry; save to 1Password IT/Admin vault immediately)
az ad app credential reset --id "$APP_ID" \
  --display-name "m365-backup-onprem" --years 2 \
  --query '{appId:appId, secret:password, tenantId:tenant, expires:endDateTime}'
```

Save the JSON output to **1Password → IT/Admin → `skintyee-m365-backup`**.
The secret will need to be rotated every 24 months — set a calendar
reminder.

(A *much* better long-term answer than a client secret is to use a
**federated credential + a managed identity on the server**, but Server 2022
on-prem doesn't natively support workload identity federation the way ADO
agents or Azure VMs do. Stick with a rotating client secret for now;
revisit if/when the server moves into Azure Arc — see
[Phase 2 considerations](#phase-2-considerations).)

---

## Server prep (Server 2022)

### Hardware / OS baseline

| Item | Spec | Why |
|---|---|---|
| OS | Windows Server 2022 (any SKU) | Already on hand |
| RAM | 4 GB minimum, 8 GB comfortable | Script + PowerShell + azcopy fit easily |
| CPU | 2 vCPU | Mostly I/O-bound; CPU not the limit |
| Boot disk | 80 GB SSD (C:) | OS + scripts + logs |
| Backup volume | 500 GB NVMe / SSD (D:) | See [storage sizing](#cost-projection); 500 GB covers 5+ years at current org size |
| Network | 1 Gbps NIC, outbound 443 only allowed | Talks to graph.microsoft.com + the Azure Blob endpoint |
| Power | UPS (small APC unit, ~$200) | Onsite backup means physical reliability matters |
| Physical security | Locked server room / cabinet | The backup is only as immutable as the box is uncompromised |

### Software prep

1. **PowerShell 7** — install from Microsoft Store or
   <https://aka.ms/PowerShell>. Server 2022 ships with PS 5.1; we want 7
   for better JSON handling + parallel `ForEach-Object -Parallel`.
2. **azcopy** — <https://aka.ms/downloadazcopy>; extract to `C:\Tools\azcopy\`.
3. **BitLocker on `D:`** — turn it on:
   ```powershell
   Enable-BitLocker -MountPoint "D:" -EncryptionMethod XtsAes256 `
     -UsedSpaceOnly -PasswordProtector
   ```
   Save the recovery key to **1Password → IT/Admin →
   `server-bitlocker-d-recovery`**. Without this, a stolen disk is a data
   leak.
4. **Dedicated service account** — create a local user
   `svc-m365-backup` with a random password (1Password generates this).
   Grant it `Log on as a batch job` (`secpol.msc` → Local Policies →
   User Rights Assignment) and full control of `D:\M365-Backups`. Don't
   make it an admin.
5. **Outbound-only firewall rule** — outbound 443 to `graph.microsoft.com`
   and `*.blob.core.windows.net` only; deny outbound elsewhere from the
   service account's context.

---

## Storage layout on disk

```
D:\M365-Backups\
│
├── manifest.json                # tenant ID, app ID (NOT secret), schema version, first-run timestamp
│
├── state\
│   ├── <userid-guid>.json       # per-mailbox delta tokens (last sync state)
│   └── …
│
├── mailboxes\
│   └── <user-upn>\              # e.g. lucas.lopatka@skintyee.ca
│       ├── messages\
│       │   └── <yyyy>\<mm>\
│       │       └── <safe-message-id>.eml    # MIME blob — body + headers + attachments
│       ├── events\
│       │   └── <yyyy>\<mm>\
│       │       └── <safe-event-id>.json
│       ├── contacts\
│       │   └── <safe-contact-id>.json
│       └── _index\
│           └── messages.csv     # id, receivedDateTime, from, subject — for fast search without parsing every .eml
│
└── logs\
    ├── backup-2026-05-28.log    # one log per run; keep 90 days
    └── deletions.log            # append-only: messages reported by Graph as deleted upstream
```

### Why this layout

- **Filed by `messageId`, never overwritten.** Microsoft Graph guarantees
  message IDs are immutable within a mailbox. The script does an
  `if (-not (Test-Path $eml)) { download }` — once a message is on disk it
  stays, even if the upstream copy gets deleted. The archive is
  **append-only by construction**.
- **Year/month foldering** keeps directory listings sane (no folder with
  100k files).
- **`_index/messages.csv`** lets you grep for an email by subject without
  parsing 50,000 `.eml` files. Updated as messages land.
- **`state\<userid>.json`** holds the **Graph delta token** — the
  resumability story. First run: full backup (~hours per mailbox). Every
  subsequent run: only fetch what changed since last token (~minutes).
- **`deletions.log`** records when Graph tells us a message was deleted
  upstream. We **don't** delete our local copy — that's the entire point of
  immutable backup — but we do record what happened, so an audit can
  reconcile.

---

## The script

A single file: `C:\Scripts\m365-backup\Get-M365Mail.ps1`. Reads
configuration from environment variables (tenant ID, client ID, secret —
fetched from 1Password CLI at task-start time, never written to disk).

### Skeleton (the core ~80 lines; full script is ~200 with error handling)

```powershell
<#
.SYNOPSIS
  Pull M365 mail + calendar + contacts to local disk via Microsoft Graph
  delta queries.

.DESCRIPTION
  Idempotent: re-running picks up from the last delta token per mailbox.
  Append-only: never deletes from local archive even if upstream deletes.
  Authenticated as the `skintyee-m365-backup` Entra app (read-only scopes).

.PARAMETER BackupRoot
  Local destination root; default D:\M365-Backups.

.NOTES
  Secrets MUST come from env vars (1Password CLI populates them at
  task-start). Do not bake credentials into this file.
#>

param(
  [string]$TenantId      = $env:M365_TENANT_ID,
  [string]$ClientId      = $env:M365_CLIENT_ID,
  [string]$ClientSecret  = $env:M365_CLIENT_SECRET,
  [string]$BackupRoot    = "D:\M365-Backups",
  [int]$MaxParallel      = 4
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $BackupRoot "logs\backup-$(Get-Date -Format yyyy-MM-dd-HHmmss).log"
function Log($msg) {
  $line = "$(Get-Date -Format o) $msg"
  $line | Tee-Object -FilePath $LogFile -Append
}

# 1. Acquire app-only token (valid 1 hour)
Log "▸ acquiring token from $TenantId"
$tok = (Invoke-RestMethod -Method POST `
  -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
  -Body @{
    client_id     = $ClientId
    client_secret = $ClientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
  }).access_token
$Headers = @{ Authorization = "Bearer $tok" }

# 2. Enumerate enabled mailboxes
Log "▸ enumerating users"
$users = @()
$next = "https://graph.microsoft.com/v1.0/users?`$select=id,userPrincipalName,mail&`$filter=accountEnabled eq true"
while ($next) {
  $page = Invoke-RestMethod -Headers $Headers -Uri $next
  $users += $page.value | Where-Object { $_.mail }    # skip users without mailboxes
  $next = $page.'@odata.nextLink'
}
Log "  found $($users.Count) mailboxes"

# 3. Per mailbox — incremental delta sync
$users | ForEach-Object -Parallel {
  $u = $_
  $h = $using:Headers
  $root = $using:BackupRoot
  $upn = $u.userPrincipalName
  $userDir = Join-Path $root "mailboxes\$upn"
  $stateFile = Join-Path $root "state\$($u.id).json"

  # Resume from saved delta token, or start a fresh delta sync
  $deltaUrl = if (Test-Path $stateFile) {
    (Get-Content $stateFile | ConvertFrom-Json).deltaLink
  } else {
    "https://graph.microsoft.com/v1.0/users/$($u.id)/messages/delta?`$select=id,receivedDateTime,subject,from"
  }

  $newCount = 0; $delCount = 0
  do {
    $page = Invoke-RestMethod -Headers $h -Uri $deltaUrl
    foreach ($msg in $page.value) {
      if ($msg.'@removed') {
        # Recorded but NOT deleted from our archive (write-only / append-only)
        Add-Content -Path (Join-Path $root "logs\deletions.log") `
          -Value "$(Get-Date -Format o)`t$upn`t$($msg.id)`tDELETED_UPSTREAM"
        $delCount++
        continue
      }
      $dt = [datetime]$msg.receivedDateTime
      $dir = Join-Path $userDir "messages\$($dt.Year)\$('{0:D2}' -f $dt.Month)"
      $safeId = $msg.id -replace '[^a-zA-Z0-9_-]', '_'
      $eml = Join-Path $dir "$safeId.eml"
      if (-not (Test-Path $eml)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        # Stream MIME body (.eml — includes attachments inline)
        Invoke-WebRequest -Headers $h `
          -Uri "https://graph.microsoft.com/v1.0/users/$($u.id)/messages/$($msg.id)/`$value" `
          -OutFile $eml
        # Append to the per-mailbox index for fast search
        $idxLine = "{0}`t{1}`t{2}`t{3}" -f $msg.id, $msg.receivedDateTime, $msg.from.emailAddress.address, ($msg.subject -replace "[`r`n`t]"," ")
        Add-Content -Path (Join-Path $userDir "_index\messages.csv") -Value $idxLine
        $newCount++
      }
    }
    $deltaUrl = $page.'@odata.nextLink'
    if ($page.'@odata.deltaLink') {
      # End of this delta batch — persist token for next run
      @{ deltaLink = $page.'@odata.deltaLink'; lastRun = (Get-Date -Format o) } |
        ConvertTo-Json | Set-Content -Path $stateFile
    }
  } while ($deltaUrl)

  Write-Output "$upn  +$newCount new  -$delCount removed"
} -ThrottleLimit $MaxParallel | ForEach-Object { Log "  $_" }

Log "✓ done"
```

### What's missing from the skeleton above (folded into the full ~200 line version)

- **Throttling handling** — when Graph returns 429, sleep `Retry-After`.
- **Token refresh** — long backups may outlive the 1-hour token; refresh
  proactively at 50 min.
- **Calendar + contacts loops** — same `delta` pattern; another ~40
  lines each.
- **Idempotent index updates** — protect `_index/messages.csv` against
  duplicate appends if the run is restarted mid-mailbox.
- **Heartbeat** — on success, touch a sentinel file at
  `D:\M365-Backups\.last-success`; monitoring reads its mtime.
- **Exit codes** — non-zero on any unhandled error, so Task Scheduler
  fires the alert action.

The full script will live at
[`scripts/m365-backup/Get-M365Mail.ps1`](../../scripts/m365-backup/Get-M365Mail.ps1)
once written (open follow-up; tracked in the [Open follow-ups](#open-follow-ups)
section).

---

## Scheduling

### Task Scheduler entry

| Setting | Value |
|---|---|
| Name | `M365-Backup-Nightly` |
| Trigger | Daily at 02:00 (low-traffic window) |
| Action | Program: `pwsh.exe` · Arguments: `-NoProfile -ExecutionPolicy Bypass -File C:\Scripts\m365-backup\Get-M365Mail.ps1` |
| Run as | `svc-m365-backup` (the dedicated service account) |
| Run whether user is logged on or not | ✅ |
| Run with highest privileges | ❌ (the service account doesn't need elevation) |
| Configure for | Windows Server 2022 |
| Conditions → Power | Start the task only if the computer is on AC power: **disabled** (it's a server; it's always on AC) |
| Settings → Stop the task if it runs longer than | 6 hours (sanity cap; first full backup may approach this, incrementals finish in minutes) |
| Settings → If the running task does not end when requested, force it to stop | ✅ |
| On failure | Action: send email via the on-server `Send-MailMessage` to `alerts@skintyee.ca` |

### Credential injection (1Password CLI)

The Task Scheduler action is actually a small wrapper:

```powershell
# C:\Scripts\m365-backup\Run-Backup.ps1
$env:M365_TENANT_ID     = (op read "op://IT-Admin/skintyee-m365-backup/tenant-id")
$env:M365_CLIENT_ID     = (op read "op://IT-Admin/skintyee-m365-backup/client-id")
$env:M365_CLIENT_SECRET = (op read "op://IT-Admin/skintyee-m365-backup/client-secret")
& C:\Scripts\m365-backup\Get-M365Mail.ps1
```

The 1Password CLI (`op`) is authenticated to a **service account
token** stored in the Windows Data Protection API (DPAPI) under the
`svc-m365-backup` user — so only that user can decrypt it, and the
secrets never touch disk in plaintext.

(If 1Password CLI is overkill for the moment, alternative is Windows
**Credential Manager** holding the three values; trade-off is they're
harder to rotate from a central place.)

---

## Monitoring & alerting

> **Backups must not fail silently.** Anything less than multi-channel
> notification (email + SMS + voice call) for a missed backup is
> inadequate for a system that, by definition, you only notice when it's
> needed and gone. This section describes the alerting path; it's part
> of v1, not a Phase 2 nice-to-have.

### Three signals the script emits

1. **Heartbeat file `D:\M365-Backups\.last-success`** — touched on
   successful completion.
2. **Task Scheduler exit code** — `0x0` on success; anything else on
   failure.
3. **Custom metric `m365_backup_success_total`** — pushed to Azure Monitor
   on completion (1 = success, 0 = failure). Lets us see frequency / trends
   in Azure Monitor's metrics explorer.

### Alerting path: Azure Monitor + Action Groups

Azure's native alerting service — **Azure Monitor + Action Groups** —
delivers notifications across all the channels we want from a single
configured target:

| Channel | What you get | Cost (CAD, Canada region) |
|---|---|---|
| **Email** | HTML message to one or more addresses | First 1,000/mo **free**, $0.0007 each after |
| **SMS** | Text message to a mobile number | ~$0.075 per message (Canada) |
| **Voice call** | Automated phone call reading the alert text | ~$0.085 per call (Canada) |
| **Push notification** | To the Azure mobile app on phones | **Free** |
| **Webhook** | POST to any HTTPS URL (Slack, Teams, custom incident tracker) | **Free** |
| **ITSM connector** | Create tickets in ServiceNow / similar | Depends |
| **Logic App** | Trigger any custom workflow | Logic App cost |

For Skin Tyee at the NGO scale, a missed-backup alert firing once or twice a
year (worst case) means the alerting line itself costs **pennies per
year** — even if every channel fires.

### Configuration

```bash
# 1. Create the Action Group (the "list of who to notify and how")
az monitor action-group create \
  --resource-group skintyee-prod-rg \
  --name ag-m365-backup-critical \
  --short-name M365-Backup \
  --action email it-lead   it@skintyee.ca \
  --action email alerts    alerts@skintyee.ca \
  --action sms   it-lead-sms   1 2505550100 \
  --action voice it-lead-voice 1 2505550100
# (+1 more SMS/voice for a backup oncall — never a single point of failure)

# 2. Send custom metric from the script (via Application Insights connection string)
#    The script does this with a single POST to:
#    https://<region>-X.in.applicationinsights.azure.com/v2/track
#    with a CustomMetrics{name=m365_backup_success_total, value=1} payload.
#    No SDK install needed — pure REST.

# 3. Create the alert rule: "no successful backup in the last 36 hours"
az monitor metrics alert create \
  --resource-group skintyee-prod-rg \
  --name "m365-backup-missing-heartbeat" \
  --scopes "<application-insights-resource-id>" \
  --condition "total m365_backup_success_total < 1" \
  --window-size 36h \
  --evaluation-frequency 1h \
  --severity 1 \
  --action ag-m365-backup-critical \
  --description "M365 nightly backup heartbeat missed for >36 hours — investigate immediately"

# 4. (Belt-and-suspenders) Also alert on outright failure
az monitor metrics alert create \
  --resource-group skintyee-prod-rg \
  --name "m365-backup-failed" \
  --scopes "<application-insights-resource-id>" \
  --condition "total m365_backup_success_total < 1" \
  --window-size 24h \
  --evaluation-frequency 5m \
  --severity 2 \
  --action ag-m365-backup-critical \
  --description "M365 backup explicitly reported failure"
```

The same Action Group `ag-m365-backup-critical` can be reused by any
other critical-path Skin Tyee alert (e.g. `api-prod` Container App down,
Postgres unavailable) so the IT lead has one phone number+email
configured in one place.

### Drill on the alerting path

**Quarterly** (every 90 days), the IT lead manually triggers the alert
rule using `az monitor action-group test-notifications`. The full chain
fires; we confirm SMS arrives, voice call comes in, email arrives, push
goes to the phone. An unfired alert path is a broken alert path —
verifying quarterly is the only thing that keeps it real.

### Log retention

`logs\backup-*.log` files older than 90 days are removed by a separate
weekly task. `deletions.log` is **never deleted** — it's part of the audit
trail.

---

## Restore procedure

There are three restore scenarios; each has a different SOP.

### A. Restore one message

User says "I deleted an email I shouldn't have, can you get it back?"

1. SSH / RDP to the Backup Server, log in as an IT admin (NOT the
   `svc-m365-backup` service account)
2. Look up the user's mailbox: `D:\M365-Backups\mailboxes\<their-upn>\`
3. Search the `_index/messages.csv` by subject or sender:
   ```powershell
   Import-Csv D:\M365-Backups\mailboxes\jane.doe@skintyee.ca\_index\messages.csv `
     | Where-Object { $_.subject -like "*Council meeting Jan 15*" }
   ```
4. Open the matching `.eml` in Outlook (double-clicking opens it in
   the recipient's profile), OR forward it to the user from the IT
   account.

This works for single-message recoveries and is the 95% case.

### B. Restore a mailbox

Used when an account is deleted or hijacked.

1. Use **M365's own retention** first — Microsoft holds deleted mailboxes
   for 30 days; restoring from there is one click in the Exchange admin
   center. Always try this first (it preserves message IDs, calendar
   entries, contacts, etc.).
2. If that window has passed, restore from our archive:
   - Create the mailbox in M365 fresh
   - Use a small companion script (open follow-up — `Restore-M365Mail.ps1`)
     that walks the local `.eml` files and uses the Graph API's
     `POST /users/{id}/mailFolders/inbox/messages` endpoint with the
     `application/octet-stream` body to import each MIME message back.
     This step requires a **separate, time-limited** admin grant of
     `Mail.ReadWrite` — NOT held by the backup app.

### C. Restore from the offsite Azure Blob copy

Used only when the onsite server is destroyed/stolen/encrypted.

1. From another Windows machine, run `azcopy sync` in the reverse
   direction to pull the Blob copy down to a new local volume
2. Then follow procedure A or B against the restored copy

### Restore drill SOP

**Monthly** (1st of each month, calendar-blocked on the IT lead's
schedule): perform Restore Scenario A against a random mailbox + random
date — confirm the message comes back intact. Backup that never gets
restored from is theoretical; the drill is what makes it real. Log the
result in `D:\M365-Backups\drill-log.md`.

---

## Secondary copy → Azure Blob

The diagram's left arrow ("Email Backup Azure Storage (Cloud)") is the
**offsite copy** — protection against the building burning down or the
server being stolen.

### Setup (one-time)

```bash
# Create the storage account in canadacentral (data residency)
az storage account create \
  --name skintyeem365backups \
  --resource-group skintyee-prod-rg \
  --location canadacentral \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Cool

# Container with a 90-day legal-hold immutability policy
az storage container create \
  --account-name skintyeem365backups \
  --name m365-archive

az storage container immutability-policy create \
  --account-name skintyeem365backups \
  --container-name m365-archive \
  --period 90

# A write-only SAS token for the on-prem server (rotate every 12 months)
az storage container generate-sas \
  --account-name skintyeem365backups \
  --name m365-archive \
  --permissions cw \
  --expiry "$(date -u -d '+1 year' '+%Y-%m-%dT%H:%MZ')" \
  --https-only
```

Save the SAS token to **1Password → IT/Admin → `m365-backup-blob-sas`**.

### Mirror task (runs after the main backup completes)

```powershell
# C:\Scripts\m365-backup\Sync-ToAzure.ps1
$sas = op read "op://IT-Admin/m365-backup-blob-sas/value"
$url = "https://skintyeem365backups.blob.core.windows.net/m365-archive?$sas"
& C:\Tools\azcopy\azcopy.exe sync `
  "D:\M365-Backups" `
  $url `
  --recursive=true `
  --delete-destination=false
```

`--delete-destination=false` is critical — combined with the write-only
SAS permissions (`cw` = create + write, no delete), this means the Azure
copy is strictly grow-only. Plus the 90-day immutability policy prevents
even an admin from deleting newly-written blobs for 90 days.

### Cost on Azure side

Cool tier in canadacentral as of 2026-05:

| Item | Rate | Skin Tyee usage @ 5 mailboxes, 3-year retention | Monthly cost |
|---|---|---|---|
| Storage | $0.018 / GB / month | ~50 GB | **$0.90** |
| Write transactions | $0.10 per 10,000 | ~10k/month | **$0.10** |
| Read transactions | $0.013 per 10,000 | 0 (we don't read; just write) | **$0** |
| Egress (only during restore from Blob) | $0.087 / GB after first 100 GB | 0 in steady state | **$0** |
| **Total** | | | **~$1/month** |

For 20 mailboxes, ~$4/month. Effectively zero.

---

## Cost projection

3-year total cost of running this:

| Cost line | Year 1 | Year 2 | Year 3 | Notes |
|---|---|---|---|---|
| **Hardware (Server 2022, UPS)** | already owned | $0 | $0 | Sunk cost; would have it anyway |
| **Server 2022 license** | already owned | $0 | $0 | |
| **Backup volume (500 GB SSD)** | ~$100 once | $0 | $0 | Buy once |
| **Electricity (server runs 24/7)** | ~$200/yr | $200 | $200 | Same as the existing server |
| **Internet (outbound to Graph + Blob)** | $0 marginal | $0 | $0 | Already paying for the connection |
| **Azure Blob storage (offsite copy)** | $12 | $18 | $24 | Cool tier; grows with archive |
| **Software licenses** | **$0** | **$0** | **$0** | The whole point |
| **Maintenance time (IT lead)** | ~4 hours/quarter | ~2 hours/quarter | ~2 hours/quarter | Drills, occasional script fixes |
| **3-year cumulative recurring** | | | | **~$660** (mostly the electricity + Azure) |

Compare to Veeam's licensed tier (if we ever crossed 10 users + needed
production support):

- Veeam BFO licensed: ~$3-4/user/month × 15 users × 36 months = **$1,800–$2,400** + integrator setup hours
- AvePoint Cloud Backup: ~$6/user/month × 15 × 36 = **$3,240**
- Druva: ~$5/user/month × 15 × 36 = **$2,700**

So we save roughly **$1,200-$2,600 over 3 years** by owning this, at the
cost of a few hours per quarter of IT lead attention.

---

## Alternatives considered

For the record — what we're explicitly NOT choosing, with the why.

| Option | Cost | Why we're not choosing it |
|---|---|---|
| **Veeam Backup for Microsoft 365 (Community Edition)** | Free up to 10 users; ~$3-4/user/mo after | Excellent product, industry standard. We pass because: (a) it's a vendor binary we can't fully audit; (b) the moment we cross 10 users we start paying indefinitely; (c) the Nation owning + understanding its own backup matches the "capacity-building" project goal better. If the DIY script ever becomes too much maintenance burden, Veeam is the obvious fallback — write our archive into a Veeam repo and switch over with a day's work. |
| **MailStore Server** | $399 USD one-time for 5 users; +$199 per +5 | Designed for compliance archival rather than backup; great if "let me search 3 years of email" is a frequent operation. Skin Tyee's pattern is more "rare restore of a specific deleted item" + "audit trail for the board" — both of which the DIY archive serves at $0. |
| **AvePoint Cloud Backup** | ~$6 USD/user/month | Strong feature set (cross-restore between tenants, granular SharePoint), but priced for enterprises. Severe overkill at Skin Tyee's scale, and the data lives on AvePoint's infrastructure (further from the sovereignty goal, not closer to it). |
| **Druva Phoenix** | ~$5 USD/user/month | Same shape as AvePoint — capable, expensive, and your backup lives on someone else's cloud. |
| **Spanning Backup (Kaseya)** | ~$4 USD/user/month | Similar. Differentiator is point-in-time restore granularity, which we don't need at this scale. |
| **Microsoft 365 Backup** (Microsoft's own, GA 2024) | ~$0.15/GB/month | Stores in Microsoft's cloud. Doesn't deliver the on-prem offsite copy the diagram requires — it's literally backing up M365 into another Microsoft service. Convenient if you trust Microsoft as your only backup provider; misses the point of the Nation owning its own archive. |
| **Built-in M365 retention policies** | included | NOT a backup. Retention policies extend the soft-delete window (up to 7 years for Litigation Hold), but everything is still in M365's control. A tenant-wide credential compromise or a malicious admin can still destroy the data. We use retention policies as a complement (first line of defense), but they don't replace an external backup. |
| **eDiscovery → Content Search → Export to PST** | included | Manual operation, not automatable for routine backup. PST files are themselves a known-bad format (corruption, file size limits, no incremental). Useful for one-off compliance exports; not as a routine pipeline. |
| **fetchmail / getmail (Linux/cygwin via IMAP)** | $0 | Works, but IMAP misses Calendar + Contacts; messages aren't represented identically to Graph (different ID schemes). Plus Graph is the actually-supported API surface long-term; Microsoft has been slowly reducing IMAP feature parity. Same effort, worse result. |
| **Roll our own using IMAP** | $0 | Same as above. Graph + delta queries is strictly better than IMAP for this use case. |

The DIY-Graph choice is **just barely below** Veeam Community on the
ease-of-use axis (Veeam has a UI; we don't), but **substantially above**
on every other axis we care about (sovereignty, auditability, capacity-
building, cost growth).

---

## Phase 2 considerations

Things to revisit later, in rough order of likelihood:

| Trigger | What to do |
|---|---|
| Org grows past 10 active mailboxes | Nothing changes — Veeam would cost money at this point; our DIY stays $0. This is the moment the DIY choice starts paying off. |
| Need to back up Teams chat history | Channel chat history lives in a hidden Exchange folder per user (reachable via Graph's `/users/{id}/chats` + delta on `messages`). 1:1 chat history same shape. ~50 more lines. *Channel files* live in SharePoint, so they get covered when SharePoint backup is built. |
| Need to back up SharePoint (organizational documents) | Separate doc + separate pipeline — see `docs/365/sharepoint-backup.md` (open follow-up). Different scale, different design (could be hundreds of GB to TBs); not a 200-line PowerShell job. |
| Need to back up OneDrive | We've already decided **no** for steady-state — see [§ Decision: don't back up OneDrive](#decision-dont-back-up-onedrive). Only revisit if compliance / legal requires it. |
| Server moves to Azure (Arc-onboarded) | Switch the Entra app from client secret → federated credential against the server's managed identity. Closes the secret-rotation chore loop. |
| Want a nice restore UI for end-users | Build a small read-only web app on the Backup Server: serves `_index/messages.csv` as a search box, opens `.eml` files. ~1 day of work; staff can self-serve. |
| Compliance requirement to prove backup integrity | Add a daily checksum manifest run that signs the contents of each mailbox folder with a GPG key, written to a separate audit log. Cheap to add later. |
| Want immutable storage that's enforceable against insider threat | Move from BitLocker (encryption only — admin can still delete) to a true WORM (Write-Once-Read-Many) volume. Options: Azure Premium SSD v2 with managed identity + immutable blobs (already partially there); or a small dedicated NAS appliance. |

---

## Open follow-ups

Tracked here so they're visible when planning the next IT sprint.

| Task | Notes |
|---|---|
| Write the full `Get-M365Mail.ps1` script | Skeleton above is functional; production version needs error handling, throttling backoff, calendar + contacts loops, heartbeat — target `scripts/m365-backup/Get-M365Mail.ps1` |
| Write `Restore-M365Mail.ps1` | Per-message restore helper, used only during recovery (requires the separate time-limited admin grant — keep it OFF the backup server in normal operation) |
| Create the `skintyee-m365-backup` Entra app | Use the `az ad app create` block from [§ Entra app](#entra-app-skintyee-m365-backup); save credentials to 1Password |
| Provision the Azure Blob `skintyeem365backups` storage account + container + immutability policy + SAS | See [§ Secondary copy](#secondary-copy--azure-blob) |
| Install + configure Veeam-or-DIY on the Server 2022 | DIY chosen — install PS 7 + azcopy, set up BitLocker on D:, create service account, Task Scheduler entries |
| Initial full backup (first run) | Likely 4-12 hours depending on existing mailbox sizes; run during a weekend |
| Restore drill SOP into the IT lead's calendar | Monthly recurring; log results to `D:\M365-Backups\drill-log.md` |
| Quarterly alerting-path drill | `az monitor action-group test-notifications` against `ag-m365-backup-critical`; verify SMS, voice call, and email all arrive |
| Document key rotation procedure (24-month cadence) | Both the Entra client secret AND the Azure Blob SAS need rotation reminders |
| Write `docs/365/sharepoint-backup.md` | Separate unit of work; SharePoint document library backup (where org docs actually live; see [§ What this does NOT back up](#what-this-does-back-up--and-what-it-does-not)). Likely substantial data — needs its own design pass on storage sizing, dedup, and retention. |
| Write `docs/365/entra-backup.md` | Separate unit of work; backup of Entra ID (users, groups, roles, conditional access policies, app registrations, service principals). Different problem, different tooling — captured as a parallel project track. Initial stub at [`docs/365/entra-backup.md`](./entra-backup.md). |

---

## See also

- [`docs/SkinTyee.drawio.pdf`](../SkinTyee.drawio.pdf) — the architecture
  diagram this implements (page 2: "Email Relay" + "Backup Server" +
  "Email Backup Azure Storage" boxes)
- [`docs/hosting-costs.md`](../hosting-costs.md) — the broader NGO
  ownership-vs-rented-capability decision pattern
- [`docs/365/entra-usage.md`](./entra-usage.md) — other Entra apps in the
  tenant + their purposes (this'll join that list)
- [`docs/365/shared-mailboxes.md`](./shared-mailboxes.md) — operational
  notes on the M365 mailbox setup we're backing up
- [`docs/365/entra-backup.md`](./entra-backup.md) — **separate doc** for
  the Entra ID backup (users, groups, roles, app registrations, conditional
  access policies). Different problem space.
- `docs/365/sharepoint-backup.md` — **future**, separate doc for backing
  up SharePoint document libraries (where org docs actually live; could
  be hundreds of GB)
- [`docs/architecture-decisions.md`](../architecture-decisions.md) —
  ADR-13 for this decision (to be added)
- [Azure Monitor Action Groups](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/action-groups) — the SMS+voice+email notification path used above
- [Microsoft Graph delta query docs](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Microsoft Graph mail $value MIME endpoint](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0#example-4-get-mime-content)
