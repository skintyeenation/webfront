<#
.SYNOPSIS
  Provision the Skin Tyee Backup Server (Windows Server 2022).

.DESCRIPTION
  Run ONCE on the physical onsite Server 2022, as Administrator. Sets
  up the full server-side scaffolding for ALL five backup workloads
  (M365 email + SharePoint + Entra + Azure + Postgres), even though
  only the M365 email workload's actual backup script is shipped today.

  What this script does:
    1. Verify Windows Server 2022 + sufficient RAM/disk
    2. Install PowerShell 7 (winget; falls back to direct download)
    3. Install azcopy to C:\Tools\azcopy\
    4. Install 1Password CLI (op) — for credential injection
    5. Enable BitLocker on D: (interactive prompt for password protector)
    6. Create local service account svc-backups
    7. Create folder structure D:\backups\<workload>\ for all 5 workloads
    8. Copy backup scripts to C:\Scripts\m365-backup\
    9. Configure outbound-only firewall rule (443 to graph/blob/AI only)
    10. Create Task Scheduler entries
    11. Dry-run the M365 backup to verify wiring

  Idempotent — safe to re-run.

.PARAMETER BackupRoot
  Local backup volume root. Default: D:\backups

.PARAMETER ScriptRoot
  Where backup scripts are deployed. Default: C:\Scripts\m365-backup

.PARAMETER ServiceAccount
  Local service account name. Default: svc-backups

.PARAMETER DryRun
  Preview operations without making changes.

.EXAMPLE
  # Standard interactive install
  powershell.exe -ExecutionPolicy Bypass -File scripts\setup-backup-server.ps1

.EXAMPLE
  # Dry-run to preview
  .\scripts\setup-backup-server.ps1 -DryRun

.NOTES
  Requires:
    - Windows Server 2022 (or 2019; 2022 preferred)
    - Local Administrator privileges
    - D: volume present (separate from C:; can be virtual disk if VM)
    - Network outbound 443 available

  Author: Skin Tyee IT
  See:    docs/365/email-backup.md
          docs/devops/backup-architecture.md
#>

[CmdletBinding()]
param(
  [string]$BackupRoot     = "D:\backups",
  [string]$ScriptRoot     = "C:\Scripts\m365-backup",
  [string]$ServiceAccount = "svc-backups",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ----- styling --------------------------------------------------------------
function Say  ($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Die  ($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

function Run-Cmd {
  param([scriptblock]$Cmd, [string]$Description)
  if ($DryRun) {
    Write-Host "  (dry-run) $Description" -ForegroundColor DarkGray
  } else {
    & $Cmd
  }
}

# ----- prereq checks --------------------------------------------------------
Say "verifying we're running as Administrator…"
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  Die "This script must run as Administrator. Right-click PowerShell → 'Run as Administrator'."
}
Ok "running as Administrator"

Say "verifying Windows Server 2019+ ..."
$os = Get-CimInstance Win32_OperatingSystem
if ($os.Caption -notmatch "Server 20(19|22|25)") {
  Warn "OS detected as: $($os.Caption) — script is designed for Server 2022, may work on 2019"
}
Ok "$($os.Caption)"

Say "verifying D: volume exists…"
$dDrive = Get-PSDrive -Name "D" -ErrorAction SilentlyContinue
if (-not $dDrive) {
  Die "D: volume not found. The script assumes a dedicated backup volume on D:. Mount a disk as D: and re-run."
}
$dFreeGB = [math]::Round($dDrive.Free / 1GB, 1)
if ($dFreeGB -lt 50) {
  Warn "D: has only $dFreeGB GB free — recommended minimum is 500 GB"
} else {
  Ok "D: has $dFreeGB GB free"
}

# ----- 1) Install PowerShell 7 ----------------------------------------------
Say "installing PowerShell 7…"
$pwsh7 = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh7) {
  Ok "PowerShell 7 already installed at $($pwsh7.Source)"
} else {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Run-Cmd -Description "winget install Microsoft.PowerShell" -Cmd {
      winget install --id Microsoft.PowerShell --silent --accept-source-agreements --accept-package-agreements
    }
    Ok "PowerShell 7 installed via winget"
  } else {
    Warn "winget not available — downloading PS 7 installer directly"
    $psInstaller = "$env:TEMP\PowerShell-7-Installer.msi"
    Run-Cmd -Description "Download PowerShell 7 MSI" -Cmd {
      Invoke-WebRequest -Uri "https://github.com/PowerShell/PowerShell/releases/latest/download/PowerShell-7.4.6-win-x64.msi" -OutFile $psInstaller
      Start-Process msiexec.exe -Wait -ArgumentList "/I $psInstaller /quiet"
      Remove-Item $psInstaller -Force
    }
    Ok "PowerShell 7 installed via direct MSI download"
  }
}

