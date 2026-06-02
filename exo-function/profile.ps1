# profile.ps1 — runs once per worker process at cold start.
#
# Authenticates to Azure with the Function App's managed identity so we can
# pull the EXO auth cert from Key Vault without storing a secret in app
# settings. The cert + connection itself happen per-invocation in run.ps1
# (Connect-ExchangeOnline doesn't persist sensibly across invocations on
# the PowerShell worker model).

if ($env:MSI_SECRET) {
    Disable-AzContextAutosave -Scope Process | Out-Null
    Connect-AzAccount -Identity -ErrorAction SilentlyContinue | Out-Null
}
