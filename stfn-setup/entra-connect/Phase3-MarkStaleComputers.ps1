<#
  Phase3-MarkStaleComputers.ps1
  Mark the 9 stale domain-joined computer objects (last logon back in 2024) as
  STALE and disable them -- but KEEP them in AD (do NOT delete). This preserves the
  hardware audit trail while making sure they are inactive and never picked up by
  Hybrid Entra Join. They stay in CN=Computers, which is outside the sync scope
  (only OU=SkinTyee Computers is synced), so they never reach Entra.

  Each object gets:
    - Description = "STALE retained <today> (last logon <date>) - disabled, not synced"
    - account disabled

  Safe by stages:
    .\Phase3-MarkStaleComputers.ps1            # PREVIEW only
    .\Phase3-MarkStaleComputers.ps1 -Apply     # set Description + disable

  RUN ELEVATED on STFN-DC. Reversible (re-enable + clear Description if a machine
  comes back). Nothing is deleted.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Apply)

Import-Module ActiveDirectory -ErrorAction Stop

# The 9 stale objects from the 2026-06-18 inventory (all last logon in 2024).
# STFN-DC, XYNTAX-FMS2 and ITG-LOANERPC are LIVE and deliberately excluded.
$stale = 'FS1','FS2','FS3','FS4','XYNTAX-FMS1',
         'STFN2024-LT01','STFN2024-LT02','STFN2024-LT03','STFN2022-LT01'

$today = (Get-Date).ToString('yyyy-MM-dd')

if ($Apply) { Write-Host "MODE: APPLY (set Description + disable; nothing deleted)" -ForegroundColor Cyan }
else        { Write-Host "MODE: PREVIEW (no changes)" -ForegroundColor Cyan }

foreach ($name in $stale) {
  $c = Get-ADComputer -Identity $name -Properties Enabled,LastLogonDate,Description -ErrorAction SilentlyContinue
  if (-not $c) { Write-Host "not found: $name" -ForegroundColor Yellow; continue }
  $last = if ($c.LastLogonDate) { $c.LastLogonDate.ToString('yyyy-MM-dd') } else { 'never' }
  $desc = "STALE retained $today (last logon $last) - disabled, not synced"
  Write-Host ("{0,-16} enabled={1} last={2}" -f $name,$c.Enabled,$last)
  Write-Host ("  Description -> $desc")
  if ($Apply) {
    Set-ADComputer -Identity $c.DistinguishedName -Description $desc
    if ($c.Enabled) { Disable-ADAccount -Identity $c.DistinguishedName }
    Write-Host "  -> marked + disabled" -ForegroundColor Green
  }
}

if (-not $Apply) { Write-Host "Re-run with -Apply to mark + disable. Nothing is deleted." -ForegroundColor Yellow }
