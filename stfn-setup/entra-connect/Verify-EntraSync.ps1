<#
  Verify-EntraSync.ps1
  Post-install checks after Entra Connect's first sync (Phase 2).

  On-prem checks run on the DC (the ADSync engine). Pass -Cloud to also query
  Entra via Microsoft Graph and confirm the 8 scoped users synced with NO
  duplicates (the point of the Phase 1 soft-match prep).

  Usage:
    .\Verify-EntraSync.ps1            # on-prem ADSync state only
    .\Verify-EntraSync.ps1 -Cloud     # + Graph check (prompts device-code sign-in)

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Cloud)

Import-Module ADSync -ErrorAction SilentlyContinue

Write-Host "=== ADSync service ===" -ForegroundColor Cyan
Get-Service ADSync -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize

Write-Host "=== Sync scheduler ===" -ForegroundColor Cyan
try {
  Get-ADSyncScheduler | Select-Object SyncCycleEnabled,SchedulerSuspended,NextSyncCyclePolicyType,NextSyncCycleStartTimeInUTC | Format-List
} catch { Write-Host ("ADSync cmdlets unavailable (run on the Connect server): " + $_.Exception.Message) }

Write-Host "=== Connector run status (last run) ===" -ForegroundColor Cyan
try { Get-ADSyncConnectorRunStatus } catch { Write-Host "n/a" }

# The 8 users normalized in Phase 1 (5 should MERGE into existing cloud accts, 3 NEW)
$expected = 'gabriel.tom','kim.pike','lucas.lopatka','melissa.dyck','niki.misfeldt',
            'nathan.michaluk','shaneika.mccorkell','jason.wiebe'

if ($Cloud) {
  Write-Host ""
  Write-Host "=== Cloud (Entra): expect OnPremisesSyncEnabled=True, NO duplicates ===" -ForegroundColor Cyan
  if (-not (Get-MgContext -ErrorAction SilentlyContinue)) {
    Connect-MgGraph -Scopes 'User.Read.All' -UseDeviceCode -NoWelcome
  }
  foreach ($u in $expected) {
    $upn = "$u@skintyee.ca"
    $m = @(Get-MgUser -Filter "userPrincipalName eq '$upn'" -Property DisplayName,UserPrincipalName,OnPremisesSyncEnabled -All)
    if     ($m.Count -eq 0) { Write-Host ("MISSING   : " + $upn) -ForegroundColor Red }
    elseif ($m.Count -gt 1) { Write-Host ("DUPLICATE : " + $upn + " (x" + $m.Count + ")") -ForegroundColor Red }
    else {
      $val = $m[0].OnPremisesSyncEnabled
      $color = if ($val -eq $true) { 'Green' } else { 'Yellow' }
      Write-Host (("{0,-34} OnPremisesSyncEnabled={1}" -f $upn,$val)) -ForegroundColor $color
    }
  }
}
