<#
  Phase3-RemoveStaleComputers.ps1
  Clean up the 9 stale domain-joined computer objects (last logon back in 2024)
  before Hybrid Entra Join, so we don't sync dead devices up to Entra.

  Safe by stages:
    .\Phase3-RemoveStaleComputers.ps1              # PREVIEW only
    .\Phase3-RemoveStaleComputers.ps1 -Apply       # DISABLE the accounts
    .\Phase3-RemoveStaleComputers.ps1 -Apply -Delete   # DELETE the objects

  Recommended: -Apply first (disable), confirm nothing breaks for a week, then
  -Apply -Delete. RUN ELEVATED on STFN-DC.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Apply,[switch]$Delete)

Import-Module ActiveDirectory -ErrorAction Stop

# The 9 stale objects from the 2026-06-18 inventory (all last logon in 2024).
# STFN-DC, XYNTAX-FMS2 and ITG-LOANERPC are LIVE and deliberately excluded.
$stale = 'FS1','FS2','FS3','FS4','XYNTAX-FMS1',
         'STFN2024-LT01','STFN2024-LT02','STFN2024-LT03','STFN2022-LT01'

if ($Apply -and $Delete) { Write-Host "MODE: APPLY + DELETE (objects will be removed)" -ForegroundColor Red }
elseif ($Apply)          { Write-Host "MODE: APPLY (accounts will be disabled)" -ForegroundColor Cyan }
else                     { Write-Host "MODE: PREVIEW (no changes)" -ForegroundColor Cyan }

foreach ($name in $stale) {
  $c = Get-ADComputer -Identity $name -Properties Enabled,LastLogonDate -ErrorAction SilentlyContinue
  if (-not $c) { Write-Host "not found (already removed?): $name" -ForegroundColor Yellow; continue }
  $last = if ($c.LastLogonDate) { $c.LastLogonDate.ToString('yyyy-MM-dd') } else { 'never' }
  if ($Delete) {
    Write-Host ("DELETE  {0,-16} (enabled={1}, last={2})" -f $name,$c.Enabled,$last)
    if ($Apply) {
      # Clear accidental-deletion protection if set, then remove the object (and any leaf).
      Set-ADObject -Identity $c.DistinguishedName -ProtectedFromAccidentalDeletion $false -ErrorAction SilentlyContinue
      Remove-ADObject -Identity $c.DistinguishedName -Recursive -Confirm:$false
      Write-Host "  -> removed" -ForegroundColor Green
    }
  } else {
    Write-Host ("DISABLE {0,-16} (enabled={1}, last={2})" -f $name,$c.Enabled,$last)
    if ($Apply) {
      Disable-ADAccount -Identity $c.DistinguishedName
      Write-Host "  -> disabled" -ForegroundColor Green
    }
  }
}

if (-not $Apply) { Write-Host "Re-run with -Apply (disable) or -Apply -Delete (remove)." -ForegroundColor Yellow }
