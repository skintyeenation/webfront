<#
.SYNOPSIS
  Restore one or more emails from the local M365 backup archive.

.DESCRIPTION
  Manual recovery tool — NOT called by Task Scheduler. Run by an IT
  admin from an interactive session.

  Three modes:

    -ListMode
      Search the local archive index for messages matching a subject
      pattern or sender. No M365 writes.

    -RestoreToFile
      Copy a specific .eml file from the archive to a target location
      (e.g. for forwarding via Outlook). No M365 writes.

    -RestoreToMailbox
      Re-upload .eml files INTO a user's mailbox via Graph
      POST /users/{id}/messages. REQUIRES a separate, time-limited
      admin app with Mail.ReadWrite — NOT the backup app. See the
      runbook in docs/365/email-backup.md § Restore procedure.

.PARAMETER BackupRoot
  Where the local archive lives. Default: D:\backups\m365-email

.PARAMETER UPN
  Target mailbox (user@skintyee.ca).

.PARAMETER SubjectPattern
  Substring to match in the message subject (case-insensitive).

.PARAMETER FromDate / -ToDate
  Optional date filter on receivedDateTime.

.PARAMETER ListMode
  Search and print matching messages; don't restore anything.

.PARAMETER RestoreToFile
  Path to copy matching .eml files into.

.PARAMETER RestoreToMailbox
  Upload matching .eml files back into the user's M365 mailbox.
  Requires the env var M365_RESTORE_CLIENT_SECRET (set from 1Password
  for a SEPARATE Entra app with Mail.ReadWrite).

.EXAMPLE
  # List all emails about "council meeting" in Jane's archive
  pwsh -File Restore-M365Mail.ps1 -UPN jane.doe@skintyee.ca `
    -SubjectPattern "council meeting" -ListMode

.EXAMPLE
  # Copy matching emails to a folder for forwarding
  pwsh -File Restore-M365Mail.ps1 -UPN jane.doe@skintyee.ca `
    -SubjectPattern "council meeting" `
    -FromDate "2026-01-01" -ToDate "2026-03-31" `
    -RestoreToFile "C:\Recovery\jane-council"

.NOTES
  Restore-into-M365 mode requires a separate Entra app with
  Mail.ReadWrite — DO NOT add write scopes to skintyee-m365-backup.
  Create the restore app on-demand, use it, then delete it (or rotate
  the secret immediately after).

  See: docs/365/email-backup.md § Restore procedure
#>

[CmdletBinding(DefaultParameterSetName = "List")]
param(
  [Parameter(Mandatory = $true)] [string]$UPN,
  [string]$BackupRoot = "D:\backups\m365-email",
  [string]$SubjectPattern,
  [datetime]$FromDate,
  [datetime]$ToDate,

  [Parameter(ParameterSetName = "List")]      [switch]$ListMode,
  [Parameter(ParameterSetName = "File")]      [string]$RestoreToFile,
  [Parameter(ParameterSetName = "Mailbox")]   [switch]$RestoreToMailbox
)

$ErrorActionPreference = "Stop"

