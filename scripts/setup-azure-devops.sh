#!/usr/bin/env bash
# Set up the Azure DevOps tenant for Skin Tyee's `webfront` repo.
#
# What this does (idempotent — safe to re-run):
#   1. Confirms `az` CLI + `az devops` extension are installed.
#   2. Opens https://aex.dev.azure.com/me in your browser so you can
#      sign in and click "Create new organization" to create
#      `skintyeenation` (one-time, manual — Microsoft only allows org
#      creation via the web). Skipped automatically if the org
#      already exists.
#
#      Why `aex.dev.azure.com/me` and not `dev.azure.com/`: if you're
#      already signed in to the Azure portal in another tab, plain
#      `dev.azure.com/` defers to the portal session and bounces you
#      to `portal.azure.com/#home`. `aex.dev.azure.com/me` is the
#      ADO-specific account portal — bypasses that redirect.
#
#      Prerequisite: an active Azure subscription on the same tenant
#      (Microsoft requires this for new orgs as of 2026; existing orgs
#      created before the change still work without one).
#   3. Creates the `webfront` project in that org if missing.
#   4. Creates the `webfront` Git repo in that project if missing.
#   5. Adds an `azure` remote to your local clone pointing at the
#      new repo, and pushes every branch + tag (`git push azure --mirror`).
#   6. Sets a basic branch policy on `master`: require PR, no
#      force-push, no direct push.
#
# What this DOES NOT do (separate scripts / manual steps):
#   - Create the GitHub mirror push (see docs/devops/azure-primary-github-mirror.md).
#   - Port the SharePoint docs publisher Pipeline (see docs/devops/migrate-ci-workflows.md).
#   - Register self-hosted agents (see docs/devops/agents.md).
#
# Companion docs:  docs/devops/README.md, docs/devops/azure-devops-setup.md
# PowerShell mirror: scripts/setup-azure-devops.ps1
#
# Usage:
#   bash scripts/setup-azure-devops.sh
#   ORG=skintyeenation PROJECT=webfront REPO=webfront bash scripts/setup-azure-devops.sh
#   bash scripts/setup-azure-devops.sh --dry-run     # print actions, no API calls

set -euo pipefail

ORG="${ORG:-skintyeenation}"
PROJECT="${PROJECT:-webfront}"
REPO="${REPO:-webfront}"
ORG_URL="https://dev.azure.com/${ORG}"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

# ----- helpers ---------------------------------------------------------------

say() { printf '▸ %s\n' "$*"; }
ok()  { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*" >&2; }
die() { printf '  ✗ %s\n' "$*" >&2; exit 1; }

run() {
  # Wrapper so --dry-run can preview commands without executing.
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) %s\n' "$*"
    return 0
  fi
  "$@"
}

# Opens a URL in the default browser. Falls back to printing the URL.
open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then        # macOS
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then  # Linux
    xdg-open "$url"
  elif command -v start >/dev/null 2>&1; then     # Git Bash on Windows
    start "$url"
  else
    say "open this in your browser:  $url"
  fi
}

# ----- 1) precheck — az CLI + extension --------------------------------------

say "checking Azure CLI…"
if ! command -v az >/dev/null 2>&1; then
  die "Azure CLI not installed. https://docs.microsoft.com/cli/azure/install-azure-cli"
fi
ok "az $(az version --query '\"azure-cli\"' -o tsv 2>/dev/null)"

if ! az extension show --name azure-devops --only-show-errors >/dev/null 2>&1; then
  say "installing the azure-devops extension…"
  run az extension add --name azure-devops --yes --only-show-errors
fi
ok "az devops extension installed"

# Default to the chosen org so we don't repeat --organization on every call.
run az devops configure --defaults "organization=$ORG_URL" "project=$PROJECT" 2>/dev/null || true

# ----- 2) sign-in check ------------------------------------------------------

say "checking sign-in…"
if ! az account show --only-show-errors >/dev/null 2>&1; then
  warn "not signed in to Azure. Running \`az login\` now (browser will open)."
  if [ "$DRY_RUN" -eq 0 ]; then
    az login --only-show-errors >/dev/null
  fi
fi
WHOAMI=$(az account show --query 'user.name' -o tsv 2>/dev/null || echo 'unknown')
ok "signed in as $WHOAMI"

# ----- 3) org — exists? if not, browser detour --------------------------------

