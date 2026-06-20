<#
.SYNOPSIS
  Deploy a standard app set to domain PCs via a Group Policy computer Startup
  script: Microsoft 365 Apps (Word/Excel/PowerPoint/Outlook), new Microsoft Teams
  (Planner lives inside Teams + on the web), and Google Chrome - plus Public
  Desktop shortcuts for each. Machine-wide => ALL users of each PC get them.
  Idempotent + re-runnable.

.DESCRIPTION
  Microsoft 365 Apps is Click-to-Run, NOT an MSI, so it cannot be deployed with
  the usual GPO "Software Installation" (MSI-only). The supported domain pattern
  is a GPO computer STARTUP SCRIPT that runs the Office Deployment Tool (setup.exe
  /configure) as SYSTEM at boot, before user logon -> a machine-wide install.

  What this script does (all idempotent):
    1. Stages a deployment folder in NETLOGON (\\domain\NETLOGON\<DeployFolder>):
       the C2R setup.exe + a generated configuration.xml + the startup script.
       Office bits stream from the Microsoft CDN at install time (no multi-GB
       payload in SYSVOL). Use -PreDownload for an offline/cached source instead.
    2. Creates the GPO (if missing) and wires the PowerShell startup script into
       its SYSVOL (psscripts.ini + Scripts CSE + version bump).
    3. Only LINKS the GPO to an OU when you pass -TargetOU (otherwise the GPO is
       created but inert). Optionally moves named computers into that OU first.

  NOTE on Planner: Microsoft Planner is NOT an Office ODT app (it's web/Teams, or
  the separate Microsoft Store "Planner" app). This GPO cannot install it; see
  README for options. Word/Excel/PowerPoint ARE guaranteed by the config below.

.PARAMETER GpoName
  Name of the GPO to create/use. Default 'Deploy M365 Apps'.

.PARAMETER TargetOU
  DistinguishedName of the OU to link the GPO to. If omitted, the GPO is created
  but NOT linked (safe staging). Example:
  'OU=SkinTyee Computers,DC=STFN,DC=local'

.PARAMETER TargetComputers
  One or more computer names to deploy to (e.g. -TargetComputers XYNTAX-FMS2  or
  -TargetComputers LT01,LT02,LT03). The GPO is linked at the domain root (so it
  has scope over every computer, including those in the default CN=Computers
  container) and SECURITY-FILTERED to ONLY these machines: 'Authenticated Users'
  is downgraded to read-only (keeps MS16-072 happy) and Apply is granted to just
  the named computers. No computers are moved. If omitted, the GPO is created but
  left unlinked (safe staging).

.PARAMETER InvokeNow
  Force the install on each -TargetComputers machine IMMEDIATELY, without waiting
  for a reboot. Startup scripts only run at boot, so this instead triggers the
  same Install-Apps.ps1 on the target as SYSTEM (via a transient scheduled task
  over WinRM - SYSTEM/the computer account can read NETLOGON, avoiding the
  Kerberos double-hop). Offline/unreachable targets are skipped (they install at
  next boot anyway). Requires WinRM/PSRemoting to the targets.

.PARAMETER TargetOU
  Alternative to -TargetComputers: link the GPO to an entire OU (all computers in
  it apply). Use this for OU-based targeting instead of per-machine filtering.

.PARAMETER MoveComputers
  Computer names to MOVE into -TargetOU before linking (so PCs sitting in the
  default CN=Computers container become targetable that way). Requires -TargetOU.

.PARAMETER Product
  Office Deployment Tool product ID. Default O365BusinessRetail (Business
  Standard). Use O365ProPlusRetail for E3/E5.

.PARAMETER Channel
  Update channel. Default Current.

.PARAMETER DeployFolder
  NETLOGON subfolder name for the deployment payload. Default 'OfficeDeploy'.

.PARAMETER PreDownload
  Pre-download the Office bits into the deploy folder (offline source) instead of
  streaming from the Microsoft CDN. Larger NETLOGON payload; faster client installs.

.EXAMPLE
  # Deploy to a single machine:
  .\deploy-office-gpo.ps1 -TargetComputers XYNTAX-FMS2

.EXAMPLE
  # Deploy AND force the install right now (no reboot needed):
  .\deploy-office-gpo.ps1 -TargetComputers XYNTAX-FMS2 -InvokeNow

