$ErrorActionPreference = 'Stop'
$out = 'C:\Users\stfnadmin\graph_results.txt'
try {
  Connect-MgGraph -Scopes "User.Read.All","Domain.Read.All" -UseDeviceCode -NoWelcome
  "=== DOMAINS ===" | Out-File $out
  Get-MgDomain | Sort-Object Id | Format-Table Id,IsVerified,IsDefault,SupportedServices -AutoSize | Out-String | Add-Content $out
  "=== USERS ===" | Add-Content $out
  Get-MgUser -All -Property DisplayName,UserPrincipalName,Mail,OnPremisesSyncEnabled,UserType,AccountEnabled |
    Sort-Object UserPrincipalName |
    Format-Table DisplayName,UserPrincipalName,Mail,OnPremisesSyncEnabled,UserType,AccountEnabled -AutoSize | Out-String | Add-Content $out
  "DONE" | Add-Content $out
} catch {
  "ERROR: $($_.Exception.Message)" | Out-File $out
}
