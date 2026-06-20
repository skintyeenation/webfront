<#
.SYNOPSIS
  One-shot, idempotent provisioning of a freshly-built Skin Tyee Windows Server
  with all standard software. Re-running is safe: every step checks current
  state before acting.

.DESCRIPTION
  Intended to be run once on a newly-provisioned server (including a domain
  controller) so the box comes up with the full Skin Tyee software baseline:

    1. Workstation/dev tooling   - delegated to setup-stfn-tools.ps1 in this
                                   folder (~/.local/bin + cc alias, Claude Code,
                                   PSGallery prereqs, Microsoft.Graph / .Entra
                                   modules, Azure CLI, Entra Connect MSI download)
    2. 1Password                 - machine-wide MSI (all users)
    3. Microsoft 365 Apps        - Click-to-Run (Business Standard by default)
    4. Docker                    - delegated to setup-docker-wsl.ps1: Docker CE
                                   in WSL2 for Linux containers (Docker Desktop
                                   is unsupported on Windows Server)
    5. Entra Connect sync tool   - DC-aware: staged everywhere, installed only
                                   on a domain-member server (opt-in)

  Machine-wide installs require elevation; the script self-elevates via UAC if
  it is not already running as administrator.

.PARAMETER SkipDevTools
  Skip invoking setup-stfn-tools.ps1.

.PARAMETER Skip1Password
  Skip the 1Password install.

.PARAMETER SkipM365
  Skip the Microsoft 365 Apps install.

.PARAMETER SkipDocker
  Skip the Docker setup (setup-docker-wsl.ps1).

.PARAMETER DockerWindowsContainers
  Also install the native Windows-container Docker Engine (passed through to
  setup-docker-wsl.ps1 -WindowsContainers). Off by default.

.PARAMETER SkipEntraConnect
  Skip staging/installing the Entra Connect sync tool entirely.

.PARAMETER InstallEntraConnect
  Actually launch the Entra Connect installer (default is download/stage only).
  The sync-configuration wizard is interactive and needs Entra Global Admin +
  on-prem Enterprise Admin credentials.

.PARAMETER ForceEntraConnectOnDC
  Permit installing Entra Connect on a domain controller. Microsoft advises
  against this (run it on a member server); requires this explicit override.

.PARAMETER M365Product
  Office Deployment Tool product ID. Default O365BusinessRetail (Business
  Standard). Use O365ProPlusRetail for E3/E5 enterprise licensing.

.PARAMETER M365Channel
  Update channel. Default Current.

.PARAMETER RdsHost
  Set if this server is a multi-user RDS session host: adds
  SharedComputerLicensing=1 to the Microsoft 365 config (required for
  shared/per-session activation).

.PARAMETER CacheDir
  Where installers are downloaded/cached. Default C:\STFN-Provision.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\provision-stfn-server.ps1

.EXAMPLE
  # Member server, also install + launch the Entra Connect wizard, RDS host:
  .\provision-stfn-server.ps1 -InstallEntraConnect -RdsHost
