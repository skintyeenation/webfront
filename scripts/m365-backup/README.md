# scripts/m365-backup/

PowerShell scripts that implement the nightly M365 email backup pipeline
described in [`docs/365/email-backup.md`](../../docs/365/email-backup.md).

## The four scripts

| Script | Run by | When | Purpose |
|---|---|---|---|
| **`Run-Backup.ps1`** | Task Scheduler (as `svc-backups`) | Nightly 02:00 | Wrapper: loads creds from 1Password CLI, invokes Get + Sync, exits non-zero on any failure (triggers the alerting path) |
| **`Get-M365Mail.ps1`** | `Run-Backup.ps1` | Same | The actual workhorse: Graph delta queries, downloads MIME, files by mailbox/year/month/, persists delta tokens for resume, pushes heartbeat metric to Application Insights |
| **`Sync-ToAzure.ps1`** | `Run-Backup.ps1` | After Get-M365Mail | `azcopy sync` to the `m365-email-archive` container in `skintyeebackups` storage account using the write-only SAS |
| **`Restore-M365Mail.ps1`** | IT admin, by hand | Recovery scenarios | List / copy-out / re-upload — three modes; the re-upload mode requires a SEPARATE Entra app with `Mail.ReadWrite` (NOT the backup app) |

## Setup (one-time)

1. **Provision the cloud infrastructure** — from your Mac:
   ```bash
   bash scripts/setup-backup-cloud.sh
   ```
   This creates the storage account, containers, Entra app for the
   backup, Application Insights, Action Group with SMS+voice+email.
   Outputs secrets to copy into 1Password.

2. **Provision the server** — on Windows Server 2022, as Administrator:
   ```powershell
   pwsh -File scripts/setup-backup-server.ps1
   ```
   Installs PowerShell 7, azcopy, 1Password CLI, BitLocker, the
   service account, the folder tree, copies these scripts to
   `C:\Scripts\m365-backup\`, and registers the Task Scheduler entry.

3. **Sign 1Password CLI in as `svc-backups`** — once per server:
   ```powershell
   runas /user:svc-backups "op signin --account skintyeenation"
   ```

4. **Test by hand** — run a backup manually before the first nightly:
   ```powershell
   pwsh -File C:\Scripts\m365-backup\Run-Backup.ps1 -DryRun  # preview
   pwsh -File C:\Scripts\m365-backup\Run-Backup.ps1          # real run
   ```

   First real run will be slow (4-12h depending on mailbox sizes — it
   walks every message ever, not just new ones). Subsequent nightly
   runs finish in minutes thanks to delta queries.

## Credentials — none on disk

All credentials are read at task-start time from 1Password CLI:

- `op://IT-Admin/skintyee-m365-backup/tenantId`
- `op://IT-Admin/skintyee-m365-backup/appId`
- `op://IT-Admin/skintyee-m365-backup/clientSecret`
- `op://IT-Admin/m365-backup-ai/connectionString`
- `op://IT-Admin/m365-backup-blob-sas/sasToken`
- `op://IT-Admin/m365-backup-blob-sas/blobUrl`

Once loaded into env vars, they're passed to child scripts and cleared
on exit. They're never written to disk, never logged, never appear in
the Windows Event Log.

If 1Password CLI is unavailable, the scripts fall back to direct env
vars (set them in your shell before running, useful for ad-hoc tests).

## Monitoring

- **Heartbeat metric**: `Get-M365Mail.ps1` pushes
  `m365_backup_success_total` (or `m365_backup_failure_total`) to
  Application Insights on every run
- **Alert rules**: `m365-backup-missing-heartbeat` (36-hour window) and
  `m365-backup-failed` (explicit failure) → Action Group
  `ag-backup-critical` → SMS + voice call + email to the IT lead
- **Local heartbeat file**: `D:\backups\_alerting\.last-success-m365-email`
  touched on every successful run; check `.LastWriteTime` for sanity

See [`docs/365/email-backup.md` § Monitoring & alerting](../../docs/365/email-backup.md#monitoring--alerting)
for the full alerting setup.

## Drill

- **Monthly** (1st of each month): restore one random message via
  `Restore-M365Mail.ps1 -ListMode` + `-RestoreToFile`. Log the result
  in `D:\backups\drill-log.md`.
- **Quarterly** (1/Jan, 1/Apr, 1/Jul, 1/Oct): trigger a test of the
  alerting Action Group: `az monitor action-group test-notifications create`.
  Verify SMS arrives, voice call comes in, email arrives.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `1Password CLI (op) not found in PATH` | Not installed, or installed for a different user than `svc-backups` | Re-run `setup-backup-server.ps1`; verify `op` is in the system PATH |
| `op read` returns empty | `svc-backups` hasn't signed into 1Password yet, or the item names are wrong | `runas /user:svc-backups "op signin --account skintyeenation"`; verify item names match those listed above |
| Graph returns 429 (throttled) | Microsoft rate-limited the app | Script handles automatically — sleeps `Retry-After` and resumes |
| `Get-M365Mail.ps1` fails with "401 Unauthorized" | Client secret expired or admin consent revoked | Rotate the secret via `az ad app credential reset --id <appId>`; if consent issue, re-grant in the Entra portal |
| `azcopy sync` fails with "AuthenticationFailed" | SAS token expired or invalid | Re-run `setup-backup-cloud.sh` to mint fresh SAS; update 1Password |
| Heartbeat fires the alert path but the script DID succeed | Application Insights propagation delay (rare) or AI metric definition not yet created | Check `D:\backups\_alerting\.last-success-m365-email` mtime; if recent, alert is spurious |

## See also

- [`../setup-backup-cloud.sh`](../setup-backup-cloud.sh) — provisions everything in Azure
- [`../setup-backup-server.ps1`](../setup-backup-server.ps1) — installs on Server 2022
- [`docs/365/email-backup.md`](../../docs/365/email-backup.md) — full runbook
- [`docs/devops/backup-architecture.md`](../../docs/devops/backup-architecture.md) — 5-workload architecture