function Say  ($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Die  ($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# ----- locate the mailbox archive ------------------------------------------
$userDir = Join-Path $BackupRoot "mailboxes\$UPN"
if (-not (Test-Path $userDir)) {
  Die "No archive found for $UPN at $userDir. Check the UPN spelling — must be exact."
}

$msgRoot = Join-Path $userDir "messages"
if (-not (Test-Path $msgRoot)) {
  Die "No messages folder under $userDir — has this mailbox ever been backed up?"
}

# ----- enumerate matching .eml files ---------------------------------------
Say "scanning $msgRoot for matching emails…"
$candidates = Get-ChildItem -Path $msgRoot -Recurse -Filter "*.eml"
Say "  total .eml files in archive: $($candidates.Count)"

# Filter by date (using the file's LastWriteTime — close enough since we
# never modify .eml after write; precise filter would parse the MIME)
if ($FromDate) {
  $candidates = $candidates | Where-Object { $_.LastWriteTime -ge $FromDate }
  Say "  after FromDate filter: $($candidates.Count)"
}
if ($ToDate) {
  $candidates = $candidates | Where-Object { $_.LastWriteTime -le $ToDate }
  Say "  after ToDate filter: $($candidates.Count)"
}

# Filter by subject — peek into the MIME headers
if ($SubjectPattern) {
  Say "  filtering by subject substring '$SubjectPattern' (this scans MIME headers; may take a moment)…"
  $matching = @()
  foreach ($f in $candidates) {
    try {
      $content = Get-Content -Path $f.FullName -TotalCount 100 -ErrorAction Stop
      $subjLine = $content | Where-Object { $_ -match '^Subject:' } | Select-Object -First 1
      if ($subjLine -match $SubjectPattern) {
        $matching += $f
      }
    } catch {
      # Skip unreadable files
    }
  }
  $candidates = $matching
  Say "  after subject filter: $($candidates.Count)"
}

if ($candidates.Count -eq 0) {
  Warn "no messages matched the filters"
  exit 0
}

# ----- act on the matches --------------------------------------------------
switch ($PSCmdlet.ParameterSetName) {

  "List" {
    Say "matching messages:"
    $candidates | Sort-Object LastWriteTime | ForEach-Object {
      $subj = (Get-Content -Path $_.FullName -TotalCount 100 | Where-Object { $_ -match '^Subject:' } | Select-Object -First 1) -replace '^Subject:\s*', ''
      $frm = (Get-Content -Path $_.FullName -TotalCount 100 | Where-Object { $_ -match '^From:' } | Select-Object -First 1) -replace '^From:\s*', ''
      Write-Host ("  {0:yyyy-MM-dd}  {1,-40}  {2}" -f $_.LastWriteTime, $frm.Substring(0, [Math]::Min($frm.Length, 40)), $subj)
      Write-Host "    file: $($_.FullName)" -ForegroundColor DarkGray
    }
  }

  "File" {
    if (-not (Test-Path $RestoreToFile)) {
      New-Item -ItemType Directory -Path $RestoreToFile -Force | Out-Null
    }
    Say "copying $($candidates.Count) message(s) to $RestoreToFile…"
    foreach ($f in $candidates) {
      Copy-Item -Path $f.FullName -Destination $RestoreToFile -Force
    }
    Ok "$($candidates.Count) message(s) copied. Open in Outlook by double-clicking the .eml files."
  }

  "Mailbox" {
    $restoreSecret = $env:M365_RESTORE_CLIENT_SECRET
    $restoreAppId  = $env:M365_RESTORE_CLIENT_ID
    $tenantId      = $env:M365_TENANT_ID

    if (-not $restoreSecret -or -not $restoreAppId -or -not $tenantId) {
      Die @"
RestoreToMailbox requires a SEPARATE Entra app with Mail.ReadWrite.
Set these env vars (from 1Password, time-limited):
  M365_TENANT_ID
  M365_RESTORE_CLIENT_ID         — a DIFFERENT app than skintyee-m365-backup
  M365_RESTORE_CLIENT_SECRET     — the restore app's secret

The backup app (skintyee-m365-backup) has Mail.Read only and CANNOT write.
This separation is intentional — see docs/365/email-backup.md.
"@
    }

    Warn "RESTORE-TO-MAILBOX is a destructive operation"
    Warn "  Source archive: $userDir"
    Warn "  Target mailbox: $UPN"
    Warn "  Files to upload: $($candidates.Count)"
    $confirm = Read-Host "Type the literal string 'RESTORE' to proceed"
    if ($confirm -ne "RESTORE") {
      Die "Aborted (confirmation did not match)"
    }

    Say "acquiring restore-app token…"
    $body = @{
      client_id     = $restoreAppId
      client_secret = $restoreSecret
      scope         = "https://graph.microsoft.com/.default"
      grant_type    = "client_credentials"
    }
    $tok = (Invoke-RestMethod -Method POST `
      -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" `
      -Body $body -ContentType "application/x-www-form-urlencoded").access_token
    $hdr = @{ Authorization = "Bearer $tok" }

    Say "looking up user $UPN in tenant…"
    $usr = Invoke-RestMethod -Headers $hdr `
      -Uri "https://graph.microsoft.com/v1.0/users/$UPN"
    Ok "user id: $($usr.id)"

    $uploaded = 0; $failed = 0
    foreach ($f in $candidates) {
      try {
        $mime = Get-Content -Path $f.FullName -Raw -Encoding Byte
        Invoke-RestMethod -Method POST `
          -Headers (@{ Authorization = "Bearer $tok"; "Content-Type" = "text/plain" }) `
          -Uri "https://graph.microsoft.com/v1.0/users/$($usr.id)/messages/`$value" `
          -Body $mime
        $uploaded++
        Write-Host "  ✓ uploaded $($f.Name)" -ForegroundColor Green
      } catch {
        $failed++
        Write-Host "  ✗ failed $($f.Name): $_" -ForegroundColor Red
      }
    }
    Ok "uploaded $uploaded; failed $failed"
  }
}
