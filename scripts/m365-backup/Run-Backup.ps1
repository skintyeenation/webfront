<#
.SYNOPSIS
  Wrapper that loads credentials from 1Password and runs the nightly
  M365 backup → Azure mirror chain.

.DESCRIPTION
  This is the entrypoint that Windows Task Scheduler invokes nightly.
  Responsibilities:

    1. Fetch credentials from 1Password CLI (op) — never writes secrets
       to disk in plaintext; they live only in process memory + env vars
       passed to child scripts
    2. Run Get-M365Mail.ps1 (the actual backup workhorse)
    3. Run Sync-ToAzure.ps1 (mirror to Azure Blob offsite copy)
    4. Exit non-zero on any failure (so Task Scheduler triggers the
       on-failure alert action)

  Idempotent — both child scripts handle re-entry correctly.

.PARAMETER DryRun
  Pass through to children; they'll skip writes + Azure uploads.

.EXAMPLE
  pwsh -File Run-Backup.ps1

.NOTES
  Requires 1Password CLI signed in as svc-backups (one-time setup):
    op signin --account skintyeenation

  See: docs/365/email-backup.md § Scheduling → Credential injection
#>

[CmdletBinding()]
param(
  [switch]$DryRun,
  [string]$ScriptRoot = $PSScriptRoot,
  [string]$BackupRoot = "D:\backups\m365-email"
)

$ErrorActionPreference = "Stop"

function Say  ($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Die  ($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

Say "M365-Backup-Nightly: $(Get-Date -Format o)"

# ----- 1) Load credentials from 1Password CLI ------------------------------
Say "loading credentials from 1Password…"
$opExe = Get-Command op -ErrorAction SilentlyContinue
if (-not $opExe) {
  Die "1Password CLI (op) not found in PATH. Install via setup-backup-server.ps1 or manually."
}

try {
  $env:M365_TENANT_ID     = (op read "op://IT-Admin/skintyee-m365-backup/tenantId") 2>$null
  $env:M365_CLIENT_ID     = (op read "op://IT-Admin/skintyee-m365-backup/appId") 2>$null
  $env:M365_CLIENT_SECRET = (op read "op://IT-Admin/skintyee-m365-backup/clientSecret") 2>$null
  $env:AI_CONNECTION_STRING = (op read "op://IT-Admin/m365-backup-ai/connectionString") 2>$null
  $env:BLOB_SAS_M365_EMAIL = (op read "op://IT-Admin/m365-backup-blob-sas/sasToken") 2>$null
  $env:BLOB_URL_M365_EMAIL = (op read "op://IT-Admin/m365-backup-blob-sas/blobUrl") 2>$null
} catch {
  Die "couldn't read credentials from 1Password — make sure 'op signin' was run as the svc-backups account.`nError: $_"
}

if (-not $env:M365_TENANT_ID -or -not $env:M365_CLIENT_ID -or -not $env:M365_CLIENT_SECRET) {
  Die "1Password read returned empty values for required credentials. Verify the 1Password item 'skintyee-m365-backup' has: tenantId, appId, clientSecret"
}
Ok "credentials loaded"

# ----- 2) Run Get-M365Mail.ps1 ---------------------------------------------
$getScript = Join-Path $ScriptRoot "Get-M365Mail.ps1"
if (-not (Test-Path $getScript)) {
  Die "$getScript not found"
}

Say "running Get-M365Mail.ps1…"
$getArgs = @("-File", $getScript, "-BackupRoot", $BackupRoot)
if ($DryRun) { $getArgs += "-DryRun" }
$getProcess = Start-Process -FilePath "pwsh.exe" -ArgumentList $getArgs -NoNewWindow -Wait -PassThru
$getExit = $getProcess.ExitCode
if ($getExit -ne 0) {
  Warn "Get-M365Mail.ps1 exited $getExit — continuing to Sync-ToAzure for the data we DID collect, then will exit non-zero"
} else {
  Ok "Get-M365Mail.ps1 completed cleanly"
}

# ----- 3) Run Sync-ToAzure.ps1 ---------------------------------------------
$syncScript = Join-Path $ScriptRoot "Sync-ToAzure.ps1"
if (-not (Test-Path $syncScript)) {
  Warn "$syncScript not found — skipping Azure mirror"
  $syncExit = 0
} else {
  Say "running Sync-ToAzure.ps1…"
  $syncArgs = @("-File", $syncScript, "-BackupRoot", $BackupRoot)
  if ($DryRun) { $syncArgs += "-DryRun" }
  $syncProcess = Start-Process -FilePath "pwsh.exe" -ArgumentList $syncArgs -NoNewWindow -Wait -PassThru
  $syncExit = $syncProcess.ExitCode
  if ($syncExit -ne 0) {
    Warn "Sync-ToAzure.ps1 exited $syncExit"
  } else {
    Ok "Sync-ToAzure.ps1 completed cleanly"
  }
}

# ----- 4) Exit ---------------------------------------------------------------
# Clear secrets from env (defence-in-depth)
$env:M365_CLIENT_SECRET = $null
$env:BLOB_SAS_M365_EMAIL = $null

if ($getExit -ne 0 -or $syncExit -ne 0) {
  Die "Run-Backup completed with errors (get=$getExit sync=$syncExit). Task Scheduler will fire the alert action."
} else {
  Ok "Run-Backup completed successfully"
  exit 0
}
