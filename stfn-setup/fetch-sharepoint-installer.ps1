<#
.SYNOPSIS
  Download the Skin Tyee desktop installer from SharePoint Online into the
  NETLOGON deploy folder, via a Microsoft Graph device-code sign-in. No modules
  required (raw OAuth + Graph REST), so it runs on a clean box.

.DESCRIPTION
  SharePoint needs an M365 sign-in that a headless session can't do. Run this
  interactively (e.g. with the `!` prefix in Claude Code): it prints a code + URL,
  you sign in + consent (Sites.Read.All / Files.Read.All) in a browser, then it
  downloads the newest SkinTyee*.exe from the build-desktop folder straight into
  NETLOGON, where deploy-office-gpo.ps1 / Install-Apps.ps1 already expect it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\fetch-sharepoint-installer.ps1
#>
[CmdletBinding()]
param(
    [string]$SiteHost   = 'skintyeenation.sharepoint.com',
    [string]$SitePath   = '/sites/it-project-docs',
    [string]$FolderPath = 'webfront/desktop/build-desktop',   # relative to the document library root
    [string]$Pattern    = 'SkinTyee*.exe',
    [string]$OutDir     = '\\STFN.local\NETLOGON\OfficeDeploy',
    [string]$Tenant     = 'organizations',
    [string]$ClientId   = '14d82eec-204b-4c2f-b7e8-296a70dab67e'   # Microsoft Graph Command Line Tools (public client)
)
$ErrorActionPreference = 'Stop'
# Force a hard process exit on completion/error - otherwise lingering auth/HTTP
# threads can keep powershell.exe alive after the download, so `! ...` never returns.
trap { Write-Host "ERROR: $_" -ForegroundColor Red; [Environment]::Exit(1) }
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# 1. device-code sign-in
$scope = 'https://graph.microsoft.com/Sites.Read.All https://graph.microsoft.com/Files.Read.All offline_access'
$dc = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/devicecode" `
        -Body @{ client_id = $ClientId; scope = $scope }
Write-Host ""; Write-Host $dc.message -ForegroundColor Yellow; Write-Host ""

# 2. poll for the token until the user completes sign-in
$token = $null; $deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
do {
    Start-Sleep -Seconds ([int]$dc.interval)
    try {
        $tok = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/token" `
            -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $ClientId; device_code = $dc.device_code }
        $token = $tok.access_token
    } catch {
        $e = $null; try { $e = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch {}
        if ($e -ne 'authorization_pending' -and $e -ne 'slow_down') { throw }
    }
} until ($token -or (Get-Date) -gt $deadline)
if (-not $token) { throw 'Sign-in timed out.' }
$H = @{ Authorization = "Bearer $token" }

# 3. resolve site -> default document library -> the build-desktop folder
$site     = Invoke-RestMethod -Headers $H -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
Write-Host "Site:  $($site.displayName)"
$drive    = Invoke-RestMethod -Headers $H -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/drive"
$children = Invoke-RestMethod -Headers $H -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root:/${FolderPath}:/children"

# 4. pick the newest matching installer and download it into NETLOGON
$files = @($children.value | Where-Object { $_.name -like $Pattern -and $_.file })
if (-not $files.Count) { throw "No '$Pattern' in '$FolderPath'. Items there: " + (($children.value.name) -join ', ') }
$file = $files | Sort-Object name -Descending | Select-Object -First 1
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
$dest = Join-Path $OutDir $file.name
Write-Host ("Downloading {0} ({1:N1} MB) -> {2}" -f $file.name, ($file.size/1MB), $dest) -ForegroundColor Cyan
$prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $file.'@microsoft.graph.downloadUrl' -OutFile $dest -UseBasicParsing
$ProgressPreference = $prev
Write-Host "Done: $dest ($([math]::Round((Get-Item $dest).Length/1MB,1)) MB)" -ForegroundColor Green
[Environment]::Exit(0)   # hard exit so the process returns immediately (no lingering threads)
