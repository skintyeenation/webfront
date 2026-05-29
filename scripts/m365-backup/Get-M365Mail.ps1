<#
.SYNOPSIS
  Pull M365 mail + calendar + contacts to local disk via Microsoft Graph
  delta queries. Append-only, idempotent, resumable.

.DESCRIPTION
  Authenticated as the Entra app `skintyee-m365-backup` (Mail.Read,
  Calendars.Read, Contacts.Read, User.Read.All — all read-only). For
  every enabled mailbox in the tenant:

    1. Resumes from a persisted delta token (or starts fresh first run)
    2. Walks the delta result set: for each NEW or MODIFIED message,
       downloads the full MIME body (including attachments) as .eml
    3. Files by mailbox/year/month/<safe-message-id>.eml
    4. Records DELETED messages in deletions.log (does NOT delete the
       local copy — append-only by design)
    5. Persists the new delta token for the next run
    6. Same loop for calendar events and contacts
    7. Pushes a success metric to Application Insights for alerting

  Append-only by construction: a message that's been downloaded once
  stays on disk forever, regardless of upstream changes. Restore is a
  separate operation requiring different (write) credentials.

.PARAMETER BackupRoot
  Where to store the archive. Default: D:\backups\m365-email

.PARAMETER MaxParallel
  How many mailboxes to process concurrently. Default: 4

.PARAMETER DryRun
  Don't actually write files or push metrics; just log what WOULD happen.

.ENV M365_TENANT_ID
  Entra tenant ID (GUID). Pulled from 1Password by Run-Backup.ps1.

.ENV M365_CLIENT_ID
  Entra app ID for skintyee-m365-backup.

.ENV M365_CLIENT_SECRET
  Client secret value.

.ENV AI_CONNECTION_STRING
  Application Insights connection string for the heartbeat metric.

.EXAMPLE
  pwsh -File Get-M365Mail.ps1
  # Reads env vars set by Run-Backup.ps1

.NOTES
  Secrets MUST come from the environment (Run-Backup.ps1 loads them
  from 1Password at task-start time). Never commit credentials.

  See:
    docs/365/email-backup.md          — the runbook
    docs/devops/backup-architecture.md — the broader architecture
#>