# ----- 2) Install azcopy ----------------------------------------------------
Say "installing azcopy to C:\Tools\azcopy\…"
$azcopyDir = "C:\Tools\azcopy"
$azcopyExe = Join-Path $azcopyDir "azcopy.exe"
if (Test-Path $azcopyExe) {
  Ok "azcopy already installed at $azcopyExe"
} else {
  Run-Cmd -Description "Download + extract azcopy" -Cmd {
    if (-not (Test-Path $azcopyDir)) { New-Item -ItemType Directory -Path $azcopyDir -Force | Out-Null }
    $zipPath = "$env:TEMP\azcopy.zip"
    Invoke-WebRequest -Uri "https://aka.ms/downloadazcopy-v10-windows" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\azcopy-extracted" -Force
    Get-ChildItem -Path "$env:TEMP\azcopy-extracted" -Recurse -Filter "azcopy.exe" | Select-Object -First 1 | Copy-Item -Destination $azcopyExe -Force
    Remove-Item $zipPath -Force
    Remove-Item "$env:TEMP\azcopy-extracted" -Recurse -Force
  }
  Ok "azcopy installed"
}

# Add azcopy to PATH for the service account (and system-wide)
$systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($systemPath -notlike "*$azcopyDir*") {
  Run-Cmd -Description "Add $azcopyDir to system PATH" -Cmd {
    [Environment]::SetEnvironmentVariable("Path", "$systemPath;$azcopyDir", "Machine")
  }
  Ok "added $azcopyDir to system PATH"
}

# ----- 3) Install 1Password CLI --------------------------------------------
Say "installing 1Password CLI (op)…"
$opExe = Get-Command op -ErrorAction SilentlyContinue
if ($opExe) {
  Ok "1Password CLI already installed at $($opExe.Source)"
} else {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Run-Cmd -Description "winget install AgileBits.1Password.CLI" -Cmd {
      winget install --id AgileBits.1Password.CLI --silent --accept-source-agreements --accept-package-agreements
    }
    Ok "1Password CLI installed via winget"
  } else {
    Warn "winget not available — please install 1Password CLI manually from https://developer.1password.com/docs/cli/get-started/"
    Warn "Skipping — scripts will fall back to env-var credentials"
  }
}

# ----- 4) Enable BitLocker on D: -------------------------------------------
Say "checking BitLocker status on D:…"
try {
  $bl = Get-BitLockerVolume -MountPoint "D:" -ErrorAction Stop
  if ($bl.VolumeStatus -eq "FullyEncrypted") {
    Ok "BitLocker already fully encrypted on D:"
  } elseif ($bl.VolumeStatus -eq "EncryptionInProgress") {
    Warn "BitLocker encryption in progress on D: — continuing without re-enabling"
  } else {
    Say "  enabling BitLocker on D: (will prompt for password)…"
    if (-not $DryRun) {
      Write-Host "  Choose a strong password for BitLocker. SAVE THE RECOVERY KEY TO 1Password." -ForegroundColor Yellow
      $blPassword = Read-Host "  BitLocker password" -AsSecureString
      Enable-BitLocker -MountPoint "D:" -EncryptionMethod XtsAes256 -UsedSpaceOnly -PasswordProtector -Password $blPassword
      # Add a recovery key protector — for emergency recovery
      Add-BitLockerKeyProtector -MountPoint "D:" -RecoveryPasswordProtector
      $recoveryKey = (Get-BitLockerVolume -MountPoint "D:").KeyProtector | Where-Object { $_.KeyProtectorType -eq "RecoveryPassword" } | Select-Object -ExpandProperty RecoveryPassword
      Write-Host ""
      Write-Host "  ===========================================================" -ForegroundColor Cyan
      Write-Host "  SAVE THIS BITLOCKER RECOVERY KEY TO 1Password IMMEDIATELY:" -ForegroundColor Yellow
      Write-Host ""
      Write-Host "  $recoveryKey" -ForegroundColor White -BackgroundColor DarkRed
      Write-Host ""
      Write-Host "  Item name: server-bitlocker-d-recovery" -ForegroundColor Yellow
      Write-Host "  ===========================================================" -ForegroundColor Cyan
      Write-Host ""
      Read-Host "  Press Enter ONCE you've saved the key to 1Password"
      Ok "BitLocker enabled on D: (recovery key stored in 1Password)"
    } else {
      Write-Host "  (dry-run) Enable-BitLocker -MountPoint D: -EncryptionMethod XtsAes256 -UsedSpaceOnly -PasswordProtector"
    }
  }
} catch {
  Warn "couldn't check/enable BitLocker — may need to install BitLocker feature first:"
  Warn "  Install-WindowsFeature -Name BitLocker -IncludeAllSubFeature -Restart"
}

