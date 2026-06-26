<#
  Verify-HybridJoin.ps1
  Pass/fail check for the Hybrid Entra Join rollout (Phase 3 of entra-connect.md /
  the hybrid-entra-join-plan.md). Read-only Graph query -- safe to run anytime.

  Lists every device in the Entra tenant with its trustType + OS, and reports the
  Hybrid count (trustType = ServerAd). Pass -Pilot <name> to gate on a specific
  pilot machine flipping Workplace -> ServerAd.

  trustType -> meaning:
    Workplace = registered only (the pre-Hybrid "Workplace Join" state we're fixing)
    ServerAd  = Hybrid Azure AD joined  (DomainJoined AND AzureAdJoined) <- the goal
    AzureAd   = cloud-only Entra joined (new BYOD/Entra-joined PCs)

  Runs anywhere PowerShell 7 + the Graph SDK exist -- including the Mac (cloud
  Graph access only; this needs no on-prem reach). On the DC it's the same check.

  Usage:
    .\Verify-HybridJoin.ps1                       # inventory + Hybrid count
    .\Verify-HybridJoin.ps1 -Pilot Lucas-2022LT01 # PASS/FAIL on the pilot PC
    .\Verify-HybridJoin.ps1 -Baseline 0           # PASS if ServerAd count grew past 0

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param(
  [string]$Pilot,        # device displayName expected to be Hybrid (ServerAd)
  [int]$Baseline = -1    # if >=0, PASS when the ServerAd count exceeds this number
)

# This box's PSModulePath can omit the user module dir, so the Graph cmdlets are
# installed but not auto-discoverable. Add it and import explicitly (mirrors
# Verify-EntraSync.ps1).
$userMods = Join-Path $HOME 'Documents\WindowsPowerShell\Modules'
if ((Test-Path $userMods) -and ($env:PSModulePath -notlike "*$userMods*")) {
  $env:PSModulePath = "$userMods;" + $env:PSModulePath
}
Import-Module Microsoft.Graph.Authentication,Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop

if (-not (Get-MgContext -ErrorAction SilentlyContinue)) {
  Connect-MgGraph -Scopes 'Device.Read.All' -UseDeviceCode -NoWelcome
}

Write-Host "=== Entra devices (trustType + OS) ===" -ForegroundColor Cyan
$devices = @(Get-MgDevice -All -Property DisplayName,TrustType,OperatingSystem,OperatingSystemVersion,ApproximateLastSignInDateTime |
             Sort-Object DisplayName)

if ($devices.Count -eq 0) {
  Write-Host "No devices registered in Entra yet." -ForegroundColor Yellow
}

$devices | ForEach-Object {
  $trust = if ($_.TrustType) { $_.TrustType } else { '(none)' }
  $color = switch ($trust) {
    'ServerAd'  { 'Green' }   # Hybrid joined -- the goal
    'AzureAd'   { 'Cyan' }    # cloud-only Entra joined
    default     { 'Yellow' }  # Workplace / registered-only -- pre-Hybrid
  }
  Write-Host (("{0,-20} {1,-10} {2} {3}" -f $_.DisplayName, $trust, $_.OperatingSystem, $_.OperatingSystemVersion)) -ForegroundColor $color
}

$hybrid = @($devices | Where-Object { $_.TrustType -eq 'ServerAd' })
Write-Host ""
Write-Host ("Hybrid-joined (ServerAd) count: " + $hybrid.Count) -ForegroundColor Cyan

# --- Pass/fail gates -------------------------------------------------------
$exit = 0

if ($Pilot) {
  $p = $devices | Where-Object { $_.DisplayName -eq $Pilot } | Select-Object -First 1
  Write-Host ""
  if (-not $p) {
    Write-Host ("FAIL: pilot '" + $Pilot + "' is not in Entra yet (sign-in not triggered, or computer object not in sync scope).") -ForegroundColor Red
    $exit = 1
  } elseif ($p.TrustType -eq 'ServerAd') {
    Write-Host ("PASS: pilot '" + $Pilot + "' is Hybrid Azure AD joined (trustType=ServerAd).") -ForegroundColor Green
  } else {
    Write-Host (("FAIL: pilot '" + $Pilot + "' is still '" + $p.TrustType + "', not ServerAd. Sign out/in again, wait a few minutes, then run 'dsregcmd /status' on the PC and re-check.")) -ForegroundColor Red
    $exit = 1
  }
}

if ($Baseline -ge 0) {
  Write-Host ""
  if ($hybrid.Count -gt $Baseline) {
    Write-Host (("PASS: ServerAd count grew " + $Baseline + " -> " + $hybrid.Count + " (Hybrid Join is registering devices).")) -ForegroundColor Green
  } else {
    Write-Host (("FAIL: ServerAd count still " + $hybrid.Count + " (expected > " + $Baseline + ").")) -ForegroundColor Red
    $exit = 1
  }
}

exit $exit
