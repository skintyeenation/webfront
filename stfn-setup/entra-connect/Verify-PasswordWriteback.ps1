<#
  Verify-PasswordWriteback.ps1
  Read-only check that SSPR password writeback is reported enabled in the cloud,
  via the directory onPremisesSynchronization feature flags. Uses Microsoft Graph
  (the WAM broker signs in silently on STFN-DC; needs the
  OnPremDirectorySynchronization.Read.All scope).

  Usage:
    .\Verify-PasswordWriteback.ps1

  Expect passwordWritebackEnabled=True once Step 1 (writeback enabled on the AAD
  Connect server) has reported to Azure. That report is a periodic config sync
  (~30 min) separate from object sync -- force it sooner with: Restart-Service ADSync
  (elevated). See docs/365/password-reset-sspr.md.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>

# This box's PSModulePath omits the user module dir; make Graph discoverable.
$userMods = Join-Path $HOME 'Documents\WindowsPowerShell\Modules'
if ((Test-Path $userMods) -and ($env:PSModulePath -notlike "*$userMods*")) {
  $env:PSModulePath = "$userMods;" + $env:PSModulePath
}
Import-Module Microsoft.Graph.Authentication -ErrorAction Stop

if (-not (Get-MgContext -ErrorAction SilentlyContinue)) {
  Connect-MgGraph -Scopes 'OnPremDirectorySynchronization.Read.All' -NoWelcome
}

$f = (Invoke-MgGraphRequest -Method GET `
  -Uri 'https://graph.microsoft.com/beta/directory/onPremisesSynchronization').value[0].features

[pscustomobject]@{
  passwordWritebackEnabled = $f.passwordWritebackEnabled
  passwordSyncEnabled      = $f.passwordSyncEnabled
} | Format-List

if ($f.passwordWritebackEnabled) {
  Write-Host "OK: password writeback is reported ENABLED in the cloud." -ForegroundColor Green
} else {
  Write-Host "Not yet: passwordWritebackEnabled=False." -ForegroundColor Yellow
  Write-Host "  Config heartbeat can lag ~30 min. To force a re-report (elevated): Restart-Service ADSync" -ForegroundColor Yellow
}