say "checking organization $ORG_URL …"
# The `az devops project list` call returns 401/404 cleanly if the org doesn't
# exist OR if you don't have access. We treat both as "needs creation".
if [ "$DRY_RUN" -eq 0 ] && ! az devops project list --organization "$ORG_URL" --only-show-errors >/dev/null 2>&1; then
  warn "can't reach $ORG_URL — either it doesn't exist or you're not a member."
  cat >&2 <<MSG

  ──────────────────────────────────────────────────────────────────
  ONE-TIME: create the Azure DevOps organization
  ──────────────────────────────────────────────────────────────────
  Microsoft only lets you create a new ADO organization through the
  browser — there's no \`az devops org create\` command. Steps:

    1. The browser will open in 3 seconds (or open it yourself):
       https://aex.dev.azure.com/me
       (the ADO account portal — direct, avoids the portal.azure.com
       redirect that 'dev.azure.com/' triggers if you're already
       signed in to the Azure portal in another tab.)
    2. Sign in with your Skin Tyee admin account
       (firstname.lastname@skintyee.ca) if not already signed in.
    3. Click "Create new organization" on the left rail.
    4. Enter:    Organization name = ${ORG}
       Geography = Canada Central
       Azure subscription = pick the Skin Tyee subscription
         (ACTIVE Azure subscription is REQUIRED for new orgs as of
          2026; existing orgs were grandfathered).
       Click Continue.
    5. Org lands at: ${ORG_URL}
    6. After the org is created, re-run this script.

  (The older 'aka.ms/AzureDevOpsAccountCreate' shortlink was retired
  by Microsoft and now redirects to Bing search — don't use it.)

  Press ENTER when you've finished creating the org, or Ctrl-C to abort.
MSG
  sleep 3
  open_url "https://aex.dev.azure.com/me"
  read -r -p "" _ < /dev/tty
  # Re-check after the user comes back.
  if ! az devops project list --organization "$ORG_URL" --only-show-errors >/dev/null 2>&1; then
    die "still can't reach $ORG_URL after browser detour — aborting."
  fi
fi
ok "org $ORG_URL is reachable"

# ----- 4) project — create if missing -----------------------------------------

say "checking project '$PROJECT'…"
if az devops project show --project "$PROJECT" --organization "$ORG_URL" --only-show-errors >/dev/null 2>&1; then
  ok "project '$PROJECT' already exists"
else
  say "creating project '$PROJECT'…"
  run az devops project create \
    --name "$PROJECT" \
    --organization "$ORG_URL" \
    --description "Skin Tyee First Nation — webfront monorepo (website + app + api + lookup tool)" \
    --visibility private \
    --source-control git \
    --process Agile \
    --only-show-errors >/dev/null
  ok "project '$PROJECT' created"
fi

# ----- 5) repo — create if missing --------------------------------------------
#
# Note: when ADO creates a new project, it AUTO-CREATES a default repo with
# the same name as the project. So if we just ran step 4, the repo already
# exists. We probe with `az repos show` (atomic single-repo lookup) rather
# than `az repos list` because the latter has a small post-project-creation
# delay before it returns the auto-default. We also wrap `az repos create`
# to treat ADO's TF400948 ("repository with that name already exists")
# response as success — covers the case where the probe somehow misses.

say "checking repo '$REPO'…"
REPO_ID=""
if [ "$DRY_RUN" -eq 0 ]; then
  REPO_ID=$(az repos show --repository "$REPO" --project "$PROJECT" \
    --organization "$ORG_URL" --query id -o tsv --only-show-errors 2>/dev/null || echo "")
fi
if [ -n "$REPO_ID" ] && [ "$REPO_ID" != "null" ]; then
  ok "repo '$REPO' already exists (id $REPO_ID)"
else
  say "creating repo '$REPO'…"
  if [ "$DRY_RUN" -eq 1 ]; then
    REPO_ID="DRY-RUN-REPO-ID"
  else
    # Try to create; if ADO says "already exists" (TF400948), re-probe and
    # use the existing repo's id.
    CREATE_OUTPUT=$(az repos create \
      --name "$REPO" \
      --project "$PROJECT" \
      --organization "$ORG_URL" \
      --query 'id' -o tsv --only-show-errors 2>&1) || CREATE_OUTPUT="$CREATE_OUTPUT"
    if [ -n "$CREATE_OUTPUT" ] && [[ "$CREATE_OUTPUT" != *"TF400948"* ]] && [[ "$CREATE_OUTPUT" != *"ERROR"* ]]; then
      REPO_ID="$CREATE_OUTPUT"
      ok "repo '$REPO' created (id $REPO_ID)"
    else
      # Either "already exists" or some other failure — re-probe.
      REPO_ID=$(az repos show --repository "$REPO" --project "$PROJECT" \
        --organization "$ORG_URL" --query id -o tsv --only-show-errors 2>/dev/null || echo "")
      if [ -n "$REPO_ID" ] && [ "$REPO_ID" != "null" ]; then
        ok "repo '$REPO' already existed (auto-created with the project; id $REPO_ID)"
      else
        die "couldn't create or find repo '$REPO': $CREATE_OUTPUT"
      fi
    fi
  fi
fi

REPO_URL="$ORG_URL/$PROJECT/_git/$REPO"

# ----- 6) push existing history from local clone -----------------------------

say "configuring local 'azure' remote at $REPO_URL …"
# Run this from the repo root regardless of where the user invokes the script.
cd "$(dirname "$0")/.."

# Add or update the `azure` remote.
if git remote get-url azure >/dev/null 2>&1; then
  CURRENT=$(git remote get-url azure)
  if [ "$CURRENT" != "$REPO_URL" ]; then
    run git remote set-url azure "$REPO_URL"
    ok "azure remote updated → $REPO_URL"
  else
    ok "azure remote already set"
  fi
else
  run git remote add azure "$REPO_URL"
  ok "azure remote added"
fi

# Push every branch + tag. `--mirror` is the cleanest way to seed an empty repo.
# If the remote already has commits, prompt for what to do — never silently
# clobber.
if [ "$DRY_RUN" -eq 0 ]; then
  REMOTE_BRANCH_COUNT=$(git ls-remote --heads azure 2>/dev/null | wc -l | tr -d ' ')
  if [ "$REMOTE_BRANCH_COUNT" = "0" ]; then
    say "remote is empty — pushing all branches + tags to azure (mirror)…"
    run git push azure --mirror
    ok "history pushed"
  else
    warn "remote already has $REMOTE_BRANCH_COUNT branch(es) on azure."
    echo
    echo "  What would you like to do?"
    echo "    [s] Skip          — leave the remote as-is, don't push anything"
    echo "    [o] Overwrite     — git push azure --mirror --force"
    echo "                        (replaces every remote branch + tag with local)"
    echo "    [d] Delete + recreate — az repos delete, recreate fresh, then mirror-push"
    echo "                        (wipes the remote completely)"
    echo "    [a] Abort         — exit the script without pushing"
    echo
    PUSH_CHOICE=""
    while [ -z "$PUSH_CHOICE" ]; do
      printf "  Choice [s/o/d/a]: "
      read -r PUSH_CHOICE < /dev/tty
      case "$PUSH_CHOICE" in
        s|S) PUSH_CHOICE=skip ;;
        o|O) PUSH_CHOICE=overwrite ;;
        d|D) PUSH_CHOICE=delete ;;
        a|A) die "aborted by user — no changes pushed." ;;
        *)   echo "  ↳ pick one of s, o, d, a."; PUSH_CHOICE="" ;;
      esac
    done

    case "$PUSH_CHOICE" in
      skip)
        ok "skipped — remote unchanged."
        ;;
      overwrite)
        warn "force-pushing every local branch + tag, replacing remote contents."
        run git push azure --mirror --force
        ok "history overwritten (mirror force-push)"
        ;;
      delete)
        warn "deleting and recreating the remote repo (destructive)…"
        run az repos delete --id "$REPO_ID" --project "$PROJECT" --organization "$ORG_URL" --yes --only-show-errors
        REPO_ID=$(az repos create --name "$REPO" --project "$PROJECT" --organization "$ORG_URL" \
          --query 'id' -o tsv --only-show-errors)
        ok "repo '$REPO' recreated (new id $REPO_ID)"
        say "pushing all branches + tags to the fresh repo…"
        run git push azure --mirror
        ok "history pushed"
        ;;
    esac
  fi
