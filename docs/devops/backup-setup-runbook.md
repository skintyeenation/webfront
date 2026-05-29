# Backup setup runbook — step-by-step

The "how to actually stand up the backup pipeline" doc. Walks through
provisioning **workload 1 (M365 email)** end-to-end, plus the
forward-looking entry points for workloads 2-5 when their scripts are
written.

**You will need ~30-45 minutes of focused time** + a ~4-12 hour wait for
the first backup to complete (subsequent nightly runs are 1-5 minutes).

Paired docs:
- [`./backup-architecture.md`](./backup-architecture.md) — the steady-state map (the *what*)
- [`../365/email-backup.md`](../365/email-backup.md) — the design rationale (the *why*)
- This doc — the *how*: every command to type, in order, with expected output

---

## Contents

| Section | What |
|---|---|
| [Phase 0 — Prerequisites](#phase-0--prerequisites) | What you need before starting |
| [Phase 1 — Cloud provisioning (on Mac)](#phase-1--cloud-provisioning) | Run `setup-backup-cloud.sh` |
| [Phase 2 — Save secrets to 1Password](#phase-2--save-secrets-to-1password) | Copy from the temp file into the right items |
| [Phase 3 — Server install (on Server 2022)](#phase-3--server-install) | Run `setup-backup-server.ps1` |
| [Phase 4 — 1Password CLI signin as svc-backups](#phase-4--1password-cli-signin) | One-time wiring |
| [Phase 5 — First backup (manual)](#phase-5--first-backup) | The big initial sync |
| [Phase 6 — Verify monitoring](#phase-6--verify-monitoring) | Confirm the alert path works |
| [Phase 7 — Schedule drills](#phase-7--schedule-drills) | Calendar entries |
| [Phase 8 — Add workloads 2-5 later](#phase-8--add-workloads-2-5) | What the equivalent looks like for SharePoint, Entra, Azure, Postgres |
| [Rollback + troubleshooting](#rollback--troubleshooting) | When things go wrong |
| [Restore runbook (separate)](#restore-runbook) | Pointer to recovery procedures |

---

## Phase 0 — Prerequisites

Before you start, confirm you have all of:

| # | Item | Notes |
|---|---|---|
| 0.1 | **Mac with `az` CLI + `jq` installed** | `brew install azure-cli jq` if missing |
| 0.2 | **Signed into `az` as a subscription Owner or Contributor + Entra ID Global Admin** | `az login` → pick the `skintyeenation` tenant. Need Global Admin for the admin-consent step. |
| 0.3 | **Physical Windows Server 2022** (or 2019) onsite | Local Administrator access; D: volume with ≥500 GB free; outbound 443 to internet |
| 0.4 | **1Password Business — IT/Admin vault** | Will create ~5 new items; have the vault open |
| 0.5 | **Mobile phone for SMS + voice receiver** | The IT lead's phone — receives backup-missed alerts. Have country code + number ready (e.g. `+1-250-555-0100`) |
| 0.6 | **Alert email address** | Likely `it@skintyee.ca` or `alerts@skintyee.ca` shared mailbox |
| 0.7 | **The repo cloned** to the Mac | `git clone …/webfront.git && cd webfront` |
| 0.8 | **The repo accessible from the Server 2022** | Or copy `scripts/setup-backup-server.ps1` + `scripts/m365-backup/*.ps1` over manually |

**Save these phone + email values before continuing** — Phase 1 will ask
for them and saving them to 1Password first means you can paste-from-clipboard
during the script run.

| Field | Value |
|---|---|
| SMS phone (e.g. +1-2505550100) | `__________________` |
| Voice phone (can be same) | `__________________` |
| Alert email | `__________________` |

---

## Phase 1 — Cloud provisioning

**On your Mac**, from the repo root. Takes ~3-5 minutes.

### 1.1 Sign into Azure

```bash
az login
az account show
```

Verify the subscription + tenant ID match `skintyeenation`:

```
Tenant: ee46daed-e89f-4438-b1f7-dc26203a4bec   (skintyeenation)
Sub:    8d847916-9aeb-4e92-ba2f-2c3579826c0e   (Azure subscription 1)
```

If wrong, `az account set --subscription <correct-id>`.

### 1.2 Dry-run first (optional but recommended)

```bash
bash scripts/setup-backup-cloud.sh --dry-run
```

This shows you EVERY `az` command the script will run, but executes
nothing. Look for: "create storage account", "create 5 containers",
"create Entra app", "create Action Group", etc. If anything looks
wrong, fix and re-run; nothing has changed in Azure yet.

### 1.3 Real run

```bash
bash scripts/setup-backup-cloud.sh
```

The script will:

1. **Register Azure resource providers** (if not already)
2. **Create storage account `skintyeebackups`** with versioning + soft-delete
3. **Create 5 containers** (m365-email-archive, m365-sharepoint-archive,
   entra-snapshots, azure-snapshots, postgres-dumps) — each with a
   90-day immutability policy + write-only SAS (1-year expiry)
4. **Create Application Insights** `ai-backup`
5. **Prompt for SMS / voice / email** — paste the values you saved in Phase 0.5/0.6
6. **Create Action Group `ag-backup-critical`** with the three channels
7. **Optionally test the Action Group** — if you say yes, sends a REAL SMS + voice call + email to verify the path. **Do this** — an alert path you haven't tested is theoretical.
8. **Create 2 metric alert rules** for missing-heartbeat + explicit-failure
9. **Create Entra app `skintyee-m365-backup`** with 4 read-only Graph permissions
10. **Grant admin consent** (interactive — may open a browser if not signed in as admin)
11. **Create a 24-month client secret**
12. **Write ALL secrets to a temp file** with mode 600

Expected total time: **3-5 minutes**.

At the end you'll see:

```
✔ All secrets written to:
  /tmp/.../skintyee-backup-secrets.txt

COPY TO 1Password, then: rm "/tmp/.../skintyee-backup-secrets.txt"
```

**Don't close the terminal yet** — keep that path visible for Phase 2.

---

## Phase 2 — Save secrets to 1Password

The temp file from Phase 1 contains:

```
TENANT_ID=ee46daed-e89f-4438-b1f7-dc26203a4bec
M365_APP_ID=<guid>
M365_CLIENT_SECRET=<long secret value>

STORAGE_ACCOUNT=skintyeebackups
SAS_m365_email_archive=<sas token>
SAS_m365_sharepoint_archive=<sas token>
SAS_entra_snapshots=<sas token>
SAS_azure_snapshots=<sas token>
SAS_postgres_dumps=<sas token>

AI_CONNECTION_STRING=InstrumentationKey=...;IngestionEndpoint=https://...
AI_INSTRUMENTATION_KEY=<guid>
```

Create **three** items in **1Password → IT/Admin vault**. Use these
exact item names (the scripts read them with these names; renaming
breaks the pipeline):

### Item 1: `skintyee-m365-backup`

Type: API Credential (or Secure Note)

| Field | Value (from temp file) |
|---|---|
| `tenantId` | `TENANT_ID` |
| `appId` | `M365_APP_ID` |
| `clientSecret` | `M365_CLIENT_SECRET` |
| `expires` | The expiry date the script printed (set a calendar reminder for 30 days before) |

### Item 2: `m365-backup-blob-sas`

Type: API Credential

| Field | Value |
|---|---|
| `storageAccount` | `skintyeebackups` |
| `container` | `m365-email-archive` |
| `sasToken` | `SAS_m365_email_archive` |
| `blobUrl` | `https://skintyeebackups.blob.core.windows.net/m365-email-archive` |

(Save the other 4 SAS tokens for now too — make 4 more items
`<workload>-backup-blob-sas` for entra-snapshots, azure-snapshots,
postgres-dumps, sharepoint-archive when those workloads are stood up.
For Phase 1 of this runbook, only the m365 one is needed.)

### Item 3: `m365-backup-ai`

Type: API Credential

| Field | Value |
|---|---|
| `connectionString` | `AI_CONNECTION_STRING` |
| `instrumentationKey` | `AI_INSTRUMENTATION_KEY` |

### Then delete the temp file

```bash
rm /tmp/.../skintyee-backup-secrets.txt   # exact path was printed by the script
```

Verify it's gone:

```bash
ls /tmp/tmp.* 2>/dev/null | grep skintyee
# should print nothing
```

---

## Phase 3 — Server install

**On the Server 2022**, signed in as a local Administrator. Takes ~10-15
minutes including the BitLocker pause.

### 3.1 Get the scripts onto the server

Option A — clone the repo locally on the server:

```powershell
git clone https://dev.azure.com/skintyeenation/webfront/_git/webfront C:\webfront
cd C:\webfront
```

Option B — copy just the needed files (if the server can't reach ADO):

Copy these from your Mac to `C:\webfront\` (preserving the relative
paths):
- `scripts/setup-backup-server.ps1`
- `scripts/m365-backup/Get-M365Mail.ps1`
- `scripts/m365-backup/Run-Backup.ps1`
- `scripts/m365-backup/Sync-ToAzure.ps1`
- `scripts/m365-backup/Restore-M365Mail.ps1`

### 3.2 Dry-run first

```powershell
pwsh -ExecutionPolicy Bypass -File scripts\setup-backup-server.ps1 -DryRun
```

(If `pwsh` isn't installed yet, use `powershell.exe` for the first run
— the script will install PowerShell 7 then continue.)

Confirms all checks pass + shows what installations would happen.

### 3.3 Real run

```powershell
pwsh -ExecutionPolicy Bypass -File scripts\setup-backup-server.ps1
```

The script will:

1. **Verify Administrator + Server 2022 + D: volume**
2. **Install PowerShell 7** (via `winget` or direct MSI; ~2 min)
3. **Install azcopy** to `C:\Tools\azcopy\` (~30 sec)
4. **Install 1Password CLI (`op`)** (~30 sec)
5. **Enable BitLocker on D:** — **INTERACTIVE PAUSE**: type a strong
   password, then save the recovery key to 1Password
6. **Create local service account `svc-backups`** with random password —
   **INTERACTIVE PAUSE**: save the password to 1Password
7. **Grant batch logon right + folder ACLs**
8. **Create folder tree** `D:\backups\{m365-email,m365-sharepoint,...}`
9. **Copy backup scripts** to `C:\Scripts\m365-backup\`
10. **Configure firewall** (outbound 443 allow rule for svc-backups)
11. **Register Task Scheduler entries**:
    - `M365-Backup-Nightly` (daily 02:00; runs as svc-backups)
    - `Backup-Log-Rotation` (Sunday 03:00)
12. **Verify the chain** with a dry-run of Run-Backup.ps1

When the script prompts for the **service account password** to set on
the Task Scheduler entry, paste the same password you just saved to
1Password (1Password CLI doesn't exist yet for Task Scheduler to read).

### 3.4 Two more 1Password items to create

**Item 4: `server-bitlocker-d-recovery`** (in IT/Admin)
- field `recoveryKey`: the 48-digit recovery key the script displayed

**Item 5: `server-backups-svc-account`** (in IT/Admin)
- field `username`: `svc-backups`
- field `password`: the random password the script generated

---

## Phase 4 — 1Password CLI signin

The Task Scheduler entry runs as `svc-backups`, so 1Password CLI has to
be signed in *as svc-backups* — not as you.

### 4.1 Get a 1Password Service Account token

In the 1Password Business admin console
(<https://skintyeenation.1password.com>) → Integrations → Service
Accounts → **Create Service Account**:

- Name: `svc-backups-server-2022`
- Vaults: read-only on `IT-Admin`
- Save the token (shown once)

### 4.2 Set the token in the svc-backups user context

On the Server 2022 as Administrator:

```powershell
# Switch to a svc-backups shell
runas /user:svc-backups powershell.exe

# Inside the new window:
$env:OP_SERVICE_ACCOUNT_TOKEN = "ops_..."   # paste the token
[Environment]::SetEnvironmentVariable("OP_SERVICE_ACCOUNT_TOKEN", $env:OP_SERVICE_ACCOUNT_TOKEN, "User")

# Test that op can read the M365 backup credentials
op read "op://IT-Admin/skintyee-m365-backup/tenantId"
# should print the tenant GUID

# Close the svc-backups window
exit
```

### 4.3 Verify

Back in the Administrator shell:

```powershell
runas /user:svc-backups "pwsh -Command op read 'op://IT-Admin/skintyee-m365-backup/tenantId'"
```

Should print the tenant ID.

---

## Phase 5 — First backup

**The first run is the big one** — it walks every message ever in every
mailbox, downloads the MIME body for each as `.eml`, and persists delta
tokens so subsequent runs can resume from where this one ends.

Expected runtime: **4-12 hours** depending on total mailbox size.
Subsequent nightly runs finish in **1-5 minutes**.

### 5.1 Run it manually first

Don't wait for Task Scheduler at 02:00; kick it off interactively so
you can watch the output:

```powershell
runas /user:svc-backups "pwsh -File C:\Scripts\m365-backup\Run-Backup.ps1"
```

You'll see:

```
▸ M365-Backup-Nightly: 2026-05-28T...
▸ loading credentials from 1Password…
  ✓ credentials loaded
▸ running Get-M365Mail.ps1…
▸ M365 backup starting (DryRun=False, BackupRoot=D:\backups\m365-email)
▸ acquiring Graph token…
  token acquired (valid ~1 hour)
▸ enumerating enabled users…
  found 5 mailboxes
▸ lucas.lopatka@skintyee.ca
  ...
▸ summary: +N new files, ~M deleted-upstream, 0 errors across 5 mailboxes
  pushed metric m365_backup_success_total=1 to Application Insights
✓ done
▸ running Sync-ToAzure.ps1…
▸ azcopy sync: D:\backups\m365-email → https://skintyeebackups.blob.core.windows.net/m365-email-archive
  ...
  ✓ azcopy completed: Number of File Transfers Completed: N
✓ Run-Backup completed successfully
```

### 5.2 Confirm on disk

```powershell
Get-ChildItem D:\backups\m365-email\mailboxes\ -Recurse -Filter "*.eml" | Measure-Object | Select-Object -ExpandProperty Count
# should print: <total .eml files written>
```

### 5.3 Confirm in Azure Blob

From your Mac:

```bash
az storage blob list \
  --account-name skintyeebackups \
  --container-name m365-email-archive \
  --auth-mode login \
  --query 'length(@)' -o tsv
# should print: <total blobs uploaded>
```

### 5.4 Confirm the heartbeat metric

```bash
az monitor metrics list \
  --resource $(az monitor app-insights component show --app ai-backup --resource-group skintyee-prod-rg --query id -o tsv) \
  --metric "customMetrics/m365_backup_success_total" \
  --interval PT1H
```

Should show value=1 at the time you ran the backup.

---

## Phase 6 — Verify monitoring

**An alert path you haven't tested is a broken alert path.** Verify
quarterly — first time is now.

### 6.1 Manual Action Group test

```bash
az monitor action-group test-notifications create \
  --resource-group skintyee-prod-rg \
  --action-group ag-backup-critical \
  --alert-type metricstaticthreshold
```

Within ~60 seconds you should receive:
- ✉ An email at the alert address
- 📱 An SMS to the phone you registered
- 📞 A phone call (automated voice reads the alert text)

If any channel doesn't arrive, fix the Action Group BEFORE relying on
the pipeline:

```bash
az monitor action-group update \
  --name ag-backup-critical \
  --resource-group skintyee-prod-rg \
  --action email it-lead it@skintyee.ca \
  --action sms it-lead 1 2505550100 \
  --action voice it-lead 1 2505550100
```

### 6.2 Simulate a missed heartbeat (optional)

Delete the heartbeat file and wait 36 hours; the alert should fire.
Then restore it:

```powershell
Remove-Item D:\backups\_alerting\.last-success-m365-email
# wait ~36 hours, alert should fire
New-Item -ItemType File D:\backups\_alerting\.last-success-m365-email -Force
(Get-Item D:\backups\_alerting\.last-success-m365-email).LastWriteTime = Get-Date
```

Skip if you'd rather not wait 36 hours; the metric-test in 6.1 covers
most of the path.

---

## Phase 7 — Schedule drills

Add these to the IT lead's calendar (recurring):

| Drill | Cadence | What | Log to |
|---|---|---|---|
| **Restore drill** | Monthly (1st of month) | Use `Restore-M365Mail.ps1 -ListMode` + `-RestoreToFile` to recover a random message; confirm it opens in Outlook | `D:\backups\drill-log.md` |
| **Alerting drill** | Quarterly (1/Jan, 1/Apr, 1/Jul, 1/Oct) | Run `az monitor action-group test-notifications create`; verify SMS + voice + email arrive | `D:\backups\drill-log.md` |
| **Client secret rotation reminder** | 30 days before secret expiry | Generate new secret in Entra; update 1Password item; restart Task Scheduler entry | n/a |
| **SAS token rotation reminder** | 30 days before SAS expiry (annual) | Re-run `setup-backup-cloud.sh`; update 1Password | n/a |

The drill log format is already initialized by `setup-backup-server.ps1`
at `D:\backups\drill-log.md`. Append one row per drill.

---

## Phase 8 — Add workloads 2-5

This runbook covers workload 1 (M365 email) in detail because that's
the one with shipped scripts. The other four workloads share the same
shape — same storage account, same alerting, same drill cadence — but
need their own per-workload Entra app + script.

When you're ready to stand up another workload:

| Workload | Doc | What's needed |
|---|---|---|
| **2. M365 SharePoint** | `docs/365/sharepoint-backup.md` *(planning future)* | Write the planning doc first — needs design pass on storage sizing (could be TBs) + retention. Once planned, mirror the m365-email shape: new Entra app `skintyee-sharepoint-backup`, new `Get-SharePoint.ps1` script, new Task Scheduler entry. |
| **3. Entra ID** | [`../365/entra-backup.md`](../365/entra-backup.md) | Planning doc done. Next: Entra app `skintyee-entra-backup` with `Directory.Read.All` + `Application.Read.All` + `Policy.Read.All`; write `scripts/entra-backup/Get-EntraConfig.ps1`; update `setup-backup-cloud.sh` to also create that Entra app; add the Task Scheduler entry to `setup-backup-server.ps1`. |
| **4. Azure resource config** | [`./azure-backup.md`](./azure-backup.md) | Planning doc done. Next: SP `skintyee-azure-backup` with Reader on the subscription; `scripts/azure-backup/snapshot-azure.sh`; etc. |
| **5. Postgres data** | [`./postgres-backup.md`](./postgres-backup.md) | Planning doc done. Phase 2 work. Microsoft's 7-day PITR covers the near-term floor. When you're ready: `scripts/postgres-backup/dump-and-upload.sh`, GFS rotation, GPG-encryption, the `postgres-dumps` container already exists. |

When implementing any of these, **extend this runbook** with a new phase
showing the exact steps for that workload.

---

## Rollback + troubleshooting

### "I want to undo Phase 1 (cloud provisioning)"

```bash
# Caution: this DELETES the storage account + everything in it.
# Containers with active immutability policies REFUSE to be deleted —
# you'd need to wait for the 90-day policy to expire OR have it
# unlocked. (Phase 1 leaves the policy unlocked specifically so this
# rollback is possible early in the lifecycle.)

az storage account delete --name skintyeebackups --resource-group skintyee-prod-rg --yes
az monitor app-insights component delete --app ai-backup --resource-group skintyee-prod-rg
az monitor action-group delete --name ag-backup-critical --resource-group skintyee-prod-rg
az ad app delete --id $(az ad app list --display-name skintyee-m365-backup --query '[0].appId' -o tsv)

# Then delete the 1Password items.
```

### "I want to undo Phase 3 (server install)"

```powershell
# Remove Task Scheduler entries
Unregister-ScheduledTask -TaskName "M365-Backup-Nightly" -Confirm:$false
Unregister-ScheduledTask -TaskName "Backup-Log-Rotation" -Confirm:$false

# Optionally remove service account (keeps backup data)
Remove-LocalUser -Name svc-backups

# Optionally remove BitLocker (data on D: will be wiped if you decrypt
# without the recovery key)
Disable-BitLocker -MountPoint "D:"
```

### Common failures and fixes

| Symptom | Fix |
|---|---|
| `setup-backup-cloud.sh` fails on `az ad app create` with "Insufficient privileges" | You're not signed in as a Global Admin. Sign out + sign in with the break-glass admin. |
| `setup-backup-cloud.sh` fails on `az storage container immutability-policy create` with "operation is not allowed" | The storage account requires this to be done via ARM template. Workaround: create the policy via portal, then continue. |
| `setup-backup-server.ps1` fails: `BitLocker is not installed` | Install the feature: `Install-WindowsFeature -Name BitLocker -IncludeAllSubFeature -Restart` |
| `Run-Backup.ps1` fails: `op read returned empty values` | Phase 4 wasn't completed correctly. Re-do Phase 4 as svc-backups user. |
| `Get-M365Mail.ps1` fails: `401 Unauthorized` | Either the client secret is expired (re-create via `az ad app credential reset`) or admin consent was revoked (re-grant in Entra portal). |
| `Sync-ToAzure.ps1` fails: `AuthenticationFailed` | SAS expired. Re-run `setup-backup-cloud.sh`; update 1Password item `m365-backup-blob-sas/sasToken`. |
| `Get-M365Mail.ps1` runs but Application Insights metric never appears | Connection string in 1Password is wrong, OR custom metrics from a self-hosted PS script have a ~5 min ingestion delay. Wait + recheck. |

---

## Restore runbook

This doc is about **standing up the backup**. When you actually need to
**restore** something:

| Scenario | See |
|---|---|
| One accidentally-deleted email | [`../365/email-backup.md` § Restore procedure A](../365/email-backup.md#restore-procedure) — uses `Restore-M365Mail.ps1 -ListMode` + `-RestoreToFile` |
| Whole mailbox (account hijacked / deleted) | [`../365/email-backup.md` § Restore procedure B](../365/email-backup.md#restore-procedure) — first try M365's 30-day soft delete; failing that, `Restore-M365Mail.ps1 -RestoreToMailbox` with the time-limited admin app |
| Offsite (Server 2022 destroyed) | [`../365/email-backup.md` § Restore procedure C](../365/email-backup.md#restore-procedure) — `azcopy sync` in reverse from the Blob copy |
| Full subscription rebuild (config + content lost) | (future) `docs/devops/disaster-recovery.md` — composes recovery from the 5 backup workload archives |

---

## See also

- [`./backup-architecture.md`](./backup-architecture.md) — the architecture map
- [`../365/email-backup.md`](../365/email-backup.md) — the design rationale + alternatives considered
- [`../365/entra-backup.md`](../365/entra-backup.md) — workload 3 planning
- [`./azure-backup.md`](./azure-backup.md) — workload 4 planning
- [`./postgres-backup.md`](./postgres-backup.md) — workload 5 planning
- [`./azure-naming.md`](./azure-naming.md) — the `skintyeebackups` naming decision + resource catalog
- [`../../scripts/setup-backup-cloud.sh`](../../scripts/setup-backup-cloud.sh) — Phase 1 script
- [`../../scripts/setup-backup-server.ps1`](../../scripts/setup-backup-server.ps1) — Phase 3 script
- [`../../scripts/m365-backup/README.md`](../../scripts/m365-backup/README.md) — script-package operational doc