#>
[CmdletBinding()]
param(
    [switch]$SkipDevTools,
    [switch]$Skip1Password,
    [switch]$SkipM365,
    [switch]$SkipDocker,
    [switch]$DockerWindowsContainers,
    [switch]$SkipEntraConnect,
    [switch]$InstallEntraConnect,
    [switch]$ForceEntraConnectOnDC,
    [string]$M365Product = 'O365BusinessRetail',
    [ValidateSet('Current','MonthlyEnterprise','SemiAnnual','SemiAnnualPreview','CurrentPreview','BetaChannel')]
    [string]$M365Channel = 'Current',
    [switch]$RdsHost,
    [string]$CacheDir = 'C:\STFN-Provision'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Info($m) { Write-Host "  $m" }
function Write-Warn2($m){ Write-Host "  $m" -ForegroundColor Yellow }

# ---------- self-elevation ----------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warn2 'Not elevated - relaunching as administrator (approve the UAC prompt)...'
    $fwd = @()
    foreach ($kv in $PSBoundParameters.GetEnumerator()) {
        if ($kv.Value -is [switch]) { if ($kv.Value.IsPresent) { $fwd += "-$($kv.Key)" } }
        else { $fwd += "-$($kv.Key)"; $fwd += "`"$($kv.Value)`"" }
    }
    $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"") + $fwd
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    return
}

New-Item -ItemType Directory -Force $CacheDir | Out-Null
try { Start-Transcript -Path (Join-Path $CacheDir 'provision-log.txt') -Append | Out-Null } catch {}

# ---------- shared helpers ----------
function Get-Installer($url, $path) {
    if (Test-Path $path) { Write-Info "cached: $path"; return $path }
    Write-Info "downloading $url"
    $prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $path -UseBasicParsing
    $ProgressPreference = $prev
    return $path
}
function Assert-Signed($path) {
    $sig = Get-AuthenticodeSignature $path
    if ($sig.Status -ne 'Valid') { throw "Signature invalid for $path : $($sig.Status)" }
    Write-Info "signature OK: $($sig.SignerCertificate.Subject.Split(',')[0])"
}

# ---------- environment facts ----------
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$isServer       = $os.ProductType -ne 1          # 1=workstation 2=DC 3=member server
$isDC           = $os.ProductType -eq 2
$isDomainJoined = $cs.PartOfDomain
Write-Step 'Skin Tyee server provisioning'
Write-Info "Host: $($cs.Name)   OS: $($os.Caption)"
Write-Info "Server: $isServer   DomainController: $isDC   DomainJoined: $isDomainJoined   Domain: $($cs.Domain)"
Write-Info "Cache: $CacheDir"

# ---------- 1. workstation / dev tooling ----------
if (-not $SkipDevTools) {
    Write-Step 'Workstation / dev tooling (setup-stfn-tools.ps1)'
    $tools = Join-Path $PSScriptRoot 'setup-stfn-tools.ps1'
    if (Test-Path $tools) {
        Write-Info "running $tools"
        & $tools
    } else {
        Write-Warn2 "setup-stfn-tools.ps1 not found alongside this script - skipping dev tooling."
    }
}

# ---------- 2. 1Password (machine-wide) ----------
if (-not $Skip1Password) {
    Write-Step '1Password (machine-wide, all users)'
    if (Test-Path 'C:\Program Files\1Password\app') {
        Write-Info '1Password already installed - skipping'
    } else {
        $dir = Join-Path $CacheDir '1Password'; New-Item -ItemType Directory -Force $dir | Out-Null
        $msi = Get-Installer 'https://downloads.1password.com/win/1PasswordSetup-latest.msi' `
                             (Join-Path $dir '1PasswordSetup-latest.msi')
        Assert-Signed $msi
        Write-Info 'installing (msiexec /qn)...'
        $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
        if ($p.ExitCode -eq 0) { Write-Info 'installed' } else { Write-Warn2 "msiexec exit code $($p.ExitCode)" }
    }
}

# ---------- 3. Microsoft 365 Apps (Click-to-Run) ----------
if (-not $SkipM365) {
    Write-Step "Microsoft 365 Apps (Click-to-Run: $M365Product / $M365Channel)"
    if (Test-Path 'C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE') {
        Write-Info 'Microsoft 365 Apps already installed - skipping'
    } else {
        $dir = Join-Path $CacheDir 'Microsoft365'; New-Item -ItemType Directory -Force $dir | Out-Null
        # Always-latest Click-to-Run engine (same setup.exe shipped in the Office Deployment Tool)
        $setup = Get-Installer 'https://officecdn.microsoft.com/pr/wsus/setup.exe' (Join-Path $dir 'setup.exe')
        Assert-Signed $setup
        $scl = if ($RdsHost) { "`n  <Property Name=`"SharedComputerLicensing`" Value=`"1`" />" } else { '' }
        $cfg = @"
<Configuration>
  <Add OfficeClientEdition="64" Channel="$M365Channel">
    <Product ID="$M365Product">
      <Language ID="en-us" />
      <ExcludeApp ID="Groove" />
      <ExcludeApp ID="Lync" />
    </Product>
  </Add>$scl
  <Property Name="FORCEAPPSHUTDOWN" Value="TRUE" />
  <Display Level="None" AcceptEULA="TRUE" />
  <RemoveMSI />
</Configuration>
"@
        $cfgPath = Join-Path $dir 'configuration.xml'
        Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8
        Write-Info "config written: $cfgPath"
        Write-Info 'installing - streams ~3.5 GB, can take 10-30 min...'
        $p = Start-Process $setup -ArgumentList "/configure `"$cfgPath`"" -WorkingDirectory $dir -Wait -PassThru
        if ($p.ExitCode -eq 0) { Write-Info 'install command completed' } else { Write-Warn2 "setup.exe exit code $($p.ExitCode)" }
    }
}

# ---------- 4. Docker (WSL2 + Docker CE; Desktop is unsupported on Server) ----------
if (-not $SkipDocker) {
    Write-Step 'Docker (setup-docker-wsl.ps1)'
    $docker = Join-Path $PSScriptRoot 'setup-docker-wsl.ps1'
    if (Test-Path $docker) {
        Write-Info "running $docker"
        # Already elevated here, so the child script's self-elevation is a no-op.
        if ($DockerWindowsContainers) { & $docker -WindowsContainers } else { & $docker }
    } else {
        Write-Warn2 "setup-docker-wsl.ps1 not found alongside this script - skipping Docker."
    }
}

# ---------- 5. Entra Connect (Azure AD Connect) sync tool ----------
if (-not $SkipEntraConnect) {
    Write-Step 'Entra Connect (Azure AD Connect) sync tool'
    $dir = Join-Path $CacheDir 'EntraConnect'; New-Item -ItemType Directory -Force $dir | Out-Null
    $msiPath = Join-Path $dir 'AzureADConnect.msi'
    # Reuse the copy setup-stfn-tools.ps1 already fetched to ~/Downloads (step 1) rather than re-downloading.
    $dl = Join-Path $env:USERPROFILE 'Downloads\AzureADConnect.msi'
    if ((-not (Test-Path $msiPath)) -and (Test-Path $dl)) {
        Write-Info "reusing Entra Connect MSI already downloaded by setup-stfn-tools.ps1 ($dl)"
        Copy-Item $dl $msiPath
    }
    $msi = Get-Installer 'https://download.microsoft.com/download/B/0/0/B00291D0-5A83-4DE7-86F5-980BC00DE05A/AzureADConnect.msi' $msiPath
    Assert-Signed $msi
    Write-Info "staged: $msi"

    if (-not $InstallEntraConnect) {
        Write-Info 'Download/stage only. Re-run with -InstallEntraConnect to launch the installer.'
        Write-Info 'Sync setup is interactive: needs Entra Global Admin + on-prem Enterprise Admin creds.'
    }
    elseif (-not $isServer) {
        Write-Warn2 'Not a Windows Server SKU - Entra Connect is unsupported here. Skipping install.'
    }
    elseif (-not $isDomainJoined) {
        Write-Warn2 'Not domain-joined - Entra Connect needs a domain-member server. Skipping install.'
    }
    elseif ($isDC -and -not $ForceEntraConnectOnDC) {
        Write-Warn2 'This is a Domain Controller. Microsoft recommends running Entra Connect on a'
        Write-Warn2 'member server, NOT a DC. Re-run with -ForceEntraConnectOnDC to override. Skipping.'
    }
    else {
        Write-Info 'launching installer (interactive wizard - have Global Admin + Enterprise Admin creds ready)...'
        Start-Process msiexec.exe -ArgumentList "/i `"$msi`"" -Wait
    }
}

Write-Step 'Done'
Write-Info 'Reopen PowerShell so PATH changes take effect in new shells.'
try { Stop-Transcript | Out-Null } catch {}
