#!/usr/bin/env pwsh
# Set up the Azure DevOps tenant for Skin Tyee's `webfront` repo.
# PowerShell mirror of scripts/setup-azure-devops.sh — kept in sync.
#
# Same logic, same external behaviour. Use this on Windows-first machines
# (or wherever you'd rather have splatted hashtables + try/catch than bash
# `set -euo pipefail`). Both scripts shell out to `az` CLI under the hood,
# so the API calls are identical.
#
# What this does (idempotent — safe to re-run):
#   1. Confirms `az` CLI + `az devops` extension are installed.
#   2. Opens https://aka.ms/AzureDevOpsAccountCreate in your browser
#      so you can create the `skintyeenation` org (one-time, manual).
#   3. Creates the `webfront` project in that org if missing.
#   4. Creates the `webfront` Git repo in that project if missing.
#   5. Adds an `azure` remote to your local clone and pushes every
#      branch + tag.
#   6. Sets branch policy on `master` (require PR, no force-push).
#
# Usage:
#   pwsh scripts/setup-azure-devops.ps1
#   $env:ORG='skintyeenation'; pwsh scripts/setup-azure-devops.ps1
#   pwsh scripts/setup-azure-devops.ps1 -DryRun

param(
  [string]$Org = ($env:ORG ?? 'skintyeenation'),
  [string]$Project = ($env:PROJECT ?? 'webfront'),
  [string]$Repo = ($env:REPO ?? 'webfront'),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$OrgUrl = "https://dev.azure.com/$Org"

# ----- helpers ---------------------------------------------------------------

function Say  ([string]$m) { Write-Host "▸ $m" }
function Ok   ([string]$m) { Write-Host "  ✓ $m" -ForegroundColor Green }
function Warn ([string]$m) { Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Die  ([string]$m) { Write-Host "  ✗ $m" -ForegroundColor Red; exit 1 }

# Wrapper so -DryRun can preview commands without executing.
function Invoke-Cmd {
  param([Parameter(ValueFromRemainingArguments)] [string[]]$args)
  if ($DryRun) {
    Write-Host "  (dry-run) $($args -join ' ')"
    return
  }
  & $args[0] @($args[1..$args.Length])
  if ($LASTEXITCODE -ne 0) {
    throw "command failed (exit $LASTEXITCODE): $($args -join ' ')"
  }
}

# Open a URL in the default browser — cross-platform.
function Open-Url {
  param([string]$url)
  if ($IsMacOS)         { & open $url }
  elseif ($IsLinux)     { & xdg-open $url }
  elseif ($IsWindows)   { Start-Process $url }
  else                  { Say "open this in your browser:  $url" }
}

# ----- 1) precheck — az CLI + extension --------------------------------------

Say "checking Azure CLI…"
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  Die "Azure CLI not installed. https://docs.microsoft.com/cli/azure/install-azure-cli"
}
$azVersion = az version --query '"azure-cli"' -o tsv 2>$null
Ok "az $azVersion"

$hasExt = az extension show --name azure-devops --only-show-errors 2>$null
if (-not $hasExt) {
  Say "installing the azure-devops extension…"
  Invoke-Cmd az extension add --name azure-devops --yes --only-show-errors
}
Ok "az devops extension installed"

az devops configure --defaults "organization=$OrgUrl" "project=$Project" 2>$null

# ----- 2) sign-in check ------------------------------------------------------

Say "checking sign-in…"
$account = az account show --only-show-errors 2>$null | ConvertFrom-Json
if (-not $account) {
  Warn "not signed in to Azure. Running ``az login`` now (browser will open)."
  if (-not $DryRun) {
    Invoke-Cmd az login --only-show-errors | Out-Null
    $account = az account show --only-show-errors 2>$null | ConvertFrom-Json
  }
}
$whoami = if ($account) { $account.user.name } else { "unknown" }
Ok "signed in as $whoami"

# ----- 3) org — exists? if not, browser detour --------------------------------

Say "checking organization $OrgUrl …"
$orgReachable = $true
if (-not $DryRun) {
  $null = az devops project list --organization $OrgUrl --only-show-errors 2>$null
  if ($LASTEXITCODE -ne 0) { $orgReachable = $false }
}
if (-not $orgReachable) {
  Warn "can't reach $OrgUrl — either it doesn't exist or you're not a member."
  Write-Host @"

  ──────────────────────────────────────────────────────────────────
  ONE-TIME: create the Azure DevOps organization
  ──────────────────────────────────────────────────────────────────
  Microsoft only lets you create a new ADO organization through the
  browser. Steps:

    1. The browser will open in 3 seconds (or open it yourself):
       https://aka.ms/AzureDevOpsAccountCreate
    2. Sign in with your Skin Tyee admin account
       (firstname.lastname@skintyee.ca).
    3. When prompted for the organization name, enter:  $Org
       (the URL will be: $OrgUrl)
    4. Pick "Canada Central" as the region.
    5. After the org is created, re-run this script.

  Press ENTER when you've finished creating the org, or Ctrl-C to abort.
"@
  Start-Sleep 3
  Open-Url 'https://aka.ms/AzureDevOpsAccountCreate'
  $null = Read-Host
  $null = az devops project list --organization $OrgUrl --only-show-errors 2>$null
  if ($LASTEXITCODE -ne 0) {
    Die "still can't reach $OrgUrl after browser detour — aborting."
  }
}
Ok "org $OrgUrl is reachable"

# ----- 4) project — create if missing -----------------------------------------

Say "checking project '$Project'…"
$projectShow = az devops project show --project $Project --organization $OrgUrl --only-show-errors 2>$null
if ($LASTEXITCODE -eq 0 -and $projectShow) {
  Ok "project '$Project' already exists"
} else {
  Say "creating project '$Project'…"
  Invoke-Cmd az devops project create `
    --name $Project `
    --organization $OrgUrl `
    --description "Skin Tyee First Nation — webfront monorepo (website + app + api + lookup tool)" `
    --visibility private `
    --source-control git `
    --process Agile `
    --only-show-errors | Out-Null
  Ok "project '$Project' created"
}

# ----- 5) repo — create if missing --------------------------------------------

Say "checking repo '$Repo'…"
$repoId = ""
try {
  $repoId = az repos list --project $Project --organization $OrgUrl `
    --query "[?name=='$Repo'].id | [0]" -o tsv --only-show-errors 2>$null
} catch {}
if ($repoId -and $repoId -ne 'null') {
  Ok "repo '$Repo' already exists (id $repoId)"
} else {
  Say "creating repo '$Repo'…"
  if ($DryRun) {
    $repoId = "DRY-RUN-REPO-ID"
  } else {
    $repoId = az repos create `
      --name $Repo --project $Project --organization $OrgUrl `
      --query 'id' -o tsv --only-show-errors
  }
  Ok "repo '$Repo' created (id $repoId)"
}

$repoUrl = "$OrgUrl/$Project/_git/$Repo"

# ----- 6) push existing history from local clone -----------------------------

Say "configuring local 'azure' remote at $repoUrl …"
Set-Location (Join-Path $PSScriptRoot '..')

$currentRemote = ""
try { $currentRemote = git remote get-url azure 2>$null } catch {}
if ($currentRemote) {
  if ($currentRemote -ne $repoUrl) {
    Invoke-Cmd git remote set-url azure $repoUrl
    Ok "azure remote updated → $repoUrl"
  } else {
    Ok "azure remote already set"
  }
} else {
  Invoke-Cmd git remote add azure $repoUrl
  Ok "azure remote added"
}

if (-not $DryRun) {
  $remoteHeads = git ls-remote --heads azure 2>$null
  $remoteBranchCount = if ($remoteHeads) { ($remoteHeads -split "`n").Count } else { 0 }
  if ($remoteBranchCount -eq 0) {
    Say "pushing all branches + tags to azure (mirror)…"
    Invoke-Cmd git push azure --mirror
    Ok "history pushed"
  } else {
    Warn "remote already has $remoteBranchCount branch(es) — skipping --mirror to avoid clobbering."
    Say "pushing master only…"
    try { Invoke-Cmd git push azure master } catch { Warn "couldn't push master (resolve conflicts manually)" }
  }
} else {
  Write-Host "  (dry-run) would: git push azure --mirror (if remote empty) or git push azure master"
}

# ----- 7) branch policy on master --------------------------------------------

Say "setting branch policy on master (require PR, no force-push)…"

if (-not $repoId -or $repoId -eq "DRY-RUN-REPO-ID") {
  if (-not $DryRun) {
    $repoId = az repos show --repository $Repo --project $Project `
      --organization $OrgUrl --query id -o tsv --only-show-errors
  }
}

try {
  Invoke-Cmd az repos policy approver-count create `
    --repository-id $repoId `
    --branch master `
    --enabled true --blocking true `
    --minimum-approver-count 1 `
    --creator-vote-counts true `
    --allow-downvotes false --reset-on-source-push false `
    --organization $OrgUrl --project $Project `
    --only-show-errors | Out-Null
} catch {
  Ok "approver-count policy already exists (skipped)"
}
Ok "branch policy configured on master"

# ----- done ------------------------------------------------------------------

Write-Host @"

✔ Azure DevOps setup complete.

  Organization:  $OrgUrl
  Project:       $Project
  Repo:          $repoUrl
  Local remote:  azure

Next steps:
  - Wire the GitHub mirror push:    docs/devops/azure-primary-github-mirror.md
  - Port the SharePoint publisher:  docs/devops/migrate-ci-workflows.md

To push from now on:
  git push azure master            # canonical
  git push origin master           # GitHub (still works until you switch remotes)

To make azure the default origin:
  git remote rename origin github
  git remote rename azure origin
"@