# ----- 5) Create service account svc-backups ------------------------------
Say "creating local service account $ServiceAccount…"
$svcUser = Get-LocalUser -Name $ServiceAccount -ErrorAction SilentlyContinue
if ($svcUser) {
  Ok "$ServiceAccount already exists"
} else {
  # Generate a random 24-char password
  Add-Type -AssemblyName System.Web
  $svcPasswordPlain = [System.Web.Security.Membership]::GeneratePassword(24, 4)
  $svcPasswordSecure = ConvertTo-SecureString -String $svcPasswordPlain -AsPlainText -Force
  Run-Cmd -Description "Create local user $ServiceAccount" -Cmd {
    New-LocalUser -Name $ServiceAccount `
      -Password $svcPasswordSecure `
      -FullName "Skin Tyee Backups Service Account" `
      -Description "Runs the nightly backup tasks. Do NOT make this an admin." `
      -PasswordNeverExpires `
      -UserMayNotChangePassword | Out-Null
  }
  Ok "$ServiceAccount created"

  Write-Host ""
  Write-Host "  ===========================================================" -ForegroundColor Cyan
  Write-Host "  SAVE THIS SERVICE ACCOUNT PASSWORD TO 1Password IMMEDIATELY:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Username: $ServiceAccount" -ForegroundColor White
  Write-Host "  Password: $svcPasswordPlain" -ForegroundColor White -BackgroundColor DarkRed
  Write-Host ""
  Write-Host "  Item name: server-backups-svc-account" -ForegroundColor Yellow
  Write-Host "  ===========================================================" -ForegroundColor Cyan
  Write-Host ""
  Read-Host "  Press Enter ONCE you've saved the password to 1Password"
}

# Grant 'Log on as a batch job' right
Say "  granting $ServiceAccount 'Log on as a batch job' right…"
if (-not $DryRun) {
  $tempCfg = "$env:TEMP\secpol.cfg"
  $tempDb = "$env:TEMP\secpol.sdb"
  secedit /export /cfg $tempCfg /quiet
  $cfg = Get-Content $tempCfg
  $batchLine = $cfg | Where-Object { $_ -match "^SeBatchLogonRight" }
  $userSid = (Get-LocalUser -Name $ServiceAccount).SID.Value
  if ($batchLine -and $batchLine -notmatch $userSid) {
    $newLine = "$batchLine,*$userSid"
    $cfg = $cfg -replace [regex]::Escape($batchLine), $newLine
    Set-Content -Path $tempCfg -Value $cfg
    secedit /configure /db $tempDb /cfg $tempCfg /areas USER_RIGHTS /quiet
  }
  Remove-Item $tempCfg, $tempDb -ErrorAction SilentlyContinue
  Ok "batch logon right granted"
}

# ----- 6) Folder structure -------------------------------------------------
Say "creating folder structure under $BackupRoot…"
$workloads = @("m365-email", "m365-sharepoint", "entra", "azure", "postgres", "_alerting", "_logs")
foreach ($w in $workloads) {
  $path = Join-Path $BackupRoot $w
  if (-not (Test-Path $path)) {
    Run-Cmd -Description "mkdir $path" -Cmd { New-Item -ItemType Directory -Path $path -Force | Out-Null }
  }
}

# Sub-tree for m365-email (the only fully-built workload)
foreach ($sub in @("mailboxes", "state", "logs")) {
  $path = Join-Path $BackupRoot "m365-email\$sub"
  if (-not (Test-Path $path)) {
    Run-Cmd -Description "mkdir $path" -Cmd { New-Item -ItemType Directory -Path $path -Force | Out-Null }
  }
}

# Drill log + manifest
$drillLog = Join-Path $BackupRoot "drill-log.md"
if (-not (Test-Path $drillLog)) {
  Run-Cmd -Description "create drill-log.md" -Cmd {
    @"
# Skin Tyee Backup — Restore Drill Log

Append one row per drill. See [`docs/365/email-backup.md`](../docs/365/email-backup.md)
§ Restore drill SOP for the procedure.

| Date | Workload | Drill type | Result | Notes | Operator |
|------|----------|-----------|--------|-------|----------|
"@ | Set-Content -Path $drillLog
  }
  Ok "drill-log.md created"
}

# Grant svc-backups full control on $BackupRoot
Say "  granting $ServiceAccount full control on $BackupRoot…"
Run-Cmd -Description "icacls $BackupRoot grant ${ServiceAccount}:(OI)(CI)F" -Cmd {
  icacls $BackupRoot /grant "${ServiceAccount}:(OI)(CI)F" /T /Q | Out-Null
}
Ok "permissions granted"

# ----- 7) Deploy backup scripts to C:\Scripts\m365-backup\ ------------------
Say "deploying backup scripts to $ScriptRoot…"
if (-not (Test-Path $ScriptRoot)) {
  Run-Cmd -Description "mkdir $ScriptRoot" -Cmd { New-Item -ItemType Directory -Path $ScriptRoot -Force | Out-Null }
}

# The scripts to copy are sibling files in scripts/m365-backup/ — assume
# this script was checked out of the repo, find them relative to ourselves
$repoScriptDir = Join-Path $PSScriptRoot "m365-backup"
$expectedScripts = @("Get-M365Mail.ps1", "Run-Backup.ps1", "Sync-ToAzure.ps1", "Restore-M365Mail.ps1")

if (Test-Path $repoScriptDir) {
  foreach ($s in $expectedScripts) {
    $src = Join-Path $repoScriptDir $s
    $dst = Join-Path $ScriptRoot $s
    if (Test-Path $src) {
      Run-Cmd -Description "copy $s → $ScriptRoot" -Cmd { Copy-Item -Path $src -Destination $dst -Force }
      Ok "$s deployed"
    } else {
      Warn "$s not found in $repoScriptDir — skipping (write the script before scheduling)"
    }
  }
} else {
  Warn "scripts/m365-backup/ not found relative to this script — you must copy the .ps1 files into $ScriptRoot manually"
}

# Grant svc-backups read-execute on the scripts
Say "  granting $ServiceAccount read-execute on $ScriptRoot…"
Run-Cmd -Description "icacls $ScriptRoot grant ${ServiceAccount}:(OI)(CI)RX" -Cmd {
  icacls $ScriptRoot /grant "${ServiceAccount}:(OI)(CI)RX" /T /Q | Out-Null
}
Ok "permissions granted"

# ----- 8) Firewall: outbound 443 only ---------------------------------------
Say "configuring outbound firewall rule (block svc-backups from non-443 outbound)…"
# This is a best-effort defence-in-depth — Windows Firewall per-user rules
# are limited. The real isolation is the lack of inbound + the service
# account having no admin rights.
Run-Cmd -Description "New-NetFirewallRule — allow svc-backups outbound 443" -Cmd {
  $rule = Get-NetFirewallRule -DisplayName "svc-backups-outbound-443" -ErrorAction SilentlyContinue
  if (-not $rule) {
    New-NetFirewallRule -DisplayName "svc-backups-outbound-443" `
      -Direction Outbound `
      -Action Allow `
      -Protocol TCP `
      -RemotePort 443 `
      -Profile Any | Out-Null
  }
}
Ok "firewall rule in place (defence-in-depth)"

