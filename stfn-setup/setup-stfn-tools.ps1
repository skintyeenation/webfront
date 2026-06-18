# setup-stfn-tools.ps1
# Idempotent setup script for stfnadmin's tooling.
# Re-running is safe: each step checks current state before acting.
#
# Order:
#   1. PATH / env  (~/.local/bin)
#   2. Alias       (cc function in $PROFILE)
#   3. Claude Code CLI
#   4. Module-install prereqs (TLS, NuGet, PSGallery)
#   5. Entra-relevant Graph submodules
#   6. Microsoft.Entra module
#   7. Entra Connect MSI
#   8. Azure CLI (az)

$ErrorActionPreference = 'Stop'

# ---------- 1. ~/.local/bin directory + PATH ----------
Write-Host "=== ~/.local/bin directory ===" -ForegroundColor Cyan
$localBin = Join-Path $env:USERPROFILE '.local\bin'
if (-not (Test-Path $localBin)) {
    New-Item -ItemType Directory -Path $localBin -Force | Out-Null
    Write-Host "  created $localBin"
} else {
    Write-Host "  already exists: $localBin"
}

Write-Host "=== ~/.local/bin on user PATH ===" -ForegroundColor Cyan
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathEntries = if ($userPath) { $userPath -split ';' | Where-Object { $_ } } else { @() }
$alreadyOnPath = $pathEntries | Where-Object { $_.TrimEnd('\') -ieq $localBin.TrimEnd('\') }
if (-not $alreadyOnPath) {
    $newPath = if ($userPath) { "$userPath;$localBin" } else { $localBin }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    $env:Path = "$env:Path;$localBin"
    Write-Host "  added to user PATH (persistent)"
} else {
    Write-Host "  already on user PATH"
}

# ---------- 2. PowerShell profile + cc alias ----------
Write-Host "=== PowerShell profile ===" -ForegroundColor Cyan
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    Write-Host "  created $PROFILE"
} else {
    Write-Host "  already exists: $PROFILE"
}

Write-Host "=== cc function in profile ===" -ForegroundColor Cyan
$ccLine = 'function cc { & claude --dangerously-skip-permissions @args }'
# Coalesce to '' — in Windows PowerShell 5.1, `$null -notmatch '...'` returns $null
# (falsy), not $true, so an empty/just-created profile would silently skip the append.
$profileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if (-not $profileContent) { $profileContent = '' }
if ($profileContent -notmatch 'function\s+cc\b') {
    Add-Content -Path $PROFILE -Value $ccLine
    Write-Host "  added cc function"
} else {
    Write-Host "  cc function already defined"
}

# ---------- 3. Claude Code CLI ----------
Write-Host "=== Claude Code CLI ===" -ForegroundColor Cyan
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) {
    Write-Host "  already installed: $($claude.Source)"
} else {
    Write-Host "  not found - running official Anthropic Windows installer"
    Write-Host "  (places claude.exe in $localBin, which we just added to PATH)"
    try {
        [Net.ServicePointManager]::SecurityProtocol = `
            [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-RestMethod -Uri 'https://claude.ai/install.ps1' -UseBasicParsing | Invoke-Expression
        Write-Host "  installed - reopen PowerShell so PATH refresh takes effect"
    } catch {
        Write-Host "  installer failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  install manually from https://docs.claude.com/en/docs/claude-code/setup" -ForegroundColor Yellow
    }
}

# ---------- 4. Module-install prereqs ----------
Write-Host "=== TLS 1.2 ===" -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Write-Host "  enabled"

Write-Host "=== NuGet provider ===" -ForegroundColor Cyan
if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    Write-Host "  installed"
} else {
    Write-Host "  already present"
}

Write-Host "=== PSGallery trust ===" -ForegroundColor Cyan
if ((Get-PSRepository -Name PSGallery).InstallationPolicy -ne 'Trusted') {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    Write-Host "  set to Trusted"
} else {
    Write-Host "  already Trusted"
}

# ---------- 5. Microsoft.Graph submodules (Entra-relevant subset) ----------
# Full Microsoft.Graph meta-module pulls ~40 submodules and can hang silently for
# 5-10 minutes on PS 5.1. Per-submodule install + -Verbose gives live feedback.
Write-Host "=== Microsoft.Graph submodules (Entra subset) ===" -ForegroundColor Cyan
$graphModules = @(
    'Microsoft.Graph.Authentication',
    'Microsoft.Graph.Users',
    'Microsoft.Graph.Groups',
    'Microsoft.Graph.Identity.DirectoryManagement',
    'Microsoft.Graph.Identity.SignIns'
)
$prevProgress = $ProgressPreference
$ProgressPreference = 'Continue'   # ensure download progress bars render
foreach ($m in $graphModules) {
    if (-not (Get-Module -ListAvailable -Name $m)) {
        Write-Host ""
        Write-Host "  >>> installing $m (verbose output follows) <<<" -ForegroundColor Yellow
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        Install-Module $m -Scope CurrentUser -Force -AllowClobber -Verbose
        $sw.Stop()
        Write-Host ("  <<< installed $m in {0:N1}s >>>" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green
    } else {
        $v = (Get-Module -ListAvailable $m | Sort-Object Version -Descending | Select-Object -First 1).Version
        Write-Host "  $m already present (v$v)"
    }
}
$ProgressPreference = $prevProgress

# ---------- 6. Microsoft.Entra module ----------
Write-Host "=== Microsoft.Entra module ===" -ForegroundColor Cyan
if (-not (Get-Module -ListAvailable -Name Microsoft.Entra)) {
    Install-Module Microsoft.Entra -Scope CurrentUser -Force -AllowClobber
    Write-Host "  installed"
} else {
    $v = (Get-Module -ListAvailable Microsoft.Entra | Sort-Object Version -Descending | Select-Object -First 1).Version
    Write-Host "  already present (v$v)"
}

# ---------- 7. Entra Connect MSI ----------
Write-Host "=== Entra Connect MSI ===" -ForegroundColor Cyan
$msi = Join-Path $env:USERPROFILE 'Downloads\AzureADConnect.msi'
if (-not (Test-Path $msi)) {
    $url = 'https://download.microsoft.com/download/B/0/0/B00291D0-5A83-4DE7-86F5-980BC00DE05A/AzureADConnect.msi'
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host "  downloaded to $msi"
} else {
    $sizeMB = [math]::Round((Get-Item $msi).Length / 1MB, 1)
    Write-Host "  already present at $msi ($sizeMB MB)"
}

# ---------- 8. Azure CLI (az) ----------
Write-Host "=== Azure CLI ===" -ForegroundColor Cyan
$az = Get-Command az -ErrorAction SilentlyContinue
if ($az) {
    Write-Host "  already installed: $($az.Source)"
} else {
    $azMsi = Join-Path $env:TEMP 'AzureCLI.msi'
    Write-Host "  downloading installer..."
    Invoke-WebRequest -Uri 'https://aka.ms/installazurecliwindows' -OutFile $azMsi -UseBasicParsing
    Write-Host "  running msiexec /quiet (this can take a few minutes)"
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$azMsi`" /quiet /norestart" -Wait -PassThru
    Remove-Item $azMsi -ErrorAction SilentlyContinue
    if ($p.ExitCode -eq 0) {
        Write-Host "  installed - reopen PowerShell so PATH refresh takes effect"
    } else {
        Write-Host "  msiexec exited with code $($p.ExitCode)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Reload your profile in any open PowerShell window with: . `$PROFILE"
Write-Host "PATH changes take effect in NEW shells; current shell was updated in-place."
