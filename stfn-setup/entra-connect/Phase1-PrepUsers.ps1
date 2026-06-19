<#
  Phase 1 - Prep on-prem AD users for Entra Connect (Skin Tyee / STFN.local -> skintyee.ca)
  PREVIEW by default. Run with -Apply to make changes.

  What it does:
    1. Adds skintyee.ca as a forest UPN suffix (additive, safe).
    2. Creates OU=SkinTyee Users,DC=STFN,DC=local (if missing).
    3. For the 8 mapped users (keyed by immutable ObjectGUID):
         - sets UserPrincipalName = first.last@skintyee.ca
         - sets sAMAccountName    = first.last   (cleans the spaces, e.g. "Gabriel Tom" -> gabriel.tom)
         - sets mail            = first.last@skintyee.ca
         - sets proxyAddresses  = SMTP:first.last@skintyee.ca  (uppercase = primary)
         - sets GivenName/Surname if empty
         - moves the object into OU=SkinTyee Users
#>
param([switch]$Apply)

Import-Module ActiveDirectory -ErrorAction Stop
$ErrorActionPreference = 'Stop'

$domainDN = 'DC=STFN,DC=local'
$ouName   = 'SkinTyee Users'
$ouPath   = "OU=$ouName,$domainDN"
$suffix   = 'skintyee.ca'

# GUID -> target cloud identity. GUIDs captured live from AD; safe against the spaces in Name/sAMAccountName.
$map = @(
  @{ Guid='dacc7415-750a-4300-bf82-75113ce7a5b8'; Upn='gabriel.tom@skintyee.ca';        Given='Gabriel';  Sur='Tom';       Note='MERGE -> existing cloud' }
  @{ Guid='84a5287e-b738-4f5f-aa96-9a55f342cca3'; Upn='kim.pike@skintyee.ca';           Given='Kim';      Sur='Pike';      Note='MERGE -> existing cloud' }
  @{ Guid='90b53d75-bc91-42f8-80b9-2529989a1d23'; Upn='lucas.lopatka@skintyee.ca';      Given='Lucas';    Sur='Lopatka';   Note='MERGE -> existing cloud' }
  @{ Guid='19308fb5-134b-4dfd-8f79-96a1cbc4b310'; Upn='melissa.dyck@skintyee.ca';       Given='Melissa';  Sur='Dyck';      Note='MERGE -> existing cloud' }
  @{ Guid='bc8d01d8-b443-4a69-b091-4ba56edc15fc'; Upn='niki.misfeldt@skintyee.ca';      Given='Niki';     Sur='Misfeldt';  Note='MERGE -> existing cloud' }
  @{ Guid='b62978e6-150b-41d9-916d-44613ea5eadf'; Upn='nathan.michaluk@skintyee.ca';    Given='Nathan';   Sur='Michaluk';  Note='NEW cloud account' }
  @{ Guid='4d00d09d-ea0f-4131-8d08-c3956e810147'; Upn='shaneika.mccorkell@skintyee.ca'; Given='Shaneika'; Sur='McCorkell'; Note='NEW cloud account' }
  @{ Guid='c8c7af17-8c09-4c98-a7f0-392742970777'; Upn='jason.wiebe@skintyee.ca';        Given='Jason';    Sur='Wiebe';     Note='NEW cloud account' }
)

Write-Host ("MODE: " + ($(if($Apply){'APPLY (changes will be written)'}else{'PREVIEW (no changes)'}))) -ForegroundColor Cyan
Write-Host ""

# --- 1. UPN suffix ---
$haveSuffix = (Get-ADForest).UPNSuffixes -contains $suffix
if ($haveSuffix) { Write-Host "[UPN suffix] '$suffix' already present." }
else {
  Write-Host "[UPN suffix] will ADD '$suffix' to forest."
  if ($Apply) { Set-ADForest -Identity (Get-ADForest).Name -UPNSuffixes @{add=$suffix}; Write-Host "  -> added." -ForegroundColor Green }
}

# --- 2. OU ---
$ouExists = $false
try { Get-ADOrganizationalUnit -Identity $ouPath | Out-Null; $ouExists = $true } catch {}
if ($ouExists) { Write-Host "[OU] '$ouPath' already exists." }
else {
  Write-Host "[OU] will CREATE '$ouPath'."
  if ($Apply) { New-ADOrganizationalUnit -Name $ouName -Path $domainDN -ProtectedFromAccidentalDeletion $true; Write-Host "  -> created." -ForegroundColor Green }
}

Write-Host ""
Write-Host "[Users]"
foreach ($m in $map) {
  $u = Get-ADUser -Identity $m.Guid -Properties SamAccountName,UserPrincipalName,mail,proxyAddresses,GivenName,Surname,DistinguishedName
  $sam = ($m.Upn -split '@')[0]
  Write-Host ("  {0,-20} {1}" -f $u.Name, $m.Note)
  Write-Host ("     sam  : {0}  ->  {1}" -f $u.SamAccountName, $sam)
  Write-Host ("     UPN  : {0}  ->  {1}" -f $u.UserPrincipalName, $m.Upn)
  Write-Host ("     mail : {0}  ->  {1}" -f ($u.mail), $m.Upn)
  Write-Host ("     proxy: {0}  ->  SMTP:{1}" -f ($u.proxyAddresses -join ';'), $m.Upn)
  Write-Host ("     OU   : {0}" -f $u.DistinguishedName)
  if ($Apply) {
    $set = @{ UserPrincipalName = $m.Upn; EmailAddress = $m.Upn; SamAccountName = $sam }
    if (-not $u.GivenName) { $set['GivenName'] = $m.Given }
    if (-not $u.Surname)   { $set['Surname']   = $m.Sur }
    Set-ADUser -Identity $u.ObjectGUID @set
    Set-ADUser -Identity $u.ObjectGUID -Replace @{ proxyAddresses = "SMTP:$($m.Upn)" }
    if ($u.DistinguishedName -notmatch [regex]::Escape($ouPath)) {
      Move-ADObject -Identity $u.ObjectGUID -TargetPath $ouPath
    }
    Write-Host "     -> applied." -ForegroundColor Green
  }
}
Write-Host ""
Write-Host "Done." -ForegroundColor Cyan
if (-not $Apply) { Write-Host "Re-run with:  .\Phase1-PrepUsers.ps1 -Apply" -ForegroundColor Yellow }