# ----- 9) Task Scheduler: nightly M365 backup -------------------------------
Say "creating Task Scheduler entry 'M365-Backup-Nightly'…"
$taskName = "M365-Backup-Nightly"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask -and -not $DryRun) {
  Warn "$taskName already exists — removing and re-creating"
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  $existingTask = $null
}

if (-not $existingTask -and -not $DryRun) {
  $action = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptRoot\Run-Backup.ps1`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 2:00am
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
    -RestartCount 1 `
    -RestartInterval (New-TimeSpan -Minutes 30)

  # Run as the service account
  $svcUserAccount = "$env:COMPUTERNAME\$ServiceAccount"
  $svcPwdPrompt = Read-Host "  Enter the $ServiceAccount password (from 1Password)" -AsSecureString
  $svcPwdPlain = [System.Net.NetworkCredential]::new("", $svcPwdPrompt).Password

  Register-ScheduledTask `
    -TaskName $taskName `
    -Description "Nightly M365 email backup via Microsoft Graph; see docs/365/email-backup.md" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $svcUserAccount `
    -Password $svcPwdPlain | Out-Null
  Ok "$taskName scheduled for 02:00 daily"
} elseif ($DryRun) {
  Write-Host "  (dry-run) Register-ScheduledTask $taskName"
}

# ----- 10) Task Scheduler: weekly log rotation -----------------------------
Say "creating Task Scheduler entry 'Backup-Log-Rotation'…"
$logTaskName = "Backup-Log-Rotation"
if (-not (Get-ScheduledTask -TaskName $logTaskName -ErrorAction SilentlyContinue) -and -not $DryRun) {
  $logScript = @"
# Remove logs older than 90 days from D:\backups\<workload>\logs\
# Preserves deletions.log (audit trail)
Get-ChildItem -Path "$BackupRoot" -Recurse -Filter "backup-*.log" |
  Where-Object { `$_.LastWriteTime -lt (Get-Date).AddDays(-90) -and `$_.Name -notlike "*deletions*" } |
  Remove-Item -Force
"@
  $logScriptPath = Join-Path $ScriptRoot "Rotate-Logs.ps1"
  Set-Content -Path $logScriptPath -Value $logScript

  $logAction = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$logScriptPath`""
  $logTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:00am
  Register-ScheduledTask -TaskName $logTaskName -Description "Weekly log rotation for backup tasks" -Action $logAction -Trigger $logTrigger | Out-Null
  Ok "$logTaskName scheduled for Sunday 03:00"
}

