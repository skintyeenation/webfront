<#
  Enable-PasswordWritebackPermissions.ps1
  SSPR password-writeback prerequisite: grant the Entra Connect on-prem connector
  account (MSOL_*) the AD permissions Microsoft requires for password writeback,
  scoped to descendant USER objects of OU=SkinTyee Users:
    - Reset Password   (extended right)
    - Change Password  (extended right)
    - Write lockoutTime   (attribute)  -- account unlock
    - Write pwdLastSet    (attribute)  -- force-change-at-next-logon handling

  This is ONE of the three Step-1 pieces in docs/365/password-reset-sspr.md. The
  other two are run separately on this same server (elevated):
    Set-ADSyncAADPasswordResetConfiguration -Enable $true   # turn writeback on
  then in Entra: Protection > Password reset > On-premises integration > Write
  back passwords = Yes.

  RUN ELEVATED on STFN-DC. Preview by default; pass -Apply to write the ACEs.
  Finds the MSOL_ connector account automatically.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Apply)

Import-Module ActiveDirectory -ErrorAction Stop

$ouDN = "OU=SkinTyee Users,$((Get-ADDomain).DistinguishedName)"

# The on-prem AD DS connector account Entra Connect created.
$msol = Get-ADUser -Filter "SamAccountName -like 'MSOL_*'" -ErrorAction Stop
if (-not $msol) { throw "No MSOL_* connector account found." }
if ($msol -is [array]) { throw "Multiple MSOL_* accounts found; specify which." }
$sid = [System.Security.Principal.SecurityIdentifier]$msol.SID

# Inheritance target: descendant USER objects only.
$userGuid = [GUID]'bf967aba-0de6-11d0-a285-00aa003049e2'

# right name / ActiveDirectoryRights / objectType GUID
$aces = @(
  @{ name='Reset Password';     adr='ExtendedRight'; guid=[GUID]'00299570-246d-11d0-a768-00aa006e0529' },
  @{ name='Change Password';    adr='ExtendedRight'; guid=[GUID]'ab721a53-1e2f-11d0-9819-00aa0040529b' },
  @{ name='Write lockoutTime';  adr='WriteProperty'; guid=[GUID]'28630ebf-41d5-11d1-a9c1-0000f80367c1' },
  @{ name='Write pwdLastSet';   adr='WriteProperty'; guid=[GUID]'bf967a0a-0de6-11d0-a285-00aa003049e2' }
)

if ($Apply) { Write-Host "MODE: APPLY" -ForegroundColor Cyan }
else        { Write-Host "MODE: PREVIEW (no changes)" -ForegroundColor Cyan }
Write-Host "Connector account : $($msol.SamAccountName)"
Write-Host "Target OU         : $ouDN  (descendant user objects)"

$acl = Get-Acl -Path "AD:\$ouDN"
foreach ($a in $aces) {
  $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $sid, $a.adr, 'Allow', $a.guid, 'Descendents', $userGuid)
  Write-Host ("  + {0,-16} ({1})" -f $a.name, $a.adr)
  if ($Apply) { $acl.AddAccessRule($ace) }
}
if ($Apply) {
  Set-Acl -Path "AD:\$ouDN" -AclObject $acl
  Write-Host "Granted. Now run: Set-ADSyncAADPasswordResetConfiguration -Enable `$true" -ForegroundColor Green
} else {
  Write-Host "Re-run with -Apply to write these ACEs." -ForegroundColor Yellow
}