[CmdletBinding()]
param(
  [string]$BackupRoot  = "D:\backups\m365-email",
  [int]$MaxParallel    = 4,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ----- validate env --------------------------------------------------------
$TenantId     = $env:M365_TENANT_ID
$ClientId     = $env:M365_CLIENT_ID
$ClientSecret = $env:M365_CLIENT_SECRET
$AiConnStr    = $env:AI_CONNECTION_STRING

if (-not $TenantId -or -not $ClientId -or -not $ClientSecret) {
  throw "Missing env vars. Required: M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET. Run via Run-Backup.ps1, not directly."
}

# ----- logging --------------------------------------------------------------
$LogDir = Join-Path $BackupRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
$DeletionsLog = Join-Path $LogDir "deletions.log"

function Log {
  param([string]$Msg, [string]$Level = "INFO")
  $line = "$(Get-Date -Format o) [$Level] $Msg"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

Log "▸ M365 backup starting (DryRun=$DryRun, BackupRoot=$BackupRoot)"
Log "  tenant: $TenantId  app: $ClientId"

# ----- 1) Acquire app-only token -------------------------------------------
function Get-GraphToken {
  $body = @{
    client_id     = $ClientId
    client_secret = $ClientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
  }
  $resp = Invoke-RestMethod -Method POST `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
    -Body $body -ContentType "application/x-www-form-urlencoded"
  return $resp.access_token
}

Log "▸ acquiring Graph token…"
$Token = Get-GraphToken
$Headers = @{ Authorization = "Bearer $Token" }
$TokenAcquiredAt = Get-Date
Log "  token acquired (valid ~1 hour)"

# Helper: refresh token if older than 50 min
function Ensure-FreshToken {
  $age = (Get-Date) - $TokenAcquiredAt
  if ($age.TotalMinutes -gt 50) {
    Log "  refreshing token (age $($age.TotalMinutes) min)…"
    $script:Token = Get-GraphToken
    $script:Headers = @{ Authorization = "Bearer $Token" }
    $script:TokenAcquiredAt = Get-Date
  }
}

# ----- 2) Enumerate enabled mailboxes ---------------------------------------
Log "▸ enumerating enabled users…"
$users = @()
$nextUrl = 'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,mail,accountEnabled&$filter=accountEnabled eq true'
while ($nextUrl) {
  Ensure-FreshToken
  $page = Invoke-RestMethod -Headers $Headers -Uri $nextUrl
  $users += $page.value | Where-Object { $_.mail }   # users with no mailbox have null .mail
  $nextUrl = $page.'@odata.nextLink'
}
Log "  found $($users.Count) mailboxes"

if ($users.Count -eq 0) {
  Log "  no mailboxes — nothing to do" "WARN"
  exit 0
}

# ----- 3) Per mailbox: delta sync of messages, events, contacts ------------
$StateDir = Join-Path $BackupRoot "state"
if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }

# Track aggregate stats
$totalNew = 0
$totalDel = 0
$totalErrors = 0

foreach ($u in $users) {
  $upn = $u.userPrincipalName
  $userDir = Join-Path $BackupRoot "mailboxes\$upn"
  if (-not (Test-Path $userDir)) { New-Item -ItemType Directory -Path $userDir -Force | Out-Null }

  Log "▸ $upn"
  $userNew = 0; $userDel = 0; $userErr = 0

  # ----- messages ----------------------------------------------------------
  $msgStateFile = Join-Path $StateDir "$($u.id)-messages.json"
  $deltaUrl = if (Test-Path $msgStateFile) {
    try { (Get-Content $msgStateFile | ConvertFrom-Json).deltaLink } catch { $null }
  } else { $null }
  if (-not $deltaUrl) {
    $deltaUrl = 'https://graph.microsoft.com/v1.0/users/' + $u.id + '/messages/delta?$select=id,receivedDateTime,subject,from,hasAttachments'
  }

  $pageCount = 0
  do {
    Ensure-FreshToken
    try {
      $page = Invoke-RestMethod -Headers $Headers -Uri $deltaUrl
    } catch {
      # Handle 429 throttling: respect Retry-After
      if ($_.Exception.Response.StatusCode -eq 429) {
        $retryAfter = $_.Exception.Response.Headers["Retry-After"]
        if (-not $retryAfter) { $retryAfter = 60 }
        Log "  throttled (429); waiting $retryAfter sec" "WARN"
        Start-Sleep -Seconds ([int]$retryAfter)
        continue
      } else {
        Log "  error fetching messages for $upn`: $_" "ERROR"
        $userErr++
        $totalErrors++
        break
      }
    }
    $pageCount++

    foreach ($msg in $page.value) {
      if ($msg.'@removed') {
        # Recorded — but NOT deleted from local archive (write-only / append-only)
        $delLine = "$(Get-Date -Format o)`t$upn`tmessage`t$($msg.id)`tREMOVED_UPSTREAM"
        if (-not $DryRun) {
          Add-Content -Path $DeletionsLog -Value $delLine
        }
        $userDel++; $totalDel++
        continue
      }
      try {
        $dt = [datetime]$msg.receivedDateTime
        $dir = Join-Path $userDir "messages\$($dt.Year)\$('{0:D2}' -f $dt.Month)"
        $safeId = $msg.id -replace '[^a-zA-Z0-9_-]', '_'
        $eml = Join-Path $dir "$safeId.eml"
        if (-not (Test-Path $eml)) {
          if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
          if (-not $DryRun) {
            # Download MIME ($value — full message + inline attachments)
            $mimeUrl = "https://graph.microsoft.com/v1.0/users/$($u.id)/messages/$($msg.id)/`$value"
            Invoke-WebRequest -Headers $Headers -Uri $mimeUrl -OutFile $eml -ErrorAction Stop
          }
          $userNew++; $totalNew++
        }
      } catch {
        Log "  failed to download message $($msg.id) for $upn`: $_" "WARN"
        $userErr++
        $totalErrors++
      }
    }

    if ($page.'@odata.nextLink') {
      $deltaUrl = $page.'@odata.nextLink'
    } elseif ($page.'@odata.deltaLink') {
      # End of delta batch — persist token for next run
      if (-not $DryRun) {
        @{ deltaLink = $page.'@odata.deltaLink'; lastRun = (Get-Date -Format o); pages = $pageCount } |
          ConvertTo-Json | Set-Content -Path $msgStateFile
      }
      $deltaUrl = $null
    } else {
      $deltaUrl = $null
    }
  } while ($deltaUrl)

  # ----- calendar events ---------------------------------------------------
  $evtStateFile = Join-Path $StateDir "$($u.id)-events.json"
  $deltaUrl = if (Test-Path $evtStateFile) {
    try { (Get-Content $evtStateFile | ConvertFrom-Json).deltaLink } catch { $null }
  } else { $null }
  if (-not $deltaUrl) {
    $deltaUrl = 'https://graph.microsoft.com/v1.0/users/' + $u.id + '/events/delta?$select=id,subject,start,end,organizer,attendees'
  }

  do {
    Ensure-FreshToken
    try {
      $page = Invoke-RestMethod -Headers $Headers -Uri $deltaUrl
    } catch {
      if ($_.Exception.Response.StatusCode -eq 429) {
        Start-Sleep -Seconds 60; continue
      } else {
        Log "  error fetching events for $upn`: $_" "WARN"
        break
      }
    }
    foreach ($evt in $page.value) {
      if ($evt.'@removed') {
        if (-not $DryRun) {
          Add-Content -Path $DeletionsLog -Value "$(Get-Date -Format o)`t$upn`tevent`t$($evt.id)`tREMOVED_UPSTREAM"
        }
        continue
      }
      try {
        $dt = if ($evt.start.dateTime) { [datetime]$evt.start.dateTime } else { Get-Date }
        $dir = Join-Path $userDir "events\$($dt.Year)\$('{0:D2}' -f $dt.Month)"
        $safeId = $evt.id -replace '[^a-zA-Z0-9_-]', '_'
        $json = Join-Path $dir "$safeId.json"
        if (-not (Test-Path $json)) {
          if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
          if (-not $DryRun) {
            $evt | ConvertTo-Json -Depth 10 | Set-Content -Path $json
          }
        }
      } catch {
        Log "  failed to save event $($evt.id) for $upn`: $_" "WARN"
      }
    }
    if ($page.'@odata.nextLink') {
      $deltaUrl = $page.'@odata.nextLink'
    } elseif ($page.'@odata.deltaLink') {
      if (-not $DryRun) {
        @{ deltaLink = $page.'@odata.deltaLink'; lastRun = (Get-Date -Format o) } |
          ConvertTo-Json | Set-Content -Path $evtStateFile
      }
      $deltaUrl = $null
    } else {
      $deltaUrl = $null
    }
  } while ($deltaUrl)

  # ----- contacts ----------------------------------------------------------
  $ctStateFile = Join-Path $StateDir "$($u.id)-contacts.json"
  $deltaUrl = if (Test-Path $ctStateFile) {
    try { (Get-Content $ctStateFile | ConvertFrom-Json).deltaLink } catch { $null }
  } else { $null }
  if (-not $deltaUrl) {
    $deltaUrl = "https://graph.microsoft.com/v1.0/users/$($u.id)/contacts/delta"
  }

  do {
    Ensure-FreshToken
    try {
      $page = Invoke-RestMethod -Headers $Headers -Uri $deltaUrl
    } catch {
      if ($_.Exception.Response.StatusCode -eq 429) { Start-Sleep -Seconds 60; continue }
      Log "  error fetching contacts for $upn`: $_" "WARN"; break
    }
    foreach ($ct in $page.value) {
      if ($ct.'@removed') {
        if (-not $DryRun) {
          Add-Content -Path $DeletionsLog -Value "$(Get-Date -Format o)`t$upn`tcontact`t$($ct.id)`tREMOVED_UPSTREAM"
        }
        continue
      }
      try {
        $dir = Join-Path $userDir "contacts"
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $safeId = $ct.id -replace '[^a-zA-Z0-9_-]', '_'
        $json = Join-Path $dir "$safeId.json"
        if (-not (Test-Path $json) -and -not $DryRun) {
          $ct | ConvertTo-Json -Depth 10 | Set-Content -Path $json
        }
      } catch {
        Log "  failed to save contact $($ct.id) for $upn`: $_" "WARN"
      }
    }
    if ($page.'@odata.nextLink') {
      $deltaUrl = $page.'@odata.nextLink'
    } elseif ($page.'@odata.deltaLink') {
      if (-not $DryRun) {
        @{ deltaLink = $page.'@odata.deltaLink'; lastRun = (Get-Date -Format o) } |
          ConvertTo-Json | Set-Content -Path $ctStateFile
      }
      $deltaUrl = $null
    } else {
      $deltaUrl = $null
    }
  } while ($deltaUrl)

  Log "  $upn  +$userNew new  ~$userDel deleted-upstream  $userErr errors"
}