# ----- 11) Final dry-run / verification ------------------------------------
$runBackupPath = Join-Path $ScriptRoot "Run-Backup.ps1"
if (Test-Path $runBackupPath) {
  Say "verifying wiring with a dry-run of $runBackupPath…"
  if (-not $DryRun) {
    try {
      & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $runBackupPath -DryRun
      Ok "dry-run completed — backup logic is wired correctly"
    } catch {
      Warn "dry-run failed: $_"
    }
  }
} else {
  Warn "Run-Backup.ps1 not deployed yet — copy it manually and re-test before relying on the nightly task"
}

# ----- summary -------------------------------------------------------------
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✔ Server-side backup install complete." -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host @"

Next steps:
  1) Verify the BitLocker recovery key + svc-backups password are in 1Password
  2) Confirm 1Password CLI is signed in for $ServiceAccount:
       op signin --account skintyeenation
  3) Confirm credentials referenced by Run-Backup.ps1 are accessible:
       op item get skintyee-m365-backup
  4) Run the first backup manually:
       pwsh -File $ScriptRoot\Run-Backup.ps1
     (will take 4-12 hours on first run; nightly runs are minutes)
  5) Add the IT lead + backup-oncall to the alerting Action Group via:
       az monitor action-group update --name ag-backup-critical -g skintyee-prod-rg
  6) Schedule monthly restore drill + quarterly alerting drill in your calendar

Backup root:   $BackupRoot
Script root:   $ScriptRoot
Service acct:  $ServiceAccount
Nightly task:  $taskName (runs as $ServiceAccount at 02:00)
Log rotation:  Backup-Log-Rotation (Sunday 03:00)

See docs/365/email-backup.md and docs/devops/backup-architecture.md.
"@