.EXAMPLE
  # Deploy to several machines (wherever they live in AD):
  .\deploy-office-gpo.ps1 -TargetComputers STFN2024-LT01,STFN2024-LT02,STFN2022-LT01

.EXAMPLE
  # Stage everything + create the (unlinked) GPO - safe, no machines affected yet:
  .\deploy-office-gpo.ps1

.EXAMPLE
  # OU-based targeting instead (every computer in the OU applies):
  .\deploy-office-gpo.ps1 -TargetOU 'OU=SkinTyee Computers,DC=STFN,DC=local'
#>
[CmdletBinding()]
param(
    [string[]]$TargetComputers = @(),
    [switch]$InvokeNow,
    [string]$GpoName = 'Deploy M365 Apps',
    [string]$TargetOU,
    [string[]]$MoveComputers = @(),
    [string]$Product = 'O365BusinessRetail',
    [ValidateSet('Current','MonthlyEnterprise','SemiAnnual','SemiAnnualPreview','CurrentPreview','BetaChannel')]
    [string]$Channel = 'Current',
    [string]$DeployFolder = 'OfficeDeploy',
    [switch]$PreDownload,
    # Skin Tyee app: drop the installer exe into the NETLOGON deploy folder; each
    # PC runs it machine-wide as SYSTEM. Args default to electron-builder NSIS
    # machine-wide silent ('/S /allusers'); for Inno Setup use '/VERYSILENT /ALLUSERS'.
    [string]$AppName = 'Skin Tyee',
    [string]$AppSetupFile = 'SkinTyeeApp-Setup.exe',
    [string]$AppInstallArgs = '/S /allusers'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Info($m) { Write-Host "  $m" }
function Write-Warn2($m){ Write-Host "  $m" -ForegroundColor Yellow }

# Force the install on a target NOW (no reboot): runs Install-Apps.ps1 as SYSTEM
# on the remote machine via a transient scheduled task (SYSTEM can read NETLOGON,
# dodging the Kerberos double-hop a plain Invoke-Command would hit on the share).
function Invoke-RemoteInstall($computerName, $src) {
    if (-not (Test-Connection -ComputerName $computerName -Count 1 -Quiet)) {
        Write-Warn2 "$computerName is offline - skipping (it will install at next boot)"; return
    }
    try { Test-WSMan -ComputerName $computerName -ErrorAction Stop | Out-Null }
    catch { Write-Warn2 "$computerName not reachable via WinRM - skipping (installs at next boot)"; return }
    Write-Info "$computerName - forcing install now (running as SYSTEM)..."
    try {
        $r = Invoke-Command -ComputerName $computerName -ArgumentList $src -ScriptBlock {
            param($src)
            $task = 'STFN-Force-AppInstall'
            $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$src\Install-Apps.ps1`""
            $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
            Register-ScheduledTask -TaskName $task -Action $a -Principal $p -Force | Out-Null
            Start-ScheduledTask -TaskName $task
            do { Start-Sleep -Seconds 10 } while ((Get-ScheduledTask -TaskName $task).State -eq 'Running')
            $res = (Get-ScheduledTaskInfo -TaskName $task).LastTaskResult
            Unregister-ScheduledTask -TaskName $task -Confirm:$false
            $res
        }
        Write-Info "$computerName - done (scheduled-task result=$r). Log: \\$computerName\C`$\Windows\Temp\office-deploy.log"
    } catch { Write-Warn2 "$computerName - force failed: $($_.Exception.Message)" }
}

# ---------- self-elevation ----------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warn2 'Not elevated - relaunching as administrator (approve the UAC prompt)...'
    $fwd = @()
    foreach ($kv in $PSBoundParameters.GetEnumerator()) {
        if ($kv.Value -is [switch]) { if ($kv.Value.IsPresent) { $fwd += "-$($kv.Key)" } }
        elseif ($kv.Value -is [array]) { $fwd += "-$($kv.Key)"; $fwd += ($kv.Value -join ',') }
        else { $fwd += "-$($kv.Key)"; $fwd += "`"$($kv.Value)`"" }
    }
    $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"") + $fwd
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    return
}

Import-Module ActiveDirectory
Import-Module GroupPolicy

$domain    = Get-ADDomain
$dns       = $domain.DNSRoot
$domainDN  = $domain.DistinguishedName
$netlogon  = "\\$dns\NETLOGON"
$deployDir = Join-Path $netlogon $DeployFolder
Write-Step 'Office GPO deployment'
Write-Info "Domain: $dns   GPO: $GpoName"
Write-Info "Deploy folder (NETLOGON): $deployDir"

# ---------- 1. stage deployment payload in NETLOGON ----------
Write-Step 'Stage payload (setup.exe + configuration.xml + startup script)'
New-Item -ItemType Directory -Force $deployDir | Out-Null

$setupExe = Join-Path $deployDir 'setup.exe'
if (-not (Test-Path $setupExe)) {
    Write-Info 'downloading C2R setup.exe (Office Deployment Tool engine)...'
    $prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://officecdn.microsoft.com/pr/wsus/setup.exe' -OutFile $setupExe -UseBasicParsing
    $ProgressPreference = $prev
} else { Write-Info 'setup.exe already staged' }

# new Teams is NOT installed by the ODT - it ships via the Teams bootstrapper.
# Stage teamsbootstrapper.exe so the startup script can provision Teams machine-wide.
$teamsBoot = Join-Path $deployDir 'teamsbootstrapper.exe'
if (-not (Test-Path $teamsBoot)) {
    Write-Info 'downloading Teams bootstrapper (teamsbootstrapper.exe)...'
    $prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/?linkid=2243204&clcid=0x409' -OutFile $teamsBoot -UseBasicParsing
    $ProgressPreference = $prev
} else { Write-Info 'teamsbootstrapper.exe already staged' }

# Google Chrome ships an enterprise MSI - stage it for a machine-wide install.
$chromeMsi = Join-Path $deployDir 'googlechromestandaloneenterprise64.msi'
if (-not (Test-Path $chromeMsi)) {
    Write-Info 'downloading Google Chrome enterprise MSI...'
    $prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi' -OutFile $chromeMsi -UseBasicParsing
    $ProgressPreference = $prev
} else { Write-Info 'Chrome enterprise MSI already staged' }

# Skin Tyee app icon (used for the app's desktop shortcut) - shipped from the repo.
$icoRepo = Join-Path $PSScriptRoot 'skintyee.ico'
if (Test-Path $icoRepo) {
    Copy-Item $icoRepo (Join-Path $deployDir 'skintyee.ico') -Force; Write-Info 'skintyee.ico staged'
} else {
    Write-Warn2 'skintyee.ico not found next to this script - app shortcut will fall back to the exe icon'
}

# configuration.xml: install the suite but GUARANTEE Word/Excel/PowerPoint/Outlook
# by NOT excluding them; trim apps most users here won't need. Teams is handled by
# the bootstrapper (above); Planner is not an installable desktop app - it lives
# inside Teams and at planner.cloud.microsoft.
$sourceAttr = if ($PreDownload) { " SourcePath=`"$deployDir`"" } else { '' }
$cfg = @"
<Configuration>
  <!-- Microsoft 365 Apps - $Product / $Channel. Word, Excel, PowerPoint guaranteed.
       Planner is NOT installable here (web/Teams or Microsoft Store app). -->
  <Add OfficeClientEdition="64" Channel="$Channel"$sourceAttr>
    <Product ID="$Product">
      <Language ID="en-us" />
      <ExcludeApp ID="Access" />
      <ExcludeApp ID="Publisher" />
      <ExcludeApp ID="Groove" />
      <ExcludeApp ID="Lync" />
      <ExcludeApp ID="Bing" />
    </Product>
  </Add>
  <Property Name="FORCEAPPSHUTDOWN" Value="TRUE" />
  <Property Name="SharedComputerLicensing" Value="0" />
  <Display Level="None" AcceptEULA="TRUE" />
  <RemoveMSI />
</Configuration>
"@
Set-Content -Path (Join-Path $deployDir 'configuration.xml') -Value $cfg -Encoding UTF8
Write-Info 'configuration.xml written'

if ($PreDownload) {
    Write-Step 'Pre-downloading Office bits (offline source)'
    Write-Info 'this streams the full package into the deploy folder (can be ~3.5 GB)...'
    $p = Start-Process $setupExe -ArgumentList "/download `"$(Join-Path $deployDir 'configuration.xml')`"" -Wait -PassThru -WorkingDirectory $deployDir
    Write-Info "setup.exe /download exit code: $($p.ExitCode)"
}

# startup script (runs as SYSTEM on each PC). __SRC__ is replaced with the UNC path.
# Installs Microsoft 365 Apps (Word/Excel/PowerPoint/Outlook), new Teams, and
# Google Chrome - each detected independently so partial installs converge.
$startup = @'
# Install-Apps.ps1 - GPO computer startup script (runs as SYSTEM at boot).
# Idempotent: installs each app only if missing; otherwise does nothing.
$ErrorActionPreference = 'Continue'
$log = 'C:\Windows\Temp\office-deploy.log'
function Log($m){ try { Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format s), $m) } catch {} }
$src = '__SRC__'

# --- Microsoft 365 Apps (Word/Excel/PowerPoint/Outlook) ---
$office = 'C:\Program Files\Microsoft Office\root\Office16'
$need   = 'WINWORD.EXE','EXCEL.EXE','POWERPNT.EXE','OUTLOOK.EXE'
$haveOffice = $true
foreach ($e in $need) { if (-not (Test-Path (Join-Path $office $e))) { $haveOffice = $false } }
if ($haveOffice) { Log 'Office (Word/Excel/PowerPoint/Outlook) already installed' }
else {
  $setup = Join-Path $src 'setup.exe'; $cfg = Join-Path $src 'configuration.xml'
  if (Test-Path $setup) {
    Log "Installing Microsoft 365 Apps from $src"
    $p = Start-Process $setup -ArgumentList "/configure `"$cfg`"" -Wait -PassThru -WindowStyle Hidden
    Log ("Office setup.exe exit code: " + $p.ExitCode)
  } else { Log "setup.exe not found at $setup" }
}

# --- new Microsoft Teams (machine-wide provision; Planner is available inside it) ---
$teamsProvisioned = $false
try { if (Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like 'MSTeams*' }) { $teamsProvisioned = $true } } catch {}
if ($teamsProvisioned) { Log 'Teams already provisioned' }
else {
  $boot = Join-Path $src 'teamsbootstrapper.exe'
  if (Test-Path $boot) {
    Log 'Provisioning new Teams via teamsbootstrapper.exe -p'
    $p = Start-Process $boot -ArgumentList '-p' -Wait -PassThru -WindowStyle Hidden
    Log ("teamsbootstrapper exit code: " + $p.ExitCode)
  } else { Log "teamsbootstrapper.exe not found at $boot" }
}

# --- Google Chrome (enterprise MSI) ---
$chromeExe = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (Test-Path $chromeExe) { Log 'Chrome already installed' }
else {
  $msi = Join-Path $src 'googlechromestandaloneenterprise64.msi'
  if (Test-Path $msi) {
    Log 'Installing Google Chrome (msiexec /qn)'
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
    Log ("Chrome msiexec exit code: " + $p.ExitCode)
  } else { Log "Chrome MSI not found at $msi" }
}

# --- Skin Tyee app (machine-wide installer staged in NETLOGON by an admin) ---
$appName  = '__APPNAME__'
$appSetup = Join-Path $src '__APPSETUP__'
function Get-AppInstall($displayLike) {
  $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
          'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like $displayLike } | Select-Object -First 1
}
$appReg = Get-AppInstall "*$appName*"
if ($appReg) { Log "$appName already installed" }
elseif (Test-Path $appSetup) {
  Log "Installing $appName from $appSetup"
  $p = Start-Process $appSetup -ArgumentList '__APPARGS__' -Wait -PassThru
  Log ("$appName installer exit code: " + $p.ExitCode)
  $appReg = Get-AppInstall "*$appName*"   # re-check so the shortcut can resolve its exe
} else { Log "$appName setup not found at $appSetup (drop the exe into NETLOGON to enable)" }

# --- Desktop shortcuts for ALL users (Public Desktop); only for apps present ---
$desktop = Join-Path $env:PUBLIC 'Desktop'
# stage the Skin Tyee icon locally (from NETLOGON) so shortcuts have a stable path
$brandIcon = ''
$icoSrc = Join-Path $src 'skintyee.ico'
if (Test-Path $icoSrc) {
  $brandDir = 'C:\ProgramData\STFN'
  if (-not (Test-Path $brandDir)) { New-Item -ItemType Directory -Force $brandDir | Out-Null }
  $brandIcon = Join-Path $brandDir 'skintyee.ico'
  Copy-Item $icoSrc $brandIcon -Force
}
function New-AppShortcut($name, $target, $arguments, $iconPath) {
  try {
    if ($target -and -not (Test-Path $target)) { return }   # skip if the app isn't installed
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut((Join-Path $desktop ($name + '.lnk')))
    $sc.TargetPath = $target
    if ($arguments) { $sc.Arguments = $arguments }
    if (Test-Path $target) { $sc.WorkingDirectory = (Split-Path $target) }
    if ($iconPath -and (Test-Path $iconPath)) { $sc.IconLocation = "$iconPath,0" }
    $sc.Save()
    Log "shortcut: $name"
  } catch { Log "shortcut failed ($name): $($_.Exception.Message)" }
}
New-AppShortcut 'Word'          (Join-Path $office 'WINWORD.EXE')
New-AppShortcut 'Excel'         (Join-Path $office 'EXCEL.EXE')
New-AppShortcut 'PowerPoint'    (Join-Path $office 'POWERPNT.EXE')
New-AppShortcut 'Outlook'       (Join-Path $office 'OUTLOOK.EXE')
New-AppShortcut 'Google Chrome' $chromeExe
# new Teams is an MSIX app - shortcut launches it via the AppsFolder AUMID
if (Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like 'MSTeams*' }) {
  New-AppShortcut 'Microsoft Teams' (Join-Path $env:WINDIR 'explorer.exe') 'shell:AppsFolder\MSTeams_8wekyb3d8bbwe!MSTeams'
}
# Skin Tyee app shortcut - resolve its exe from the uninstall registry entry
if ($appReg) {
  $appExe = $null
  if ($appReg.DisplayIcon) { $appExe = ($appReg.DisplayIcon -split ',')[0].Trim('"') }
  if ((-not $appExe -or -not (Test-Path $appExe)) -and $appReg.InstallLocation) {
    $appExe = Join-Path $appReg.InstallLocation ($appName + '.exe')
    if (-not (Test-Path $appExe)) { $appExe = (Get-ChildItem $appReg.InstallLocation -Filter *.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
  }
  if ($appExe -and (Test-Path $appExe)) { New-AppShortcut $appName $appExe $null $brandIcon }
}
Log 'startup script complete'
'@
$startup = $startup -replace '__SRC__', $deployDir
$startup = $startup -replace '__APPNAME__', $AppName
$startup = $startup -replace '__APPSETUP__', $AppSetupFile
$startup = $startup -replace '__APPARGS__', $AppInstallArgs
Set-Content -Path (Join-Path $deployDir 'Install-Apps.ps1') -Value $startup -Encoding UTF8
Write-Info 'Install-Apps.ps1 written'

# ---------- 2. create GPO + wire the startup script ----------
Write-Step "GPO: $GpoName"
$gpo = Get-GPO -Name $GpoName -ErrorAction SilentlyContinue
if (-not $gpo) { $gpo = New-GPO -Name $GpoName -Comment 'Installs Microsoft 365 Apps (Word/Excel/PowerPoint) machine-wide via startup script.'; Write-Info 'GPO created' }
else { Write-Info 'GPO already exists' }

$guid    = '{' + $gpo.Id.ToString() + '}'
$polPath = "\\$dns\SYSVOL\$dns\Policies\$guid"
$scripts = Join-Path $polPath 'Machine\Scripts'
$startDir= Join-Path $scripts 'Startup'
New-Item -ItemType Directory -Force $startDir | Out-Null
Copy-Item (Join-Path $deployDir 'Install-Apps.ps1') (Join-Path $startDir 'Install-Apps.ps1') -Force

# psscripts.ini (PowerShell startup scripts) - Unicode, as GPMC writes it
$ini = "[Startup]`r`n0CmdLine=Install-Apps.ps1`r`n0Parameters=`r`n"
Set-Content -Path (Join-Path $scripts 'psscripts.ini') -Value $ini -Encoding Unicode
Write-Info 'psscripts.ini written + script copied into GPO'

# register the Scripts client-side extension on the GPO AD object
$gpoDN = "CN=$guid,CN=Policies,CN=System,$domainDN"
$cse   = '[{42B5FAAE-6536-11D2-AE5A-0000F87571E3}{40B6664F-4972-11D1-A7CA-0000F87571E3}]'
$cur   = (Get-ADObject -Identity $gpoDN -Properties gPCMachineExtensionNames).gPCMachineExtensionNames
if (-not $cur -or $cur -notmatch '42B5FAAE-6536-11D2-AE5A-0000F87571E3') {
    Set-ADObject -Identity $gpoDN -Replace @{ gPCMachineExtensionNames = $cse }
    Write-Info 'registered Scripts CSE'
} else { Write-Info 'Scripts CSE already registered' }

# bump version so clients re-apply (computer version = low word => +1)
$gptIni = Join-Path $polPath 'GPT.ini'
$verLine = (Get-Content $gptIni | Where-Object { $_ -match '^Version=' })
$curVer  = [int]($verLine -replace 'Version=','')
$newVer  = $curVer + 1
(Get-Content $gptIni) -replace '^Version=.*', "Version=$newVer" | Set-Content $gptIni -Encoding ASCII
Set-ADObject -Identity $gpoDN -Replace @{ versionNumber = $newVer }
Write-Info "version bumped $curVer -> $newVer"

# ---------- 3. target + link the GPO ----------
if ($TargetComputers.Count) {
    # Per-machine targeting: link at the domain root (so the GPO has scope over
    # EVERY computer, including those in the default CN=Computers container) and
    # security-filter so it APPLIES to only the named machines. Nothing is moved.
    Write-Step 'Per-machine targeting (domain-root link + security filter)'
    $comps = @()
    foreach ($name in $TargetComputers) {
        $c = Get-ADComputer -Filter "Name -eq '$name'" -ErrorAction SilentlyContinue
        if (-not $c) { Write-Warn2 "computer '$name' not found in AD - skipping"; continue }
        $comps += $c
    }
    if (-not $comps.Count) { throw 'None of the -TargetComputers were found in AD.' }

    $rootLink = (Get-GPInheritance -Target $domainDN).GpoLinks | Where-Object { $_.DisplayName -eq $GpoName }
    if ($rootLink) { Write-Info 'GPO already linked at domain root' }
    else { New-GPLink -Name $GpoName -Target $domainDN -LinkEnabled Yes | Out-Null; Write-Info "linked '$GpoName' -> domain root" }

    # security filtering: Authenticated Users read-only (still satisfies MS16-072
    # so computers can READ the GPO), Apply granted only to the named computers.
    Set-GPPermission -Name $GpoName -TargetName 'Authenticated Users' -TargetType Group -PermissionLevel GpoRead -Replace | Out-Null
    Write-Info 'Authenticated Users -> read-only'
    foreach ($c in $comps) {
        Set-GPPermission -Name $GpoName -TargetName $c.Name -TargetType Computer -PermissionLevel GpoApply | Out-Null
        Write-Info "apply granted to $($c.Name)"
    }
    Write-Warn2 ("LIVE: only [{0}] install at next reboot (startup scripts run pre-logon)." -f (($comps | ForEach-Object { $_.Name }) -join ', '))
    if ($InvokeNow) {
        Write-Step 'Force install now (no reboot)'
        foreach ($c in $comps) { Invoke-RemoteInstall $c.Name $deployDir }
    } else {
        Write-Info 'Force now without reboot:  re-run with -InvokeNow  (needs WinRM to the target).'
    }
}
elseif ($TargetOU) {
    if ($MoveComputers.Count) {
        Write-Step 'Move computers into target OU'
        foreach ($name in $MoveComputers) {
            $c = Get-ADComputer -Filter "Name -eq '$name'" -ErrorAction SilentlyContinue
            if (-not $c) { Write-Warn2 "computer '$name' not found - skipping"; continue }
            if ($c.DistinguishedName -like "*$TargetOU") { Write-Info "$name already in target OU" }
            else { Move-ADObject -Identity $c.DistinguishedName -TargetPath $TargetOU; Write-Info "moved $name -> $TargetOU" }
        }
    }
    Write-Step 'Link GPO to OU'
    $existing = (Get-GPInheritance -Target $TargetOU).GpoLinks | Where-Object { $_.DisplayName -eq $GpoName }
    if ($existing) { Write-Info 'GPO already linked to OU' }
    else { New-GPLink -Name $GpoName -Target $TargetOU -LinkEnabled Yes | Out-Null; Write-Info "linked '$GpoName' -> $TargetOU" }
    Write-Warn2 'LIVE: every PC in the OU installs at next reboot (startup scripts run pre-logon).'
    Write-Info  'Force on a test PC now:  gpupdate /target:computer /force   then REBOOT.'
}
else {
    Write-Step 'GPO not linked (staging only)'
    Write-Info 'Re-run with -TargetComputers <name,...> (per-machine) or -TargetOU <OU-DN> to go live.'
}

Write-Step 'Done'
Write-Info "Payload: $deployDir"
Write-Info "Install log on each PC: C:\Windows\Temp\office-deploy.log"
