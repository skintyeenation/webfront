<#
  Set-TlsStrongCrypto.ps1
  Entra Connect v2 prerequisite: enable TLS 1.2 .NET strong crypto.
  Server 2022 enables TLS 1.2 at the OS level, but the .NET SchUseStrongCrypto
  keys are unset by default; the Connect installer wants them on.

  RUN ELEVATED. Preview by default; pass -Apply to write. After applying, open a
  NEW elevated PowerShell (or reboot) before running the Entra Connect installer.

  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 mis-parses non-ASCII
  punctuation (em-dashes, smart quotes) in .ps1 files.
#>
param([switch]$Apply)

$keys = @(
  'HKLM:\SOFTWARE\Microsoft\.NETFramework\v4.0.30319',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\.NETFramework\v4.0.30319'
)

if ($Apply) { Write-Host "MODE: APPLY" -ForegroundColor Cyan }
else        { Write-Host "MODE: PREVIEW (no changes)" -ForegroundColor Cyan }

foreach ($k in $keys) {
  if (-not (Test-Path $k)) {
    Write-Host "$k  (missing, will create)"
    if ($Apply) { New-Item -Path $k -Force | Out-Null }
  }
  $cur = (Get-ItemProperty $k -ErrorAction SilentlyContinue).SchUseStrongCrypto
  Write-Host "$k  SchUseStrongCrypto (current) = $cur"
  if ($Apply) {
    New-ItemProperty -Path $k -Name SchUseStrongCrypto      -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $k -Name SystemDefaultTlsVersions -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Host "  -> set SchUseStrongCrypto=1, SystemDefaultTlsVersions=1" -ForegroundColor Green
  }
}
if (-not $Apply) { Write-Host "Re-run with -Apply to write. Then open a NEW elevated shell / reboot." -ForegroundColor Yellow }
