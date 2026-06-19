<#
  Phase3-PrepComputerOU.ps1
  Hybrid Entra Join prep: give the live domain-joined computers a real OU so they
  can be added to the Entra Connect sync scope (objects in CN=Computers cannot be
  a GPO link target and are awkward to scope). Creates OU=SkinTyee Computers and
  moves the live machines into it. STFN-DC stays in OU=Domain Controllers.

  RUN ELEVATED on STFN-DC. Preview by default; pass -Apply to write.

  After this: re-run the Entra Connect wizard -> Customize synchronization options
  -> add OU=SkinTyee Computers to the sync scope, then Configure device options ->
  Configure Hybrid Azure AD join. See docs/365/entra-connect.md Phase 3.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Apply)

Import-Module ActiveDirectory -ErrorAction Stop

$domainDN = (Get-ADDomain).DistinguishedName
$ouName   = 'SkinTyee Computers'
$ouDN     = "OU=$ouName,$domainDN"

# Live machines to move (STFN-DC is intentionally excluded - DCs stay put).
$live = 'XYNTAX-FMS2','ITG-LOANERPC'

if ($Apply) { Write-Host "MODE: APPLY" -ForegroundColor Cyan }
else        { Write-Host "MODE: PREVIEW (no changes)" -ForegroundColor Cyan }

# 1. Create the OU (protected from accidental deletion).
$ou = Get-ADOrganizationalUnit -Filter "Name -eq '$ouName'" -SearchBase $domainDN -ErrorAction SilentlyContinue
if ($ou) {
  Write-Host "OU exists: $ouDN" -ForegroundColor Yellow
} else {
  Write-Host "OU missing, will create: $ouDN"
  if ($Apply) {
    New-ADOrganizationalUnit -Name $ouName -Path $domainDN -ProtectedFromAccidentalDeletion $true
    Write-Host "  -> created" -ForegroundColor Green
  }
}

# 2. Move the live machines into it.
foreach ($name in $live) {
  $c = Get-ADComputer -Identity $name -ErrorAction SilentlyContinue
  if (-not $c) { Write-Host "MISSING computer object: $name" -ForegroundColor Red; continue }
  if ($c.DistinguishedName -like "*,$ouDN") {
    Write-Host "$name already in $ouName" -ForegroundColor Yellow
  } else {
    Write-Host "$name : $($c.DistinguishedName)  ->  $ouDN"
    if ($Apply) {
      Move-ADObject -Identity $c.DistinguishedName -TargetPath $ouDN
      Write-Host "  -> moved" -ForegroundColor Green
    }
  }
}

if (-not $Apply) { Write-Host "Re-run with -Apply to write." -ForegroundColor Yellow }
