<#
  Test-PasswordWriteback.ps1
  END-TO-END proof of SSPR password writeback: change a synced user's password in
  the CLOUD via Microsoft Graph, then poll on-prem STFN.local to see whether the new
  password authenticates there -- i.e. whether the change wrote BACK to the domain.
  No domain-PC login needed.

  -Method SsprReset (default) -> authentication/methods/resetPassword: the admin
    SSPR reset that ROUTES THROUGH the writeback service. THIS is what the app's
    rotate should use.
  -Method PasswordProfile -> PATCH /users passwordProfile: what the app's rotate
    currently does. PROVEN 2026-06-19 to set only the cloud password and NOT write
    back for synced users (PHS overwrites it). Kept for comparison.

  RUN INTERACTIVELY (not in a background/non-interactive shell): the Graph WRITE
  scope User-PasswordProfile.ReadWrite.All needs a one-time consent click that only
  works with an interactive sign-in. The on-prem check needs no elevation.

  !! WARNING: this CHANGES the target user's real password to -NewPassword. Use a
  test/disposable synced account, or tell the user the new password afterwards.

  Usage:
    .\Test-PasswordWriteback.ps1 -Upn lucas.lopatka@skintyee.ca
    .\Test-PasswordWriteback.ps1 -Upn <upn> -NewPassword '<known-strong-pw>'

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param(
  [string]$Upn = 'lucas.lopatka@skintyee.ca',
  [string]$NewPassword = 'STFN-Writeback!Test-9274',
  [int]$TimeoutSeconds = 120,
  # PasswordProfile = the directory PATCH the app's rotate currently uses (PROVEN
  #   2026-06-19 NOT to write back for synced users).
  # SsprReset = the admin SSPR reset API that DOES route through the writeback
  #   service (Password writeback service confirmed healthy via event 31042).
  [ValidateSet('PasswordProfile','SsprReset')]
  [string]$Method = 'SsprReset'
)

# This box's PSModulePath omits the user module dir; make Graph discoverable.
$userMods = Join-Path $HOME 'Documents\WindowsPowerShell\Modules'
if ((Test-Path $userMods) -and ($env:PSModulePath -notlike "*$userMods*")) {
  $env:PSModulePath = "$userMods;" + $env:PSModulePath
}
Import-Module Microsoft.Graph.Authentication -ErrorAction Stop

if ($Method -eq 'SsprReset') {
  Write-Host "=== STEP 1: admin SSPR reset via Graph (authentication/methods/resetPassword) ===" -ForegroundColor Cyan
  Connect-MgGraph -Scopes 'UserAuthenticationMethod.ReadWrite.All' -NoWelcome
} else {
  Write-Host "=== STEP 1: directory password set via Graph (passwordProfile PATCH) ===" -ForegroundColor Cyan
  Connect-MgGraph -Scopes 'User-PasswordProfile.ReadWrite.All' -NoWelcome
}
$u = Invoke-MgGraphRequest -Method GET `
  -Uri "https://graph.microsoft.com/v1.0/users/$Upn`?`$select=id,displayName,onPremisesSyncEnabled,onPremisesSamAccountName"
Write-Host ("  user: {0}  syncEnabled={1}  sam={2}" -f $u.displayName,$u.onPremisesSyncEnabled,$u.onPremisesSamAccountName)
if (-not $u.onPremisesSyncEnabled) { Write-Host "  WARNING: not a synced user -- this won't test writeback." -ForegroundColor Yellow }
if ($Method -eq 'SsprReset') {
  $pwMethodId = '28c10230-6103-485e-b985-444c60001490'   # well-known password auth method id
  $body = @{ newPassword = $NewPassword } | ConvertTo-Json
  try {
    Invoke-MgGraphRequest -Method POST -ContentType 'application/json' `
      -Uri "https://graph.microsoft.com/v1.0/users/$($u.id)/authentication/methods/$pwMethodId/resetPassword" -Body $body | Out-Null
    Write-Host "  SSPR admin reset submitted (routes through the writeback service)." -ForegroundColor Green
  } catch {
    Write-Host "  SSPR reset FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  (needs an MFA-fresh token + Authentication Administrator / Global Admin)" -ForegroundColor Yellow
  }
} else {
  $body = @{ passwordProfile = @{ password = $NewPassword; forceChangePasswordNextSignIn = $false } } | ConvertTo-Json
  Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/users/$($u.id)" -Body $body -ContentType 'application/json'
  Write-Host "  cloud password set OK (passwordProfile)." -ForegroundColor Green
}

Write-Host "=== STEP 2: poll STFN.local for the new password to land via writeback ===" -ForegroundColor Cyan
Add-Type -AssemblyName System.DirectoryServices.AccountManagement
$ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Domain','STFN.local')
$sam = $u.onPremisesSamAccountName
$landed = $false
$elapsed = 0
while ($elapsed -lt $TimeoutSeconds) {
  Start-Sleep -Seconds 15; $elapsed += 15
  $ok = $ctx.ValidateCredentials($sam, $NewPassword)
  Write-Host ("  t+{0,3}s : on-prem validates = {1}" -f $elapsed,$ok)
  if ($ok) { $landed = $true; break }
}
Write-Host ""
if ($landed) {
  Write-Host "RESULT: WRITEBACK WORKS -- the cloud change authenticated against STFN.local." -ForegroundColor Green
} else {
  Write-Host "RESULT: writeback did NOT land within ${TimeoutSeconds}s -- new password fails on-prem." -ForegroundColor Red
}
