<#
.SYNOPSIS
  Mirror the local M365 email backup to the Azure Blob offsite copy.

.DESCRIPTION
  azcopy wrapper that syncs D:\backups\m365-email\ → the
  `m365-email-archive` container in the `skintyeebackups` storage
  account, using the write-only SAS token.

  Properties of the sync:
    --delete-destination=false  → append-only; cannot delete blobs
    --include-pattern '*'       → all file types
    SAS has 'cw' permissions    → create + write only (no delete, no read)
    Combined with the container's 90-day immutability policy:
      defence-in-depth — a compromised svc-backups account
      cannot delete the cloud archive.

  Called by Run-Backup.ps1 after Get-M365Mail.ps1 finishes the local copy.

.PARAMETER BackupRoot
  Local backup volume to mirror. Default: D:\backups\m365-email

.PARAMETER DryRun
  Pass --dry-run to azcopy (logs what would be uploaded, uploads nothing).

.ENV BLOB_URL_M365_EMAIL
  HTTPS URL of the `m365-email-archive` container. Set by Run-Backup.ps1
  from 1Password.

.ENV BLOB_SAS_M365_EMAIL
  Write-only SAS token. Set by Run-Backup.ps1 from 1Password.

.EXAMPLE
  pwsh -File Sync-ToAzure.ps1

.NOTES
  azcopy must be in PATH (installed by setup-backup-server.ps1).

  See: docs/365/email-backup.md § Secondary copy → Azure Blob
       docs/devops/backup-architecture.md § Container layout details
#>

[CmdletBinding()]
param(
  [string]$BackupRoot = "D:\backups\m365-email",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Say  ($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Die  ($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# ----- validate env --------------------------------------------------------
$blobUrl = $env:BLOB_URL_M365_EMAIL
$blobSas = $env:BLOB_SAS_M365_EMAIL

if (-not $blobUrl -or -not $blobSas) {
  Die "Missing BLOB_URL_M365_EMAIL or BLOB_SAS_M365_EMAIL env vars. Run via Run-Backup.ps1, not directly."
}

# ----- check azcopy --------------------------------------------------------
$azcopyExe = Get-Command azcopy -ErrorAction SilentlyContinue
if (-not $azcopyExe) {
  Die "azcopy not in PATH. Install via setup-backup-server.ps1 first."
}

# ----- log file ------------------------------------------------------------
$logDir = Join-Path (Split-Path $BackupRoot -Parent) "_logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "azure-sync-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"

Say "azcopy sync: $BackupRoot → $blobUrl"
Say "  delete-destination=false (append-only)"
Say "  log: $logFile"

# ----- run azcopy sync -----------------------------------------------------
$destUrl = "$blobUrl`?$blobSas"

$azcopyArgs = @(
  "sync",
  "`"$BackupRoot`"",
  "`"$destUrl`"",
  "--recursive=true",
  "--delete-destination=false",
  "--log-level=INFO"
)
if ($DryRun) { $azcopyArgs += "--dry-run" }

Say "executing azcopy…"
$azcopyOutput = & azcopy @azcopyArgs 2>&1
$azcopyExit = $LASTEXITCODE

$azcopyOutput | Out-File -FilePath $logFile -Append -Encoding utf8

if ($azcopyExit -eq 0) {
  # Extract summary line if available
  $summary = $azcopyOutput | Select-String -Pattern "Number of File Transfers" | Select-Object -First 1
  Ok "azcopy completed: $summary"
  exit 0
} else {
  Write-Host "  azcopy exited with code $azcopyExit" -ForegroundColor Red
  Write-Host "  full log: $logFile" -ForegroundColor Yellow
  $tail = Get-Content $logFile -Tail 10
  $tail | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  exit $azcopyExit
}