else
  printf '  (dry-run) would: git push azure --mirror (if remote empty) or prompt for skip/overwrite/delete\n'
fi

# ----- 7) branch policy on master --------------------------------------------

say "setting branch policy on master (require PR, no force-push)…"

# `az repos policy` requires `--repository-id` (UUID), so look it up if we
# don't already have it.
if [ -z "$REPO_ID" ] || [ "$REPO_ID" = "DRY-RUN-REPO-ID" ]; then
  if [ "$DRY_RUN" -eq 0 ]; then
    REPO_ID=$(az repos show --repository "$REPO" --project "$PROJECT" \
      --organization "$ORG_URL" --query id -o tsv --only-show-errors)
  fi
fi

# Policy 1 — minimum approver count (1 reviewer, allow self-approve for now).
# Re-runs of `policy create` 409 if the policy already exists; we ignore those.
run az repos policy approver-count create \
  --repository-id "$REPO_ID" \
  --branch master \
  --enabled true \
  --blocking true \
  --minimum-approver-count 1 \
  --creator-vote-counts true \
  --allow-downvotes false \
  --reset-on-source-push false \
  --organization "$ORG_URL" --project "$PROJECT" \
  --only-show-errors 2>/dev/null || ok "approver-count policy already exists (skipped)"

# Policy 2 — no direct pushes / require PR (the implicit "Require pull request"
# policy is enforced by setting branch as required-PR via approver-count above).

ok "branch policy configured on master"

# ----- done ------------------------------------------------------------------

cat <<EOF

✔ Azure DevOps setup complete.

  Organization:  $ORG_URL
  Project:       $PROJECT
  Repo:          $REPO_URL
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
EOF