Log "▸ summary: +$totalNew new files, ~$totalDel deleted-upstream, $totalErrors errors across $($users.Count) mailboxes"

# ----- 4) Touch heartbeat file + push success metric -----------------------
$heartbeatFile = Join-Path (Split-Path $BackupRoot -Parent) "_alerting\.last-success-m365-email"
if (-not $DryRun) {
  New-Item -ItemType File -Path $heartbeatFile -Force | Out-Null
  (Get-Item $heartbeatFile).LastWriteTime = Get-Date
}

# Push to Application Insights
if ($AiConnStr) {
  try {
    # Parse the connection string for the InstrumentationKey + IngestionEndpoint
    $aiParts = @{}
    $AiConnStr.Split(';') | ForEach-Object {
      $kv = $_.Split('=', 2)
      if ($kv.Length -eq 2) { $aiParts[$kv[0]] = $kv[1] }
    }
    $ikey = $aiParts.InstrumentationKey
    $endpoint = if ($aiParts.IngestionEndpoint) { $aiParts.IngestionEndpoint.TrimEnd('/') } else { "https://dc.services.visualstudio.com" }

    $isSuccess = ($totalErrors -eq 0)
    $metricName = if ($isSuccess) { "m365_backup_success_total" } else { "m365_backup_failure_total" }
    $metricValue = 1

    $payload = @{
      name = "Microsoft.ApplicationInsights.$ikey.Metric"
      time = (Get-Date).ToUniversalTime().ToString("o")
      iKey = $ikey
      tags = @{
        "ai.cloud.role" = "skintyee-m365-backup"
      }
      data = @{
        baseType = "MetricData"
        baseData = @{
          ver = 2
          metrics = @(
            @{ name = $metricName; value = $metricValue; count = 1 }
          )
          properties = @{
            "newFiles"     = "$totalNew"
            "deleted"      = "$totalDel"
            "errors"       = "$totalErrors"
            "mailboxCount" = "$($users.Count)"
          }
        }
      }
    } | ConvertTo-Json -Depth 10 -Compress

    if (-not $DryRun) {
      Invoke-RestMethod -Method POST -Uri "$endpoint/v2/track" -Body $payload -ContentType "application/json" | Out-Null
      Log "  pushed metric $metricName=$metricValue to Application Insights"
    }
  } catch {
    Log "  couldn't push AI metric: $_" "WARN"
  }
} else {
  Log "  AI_CONNECTION_STRING not set — skipping heartbeat metric (alerts won't fire)" "WARN"
}

if ($totalErrors -gt 0) {
  Log "✗ done with $totalErrors errors" "ERROR"
  exit 1
} else {
  Log "✓ done"
  exit 0
}
