<#
.SYNOPSIS
  Idempotent Docker setup for the Skin Tyee Windows Server box. Re-running is safe.

.DESCRIPTION
  Docker DESKTOP is NOT supported on Windows Server (2019/2022) — it refuses to
  start and reports "Virtualization support not detected" even on a box where
  virtualization is fine. So this server does NOT use Docker Desktop.

  Instead we run real Docker the supported way:

    * Linux containers (default, recommended): Docker CE (Community Edition,
      open-source, free) installed INSIDE a WSL2 Ubuntu distro. Runs the
      standard Linux images (~95% of Docker Hub). REQUIRES nested virtualization
      to be exposed to this guest VM. On STFN-DC that is currently NOT the case
      (WSL2 fails to boot with HCS_E_HYPERV_NOT_INSTALLED), so the script's boot
      test stops here and prints the host-side fix — see step 3b below.

    * Windows containers (-WindowsContainers, opt-in): the native Docker ENGINE
      on Windows Server via DockerMsftProvider. Runs Windows base images only.
      Only needed if you specifically require Windows containers.

  PERFORMANCE / RELIABILITY NOTE (Linux path): keep project files and volumes on
  the WSL2 ext4 filesystem (e.g. ~/webfront inside Ubuntu), NOT on /mnt/c. Bind-
  mounting Windows files over the 9P layer is 5-20x slower and breaks inotify
  file-watchers (broken HMR/hot-reload, missed rebuilds). Clone the repo inside
  Ubuntu for native-speed I/O; edit it from Windows via \\wsl$\Ubuntu\... or an
  IDE's WSL-remote mode (IntelliJ / VS Code).

  Machine-wide steps (Windows optional features, wsl --install) require elevation;
  the script self-elevates via UAC if not already running as administrator.

.PARAMETER Distro
  WSL distro to use/install for the Linux-container engine. Default: Ubuntu.

.PARAMETER DockerUser
  Non-root Linux user created inside the distro and added to the docker group.
  Default: stfn.

.PARAMETER WindowsContainers
  ALSO install the native Windows-container Docker Engine (DockerMsftProvider).
  Off by default — only enable if you need Windows base images.

.PARAMETER SkipLinux
  Skip the WSL2 + Docker CE (Linux container) setup.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-docker-wsl.ps1

.EXAMPLE
  # Also set up native Windows-container engine:
  .\setup-docker-wsl.ps1 -WindowsContainers
#>
[CmdletBinding()]
param(
    [string]$Distro = 'Ubuntu',
    [string]$DockerUser = 'stfn',
    [switch]$WindowsContainers,
    [switch]$SkipLinux
)

$ErrorActionPreference = 'Stop'
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

# Docker Desktop is unsupported on Server — flag it if someone installed it anyway.
if (Test-Path 'C:\Program Files\Docker\Docker\Docker Desktop.exe') {
    Write-Warn2 'Docker DESKTOP is installed but is NOT supported on Windows Server and'
    Write-Warn2 'will not start ("Virtualization support not detected"). This script sets up'
    Write-Warn2 'the supported engines instead. You can uninstall Docker Desktop.'
}

