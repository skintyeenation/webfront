<#
  Verify-HybridJoin.ps1
  Pass/fail check for the Hybrid Entra Join rollout (Phase 3 of entra-connect.md /
  the hybrid-entra-join-plan.md). Read-only Graph query -- safe to run anytime.

  Lists every device in the Entra tenant with its trustType + OS, plus its
  MANAGEMENT + COMPLIANCE state, reports the Hybrid count (trustType = ServerAd),
  and flags DUPLICATE registrations (one computer with multiple Entra objects).
  Pass -Pilot <name> to gate on a specific pilot machine flipping to ServerAd.

  trustType -> meaning:
    Workplace = registered only (the pre-Hybrid "Workplace Join" state we're fixing)
    ServerAd  = Hybrid Azure AD joined  (DomainJoined AND AzureAdJoined) <- the goal
    AzureAd   = cloud-only Entra joined (new BYOD/Entra-joined PCs)

  IMPORTANT: Hybrid joined does NOT mean Intune managed. Join type (trustType) is
  an IDENTITY state; isManaged/managementType is a MANAGEMENT state; isCompliant
  is a COMPLIANCE state. They are independent. Skin Tyee runs hybrid join with NO
  Intune (ADR-16), so the expected state is: ServerAd + not-managed + no-policy.
  See docs/365/device-identity-vs-management.md.

  Compliance is a TRI-STATE: isCompliant true = passed an Intune policy,
  false = evaluated and FAILED, null = no policy evaluated (NOT a failure).

  Runs anywhere PowerShell 7 + the Graph SDK exist -- including the Mac (cloud
  Graph access only; this needs no on-prem reach). On the DC it's the same check.

  Usage:
    .\Verify-HybridJoin.ps1                       # inventory + management + duplicates
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

# Helper: render the compliance tri-state. null is "no-policy", NOT "FAIL".
function Format-Compliance($isCompliant) {
  if ($isCompliant -eq $true)  { return 'Compliant' }
  if ($isCompliant -eq $false) { return 'NONCOMPLIANT' }
  return 'no-policy'   # null -> no Intune policy evaluated this device
}

Write-Host "=== Entra devices (trust / management / compliance) ===" -ForegroundColor Cyan
$devices = @(Get-MgDevice -All -Property DisplayName,TrustType,OperatingSystem,OperatingSystemVersion,ApproximateLastSignInDateTime,RegistrationDateTime,IsManaged,IsCompliant,ManagementType,Id |
             Sort-Object DisplayName)

if ($devices.Count -eq 0) {
  Write-Host "No devices registered in Entra yet." -ForegroundColor Yellow
}

# Header row for the columns below.
Write-Host (("{0,-20} {1,-10} {2,-9} {3,-13} {4,-8} {5}" -f 'NAME','TRUST','MANAGED','COMPLIANCE','MGMT','OS')) -ForegroundColor DarkGray

$devices | ForEach-Object {
  $trust   = if ($_.TrustType) { $_.TrustType } else { '(none)' }
  $managed = if ($_.IsManaged) { 'MDM' } else { '-' }
  $comp    = Format-Compliance $_.IsCompliant
  $mgmt    = if ($_.ManagementType) { $_.ManagementType } else { '-' }
  $color = switch ($trust) {
    'ServerAd'  { 'Green' }   # Hybrid joined -- the goal
    'AzureAd'   { 'Cyan' }    # cloud-only Entra joined
    default     { 'Yellow' }  # Workplace / registered-only -- pre-Hybrid
  }
  $os = ("{0} {1}" -f $_.OperatingSystem, $_.OperatingSystemVersion)
  Write-Host (("{0,-20} {1,-10} {2,-9} {3,-13} {4,-8} {5}" -f $_.DisplayName, $trust, $managed, $comp, $mgmt, $os)) -ForegroundColor $color
}

$hybrid = @($devices | Where-Object { $_.TrustType -eq 'ServerAd' })
$intune = @($devices | Where-Object { $_.IsManaged -eq $true })
Write-Host ""
Write-Host ("Hybrid-joined (ServerAd) count: " + $hybrid.Count) -ForegroundColor Cyan
Write-Host ("Intune-managed (isManaged)  count: " + $intune.Count + "  (expected 0 under ADR-16; >0 means MDM auto-enrollment is on)") -ForegroundColor Cyan

# --- Duplicate registrations ----------------------------------------------
# One physical machine can have MORE THAN ONE Entra device object (e.g. a stale
# Workplace registration left behind after Hybrid Entra Join). Group by name and
# flag any computer with >1 object; mark the newest sign-in as CURRENT, the rest
# as STALE (safe to delete in Entra once confirmed). Mirrors the app/API merge.
$dupes = @($devices | Group-Object DisplayName | Where-Object { $_.Count -gt 1 })
Write-Host ""
if ($dupes.Count -eq 0) {
  Write-Host "No duplicate registrations (every computer has exactly one Entra object)." -ForegroundColor Green
} else {
  Write-Host ("=== Duplicate registrations (" + $dupes.Count + " computer(s) with multiple Entra objects) ===") -ForegroundColor Yellow
  foreach ($g in $dupes) {
    Write-Host ("  " + $g.Name + "  (" + $g.Count + " objects)") -ForegroundColor Yellow
    $ordered = @($g.Group | Sort-Object ApproximateLastSignInDateTime -Descending)
    for ($i = 0; $i -lt $ordered.Count; $i++) {
      $o = $ordered[$i]
      $tag = if ($i -eq 0) { 'CURRENT' } else { 'STALE  ' }
      $tagColor = if ($i -eq 0) { 'Green' } else { 'Red' }
      $last = if ($o.ApproximateLastSignInDateTime) { ([datetime]$o.ApproximateLastSignInDateTime).ToString('yyyy-MM-dd') } else { '----------' }
      Write-Host ("    [" + $tag + "] " + ("{0,-10}" -f $o.TrustType) + " last-signin " + $last + "  id " + $o.Id) -ForegroundColor $tagColor
    }
    Write-Host "    -> delete STALE object(s) once confirmed:  Remove-MgDevice -DeviceId <id>" -ForegroundColor DarkGray
  }
}

# --- Pass/fail gates -------------------------------------------------------
$exit = 0

if ($Pilot) {
  # A pilot can have duplicate objects; PASS if ANY of them is ServerAd.
  $matches = @($devices | Where-Object { $_.DisplayName -eq $Pilot })
  Write-Host ""
  if ($matches.Count -eq 0) {
    Write-Host ("FAIL: pilot '" + $Pilot + "' is not in Entra yet (sign-in not triggered, or computer object not in sync scope).") -ForegroundColor Red
    $exit = 1
  } elseif (@($matches | Where-Object { $_.TrustType -eq 'ServerAd' }).Count -gt 0) {
    Write-Host ("PASS: pilot '" + $Pilot + "' is Hybrid Azure AD joined (trustType=ServerAd).") -ForegroundColor Green
    if ($matches.Count -gt 1) {
      Write-Host ("      NOTE: " + $matches.Count + " Entra objects for this name -- delete the stale non-ServerAd one(s) above.") -ForegroundColor Yellow
    }
  } else {
    $cur = ($matches | Select-Object -First 1).TrustType
    Write-Host (("FAIL: pilot '" + $Pilot + "' is still '" + $cur + "', not ServerAd. Sign out/in again, wait a few minutes, then run 'dsregcmd /status' on the PC and re-check.")) -ForegroundColor Red
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