# =====================================================================
# Linux containers: WSL2 + Docker CE
# =====================================================================
if (-not $SkipLinux) {
    # ---------- 1. required Windows optional features ----------
    Write-Step 'Windows features: VirtualMachinePlatform + WSL'
    $rebootNeeded = $false
    foreach ($feat in 'VirtualMachinePlatform','Microsoft-Windows-Subsystem-Linux') {
        $state = (Get-WindowsOptionalFeature -Online -FeatureName $feat).State
        if ($state -ne 'Enabled') {
            Write-Info "enabling $feat ..."
            $r = Enable-WindowsOptionalFeature -Online -FeatureName $feat -All -NoRestart
            if ($r.RestartNeeded) { $rebootNeeded = $true }
        } else {
            Write-Info "$feat already enabled"
        }
    }
    if ($rebootNeeded) {
        Write-Warn2 'A reboot is required to finish enabling WSL features. Reboot, then re-run this script.'
        return
    }

    # ---------- 2. WSL engine: update + default to v2 ----------
    Write-Step 'WSL2 engine'
    try { wsl --update | Out-Null } catch { Write-Warn2 "wsl --update: $($_.Exception.Message)" }
    wsl --set-default-version 2 | Out-Null
    Write-Info 'default version set to 2'

    # ---------- 3. install the distro (no interactive first-launch) ----------
    Write-Step "WSL distro: $Distro"
    $installed = (wsl --list --quiet) -join "`n"
    if ($installed -notmatch [Regex]::Escape($Distro)) {
        Write-Info "installing $Distro (--no-launch, so no interactive user prompt) ..."
        wsl --install -d $Distro --no-launch
    } else {
        Write-Info "$Distro already registered"
    }

    # ---------- 3b. boot test: can WSL2 actually start a VM here? ----------
    # The features can show "Enabled" yet WSL2 still fails to start its lightweight
    # VM if this box is a Hyper-V guest WITHOUT nested virtualization exposed
    # (error HCS_E_HYPERV_NOT_INSTALLED). Catch that here instead of charging ahead
    # and printing a bogus success.
    Write-Step 'WSL2 boot test'
    wsl -d $Distro -u root -- true 2>$null
    $bootOk = ($LASTEXITCODE -eq 0)
    if (-not $bootOk) {
        Write-Warn2 'WSL2 cannot start a VM on this machine: nested virtualization is not exposed to this guest.'
        Write-Warn2 'Linux containers are BLOCKED until nested virt is enabled on the Hyper-V HOST:'
        Write-Warn2 '  # On the Hyper-V host, with this VM stopped:'
        Write-Warn2 '  Set-VMProcessor -VMName <vm> -ExposeVirtualizationExtensions $true'
        Write-Warn2 '  Get-VMNetworkAdapter -VMName <vm> | Set-VMNetworkAdapter -MacAddressSpoofing On'
        Write-Warn2 'Then restart the VM and re-run this script.'
        Write-Warn2 '(Azure VMs: use a nested-virt-capable size, e.g. Dv3/Ev3+.)'
        Write-Warn2 'No-nested-virt alternative: Windows containers via  -WindowsContainers  (Windows base images only).'
    }
    else {
    Write-Info 'WSL2 VM boots OK'
    # ---------- 4. provision Docker CE INSIDE the distro (as root) ----------
    # Done via a bash script written with LF endings to a temp file, then run as
    # root in the distro. Idempotent: re-running no-ops once things are present.
    Write-Step "Docker CE inside $Distro (user: $DockerUser)"
    $bash = @"
#!/usr/bin/env bash
set -euo pipefail
DOCKER_USER="`$1"

# enable systemd so dockerd runs as a managed service, and default to the non-root user
if ! grep -q 'systemd=true' /etc/wsl.conf 2>/dev/null; then
  printf '[boot]\nsystemd=true\n[user]\ndefault=%s\n' "`$DOCKER_USER" > /etc/wsl.conf
fi

# create the non-root user (passwordless sudo on this dev box) if missing
if ! id -u "`$DOCKER_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "`$DOCKER_USER"
  usermod -aG sudo "`$DOCKER_USER"
  echo "`$DOCKER_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/`$DOCKER_USER
  chmod 0440 /etc/sudoers.d/`$DOCKER_USER
fi

# install Docker CE (official convenience script; no-ops if already installed)
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

# let the user run docker without sudo
usermod -aG docker "`$DOCKER_USER"
echo "in-distro provisioning complete"
"@
    $sh = Join-Path $env:TEMP 'stfn-docker-provision.sh'
    [IO.File]::WriteAllText($sh, ($bash -replace "`r`n", "`n"))
    # translate the Windows temp path to its /mnt/c/... form for the distro
    $shWsl = (& wsl -d $Distro wslpath -a ($sh -replace '\\','/')).Trim()
    wsl -d $Distro -u root -- bash $shWsl $DockerUser

    # ---------- 5. restart distro so systemd (and the docker service) come up ----------
    Write-Step 'Starting Docker service'
    wsl --shutdown
    wsl -d $Distro -u root -- systemctl enable --now docker

    # ---------- 6. verify ----------
    Write-Step 'Verify Linux Docker'
    $ver = (& wsl -d $Distro -u $DockerUser -- docker version --format '{{.Server.Version}}' 2>$null)
    if ($ver) {
        Write-Info "Docker Engine $ver running in $Distro"
        Write-Info "Use it from PowerShell with:  wsl -d $Distro -- docker <args>"
        Write-Info "TIP: keep project files in the Linux fs (~/...), not /mnt/c, for speed + working file-watchers."
    } else {
        Write-Warn2 "Could not confirm Docker yet. Try: wsl -d $Distro -u $DockerUser -- docker run hello-world"
    }
    } # end boot-ok block
}

# =====================================================================
# Windows containers: native Docker Engine (opt-in)
# =====================================================================
if ($WindowsContainers) {
    Write-Step 'Native Docker Engine (Windows containers)'
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Info 'docker.exe already on PATH - skipping engine install'
    } else {
        Write-Info 'installing Containers feature + Docker Engine via DockerMsftProvider...'
        $f = (Get-WindowsOptionalFeature -Online -FeatureName Containers).State
        if ($f -ne 'Enabled') { Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart | Out-Null }
        Install-Module -Name DockerMsftProvider -Repository PSGallery -Force
        Install-Package -Name docker -ProviderName DockerMsftProvider -Force
        Write-Warn2 'A reboot is typically required before the Docker (Windows) service starts.'
        Write-Info 'After reboot: Start-Service docker ; docker run hello-world:nanoserver'
    }
}

Write-Step 'Docker setup done'
Write-Info 'Linux containers: run via WSL2 (wsl -d Ubuntu -- docker ...).'
Write-Info 'Docker Desktop is intentionally NOT used (unsupported on Windows Server).'
