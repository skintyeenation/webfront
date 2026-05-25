#!/usr/bin/env bash
# Automate the four admin tasks needed to make
# `azure-pipelines/publish-docs-to-sharepoint.yml` run for the first time:
#
#   1. Add a federated credential to the `it-project-docs-publisher` Entra
#      app pointing at the ADO service connection we're about to create.
#   2. Create the ADO service connection `sharepoint-docs-sc` in the
#      `devops` project using workload identity federation.
#   3. Create the ADO Library variable group `sharepoint-docs` with the
#      non-secret SharePoint config.
#   4. Register the pipeline so ADO knows about the YAML in the repo.
#
# Idempotent: re-running is safe (existing federated credential, SC,
# variable group, and pipeline are detected and skipped).
#
# Companion docs:
#   docs/devops/migrate-ci-workflows.md  — the manual walkthrough this
#                                          script automates
#   scripts/setup-azure-devops.sh        — must have been run first
#   azure-pipelines/publish-docs-to-sharepoint.yml — the pipeline YAML
#
# Inputs — all have sensible defaults; only the things you'd actually
# want to customise are listed here. Run without args for a guided
# interactive prompt; pass --yes to skip prompts and use env/defaults.
#
#   --sharepoint-site-url URL of the target SharePoint site (e.g.
#                         https://skintyeenation.sharepoint.com/sites/it-project-docs).
#                         Script resolves the Graph site-id automatically.
#                         Default: skintyeenation/it-project-docs.
#   --sharepoint-site-id  Pre-computed Graph site-id triple
#                         (`{host},{site-guid},{web-guid}`). Wins over
#                         --sharepoint-site-url if both given.
#   --sharepoint-drive    Document library display name (default: Documents).
#   --entra-app-name      Display name of the Entra app (default:
#                         it-project-docs-publisher). Script looks it up
#                         by display name unless --entra-app-id is also
#                         passed.
#   --entra-app-id        Explicit GUID of the Entra app (skips display-
#                         name lookup).
#   --tenant-id           Entra tenant ID. Default: from `az account show`.
#   --org                 ADO org (default: skintyeenation).
#   --project             ADO project (default: devops).
#   --repo                ADO repo (default: webfront).
#   --sc-name             ADO service connection name
#                         (default: sharepoint-docs-sc).
#   --vargroup-name       Variable group name (default: sharepoint-docs).
#   --pipeline-name       Pipeline name (default: publish-docs-to-sharepoint).
#   --yaml-path           YAML path in the repo
#                         (default: azure-pipelines/publish-docs-to-sharepoint.yml).
#   --skip-site-grant     Don't attempt the per-site Sites.Selected
#                         grant via Graph. Use when your account
#                         lacks Sites.FullControl.All / SharePoint
#                         Admin / Global Admin and an admin will do
#                         the grant separately.
#   --yes / -y            Skip the interactive Enter-to-accept prompts.
#   --dry-run             Print every API call without executing.
#
# ─── WHAT'S AUTOMATED ─────────────────────────────────────────────────────────
# 1) Federated credential on the Entra app — `az ad app federated-credential
#    create`. Idempotent (checked first).
# 2) ADO service connection (workload identity federation) — `az rest` POST
#    to the ADO service-endpoint REST API (no direct `az devops` subcommand
#    for WIF as of the current az 2.86 / devops ext 1.x). Idempotent.
# 3) Variable group + variables — `az pipelines variable-group create`.
#    Idempotent.
# 4) Pipeline registration pointing at the YAML — `az pipelines create`.
#    Idempotent.
#
# ─── WHAT'S *NOT* AUTOMATED (must be done by a human first) ───────────────────
# All five are one-time per environment. The script detects each missing
# piece and exits with a clear error pointing at the doc.
#
# A. `az login` on the first run. The script prompts you to do it
#    interactively if you're not signed in. Not really un-automated —
#    just inherently interactive.
#
# B. Entra ID role on the running user. You need **Application
#    Administrator** (or Cloud Application Administrator) to add a
#    federated credential. If you don't have it, ask the M365 admin
#    (see docs/365/entra-id.md for who that is).
#
# C. ADO **Project Administrator** role on the `devops` project. You
#    need this to create service connections + pipelines + variable
#    groups. If you don't have it, ask whoever runs the org.
#
# D. The `it-project-docs-publisher` Entra app + its
#    Sites.Selected permission + the **site-level Sites.Selected
#    grant** via PnP PowerShell `Grant-PnPAzureADAppSitePermission`.
#    These are documented in `docs/365/sharepoint-docs-publish.md`
#    steps 2-5. The script verifies the app exists and surfaces the
#    doc reference if it doesn't.
#
#    PnP PowerShell can technically be wrapped in another script, but
#    it requires `pwsh` + the `PnP.PowerShell` module installed AND an
#    interactive sign-in to SharePoint — for a one-time per-site setup
#    that's worse UX than the four-line PowerShell snippet in the doc.
#
# E. **First-run pipeline authorization** in the ADO UI. The first
#    time the pipeline tries to use the service connection or variable
#    group, ADO may require a human in the UI to click "Permit"
#    (Pipelines → the new pipeline → Run → Review and approve). This
#    is an ADO UX safeguard, not an API gap. Subsequent runs are
#    fully automatic.

set -euo pipefail

# ----- defaults --------------------------------------------------------------

ENTRA_APP_DISPLAY_NAME="${ENTRA_APP_DISPLAY_NAME:-it-project-docs-publisher}"
ENTRA_APP_ID="${ENTRA_APP_ID:-}"
TENANT_ID="${TENANT_ID:-}"
SHAREPOINT_SITE_ID="${SHAREPOINT_SITE_ID:-}"
SHAREPOINT_SITE_URL="${SHAREPOINT_SITE_URL:-https://skintyeenation.sharepoint.com/sites/it-project-docs}"
SHAREPOINT_DRIVE="${SHAREPOINT_DRIVE:-Documents}"
ORG="${ORG:-skintyeenation}"
PROJECT="${PROJECT:-devops}"
REPO="${REPO:-webfront}"
SC_NAME="${SC_NAME:-sharepoint-docs-sc}"
VARGROUP_NAME="${VARGROUP_NAME:-sharepoint-docs}"
PIPELINE_NAME="${PIPELINE_NAME:-publish-docs-to-sharepoint}"
YAML_PATH="${YAML_PATH:-azure-pipelines/publish-docs-to-sharepoint.yml}"
DRY_RUN=0
SKIP_PROMPTS=0
SKIP_SITE_GRANT=0

# ----- arg parsing -----------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --entra-app-id)        ENTRA_APP_ID="$2"; shift 2 ;;
    --entra-app-name)      ENTRA_APP_DISPLAY_NAME="$2"; shift 2 ;;
    --tenant-id)           TENANT_ID="$2"; shift 2 ;;
    --sharepoint-site-id)  SHAREPOINT_SITE_ID="$2"; shift 2 ;;
    --sharepoint-site-url) SHAREPOINT_SITE_URL="$2"; shift 2 ;;
    --sharepoint-drive)    SHAREPOINT_DRIVE="$2"; shift 2 ;;
    --org)                 ORG="$2"; shift 2 ;;
    --project)             PROJECT="$2"; shift 2 ;;
    --repo)                REPO="$2"; shift 2 ;;
    --sc-name)             SC_NAME="$2"; shift 2 ;;
    --vargroup-name)       VARGROUP_NAME="$2"; shift 2 ;;
    --pipeline-name)       PIPELINE_NAME="$2"; shift 2 ;;
    --yaml-path)           YAML_PATH="$2"; shift 2 ;;
    --skip-site-grant)     SKIP_SITE_GRANT=1; shift ;;
    --dry-run)             DRY_RUN=1; shift ;;
    -y|--yes|--no-prompt)  SKIP_PROMPTS=1; shift ;;
    -h|--help)
      sed -n '/^# Automate/,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "✗ unknown argument: $1" >&2
      echo "  see --help" >&2
      exit 1 ;;
  esac
done

# ----- interactive prompts (TTY + not --yes) ---------------------------------
# Press Enter at each prompt to accept the default in brackets.

if [ "$SKIP_PROMPTS" = "0" ] && [ -t 0 ]; then
  echo "▸ confirming names (Enter to accept default in brackets):"
  printf "    SharePoint site URL  [%s]: " "$SHAREPOINT_SITE_URL"
  read -r ans < /dev/tty
  SHAREPOINT_SITE_URL="${ans:-$SHAREPOINT_SITE_URL}"
  printf "    Document library     [%s]: " "$SHAREPOINT_DRIVE"
  read -r ans < /dev/tty
  SHAREPOINT_DRIVE="${ans:-$SHAREPOINT_DRIVE}"
  printf "    Entra app name       [%s]: " "$ENTRA_APP_DISPLAY_NAME"
  read -r ans < /dev/tty
  ENTRA_APP_DISPLAY_NAME="${ans:-$ENTRA_APP_DISPLAY_NAME}"
  printf "    ADO org              [%s]: " "$ORG"
  read -r ans < /dev/tty
  ORG="${ans:-$ORG}"
  printf "    ADO project          [%s]: " "$PROJECT"
  read -r ans < /dev/tty
  PROJECT="${ans:-$PROJECT}"
  printf "    ADO repo             [%s]: " "$REPO"
  read -r ans < /dev/tty
  REPO="${ans:-$REPO}"
  echo
fi

ORG_URL="https://dev.azure.com/${ORG}"
SC_SUBJECT="sc://${ORG}/${PROJECT}/${SC_NAME}"
SC_ISSUER="https://vstoken.dev.azure.com"  # ADO's OIDC issuer

# ----- helpers ---------------------------------------------------------------

say() { printf '▸ %s\n' "$*"; }
ok()  { printf '  ✓ %s\n' "$*"; }
warn(){ printf '  ⚠ %s\n' "$*" >&2; }
die() { printf '  ✗ %s\n' "$*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) %s\n' "$*"
    return 0
  fi
  "$@"
}

# ----- 0) prereqs ------------------------------------------------------------

command -v az >/dev/null 2>&1 \
  || die "Azure CLI not installed. https://docs.microsoft.com/cli/azure/install-azure-cli"
az extension show --name azure-devops --only-show-errors >/dev/null 2>&1 \
  || run az extension add --name azure-devops --yes --only-show-errors
az devops configure --defaults "organization=$ORG_URL" "project=$PROJECT" 2>/dev/null

if ! az account show --only-show-errors >/dev/null 2>&1; then
  warn "not signed in to Azure — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

# Resolve tenant + app IDs if not provided ------------------------------------

if [ -z "$TENANT_ID" ]; then
  TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null || echo "")
fi
[ -n "$TENANT_ID" ] || die "couldn't determine tenant ID — pass --tenant-id"
say "tenant: ${TENANT_ID:0:8}…"

if [ -z "$ENTRA_APP_ID" ]; then
  say "looking up Entra app '$ENTRA_APP_DISPLAY_NAME' by display name…"
  ENTRA_APP_ID=$(az ad app list \
    --display-name "$ENTRA_APP_DISPLAY_NAME" \
    --query '[0].appId' -o tsv --only-show-errors 2>/dev/null || echo "")
  [ -n "$ENTRA_APP_ID" ] && [ "$ENTRA_APP_ID" != "null" ] \
    || die "Entra app '$ENTRA_APP_DISPLAY_NAME' not found. Create it per docs/365/sharepoint-docs-publish.md, or pass --entra-app-id."
fi
ok "Entra app id: $ENTRA_APP_ID"

# Resolve the Graph site-id from the site URL if --sharepoint-site-id
# wasn't passed explicitly. Cheaper UX — user gives the URL they see in
# the SharePoint web UI, script discovers the triple.

if [ -z "$SHAREPOINT_SITE_ID" ]; then
  [ -n "$SHAREPOINT_SITE_URL" ] \
    || die "neither --sharepoint-site-id nor --sharepoint-site-url given"
  say "resolving Graph site-id from $SHAREPOINT_SITE_URL …"
  # Parse https://{host}/sites/{name} → graph path skeleton
  SP_HOST=$(printf '%s' "$SHAREPOINT_SITE_URL" | sed -E 's|^https?://([^/]+).*|\1|')
  SP_PATH=$(printf '%s' "$SHAREPOINT_SITE_URL" | sed -E 's|^https?://[^/]+||')
  if [ "$DRY_RUN" -eq 1 ]; then
    SHAREPOINT_SITE_ID="${SP_HOST},DRY-RUN-SITE-GUID,DRY-RUN-WEB-GUID"
  else
    SHAREPOINT_SITE_ID=$(az rest --method GET \
      --uri "https://graph.microsoft.com/v1.0/sites/${SP_HOST}:${SP_PATH}" \
      --query id -o tsv 2>/dev/null || echo "")
    [ -n "$SHAREPOINT_SITE_ID" ] && [ "$SHAREPOINT_SITE_ID" != "null" ] \
      || die "Graph couldn't resolve site '$SHAREPOINT_SITE_URL' — confirm the URL is correct and you have read permission."
  fi
  ok "site-id: $SHAREPOINT_SITE_ID"
fi

# Resolve the Entra app's object ID (different from appId; needed for some calls).
ENTRA_APP_OBJ_ID=$(az ad app show --id "$ENTRA_APP_ID" --query id -o tsv --only-show-errors 2>/dev/null || echo "")
[ -n "$ENTRA_APP_OBJ_ID" ] || die "couldn't resolve object ID for app $ENTRA_APP_ID"

# ----- 0b) grant the app `Sites.Selected` access on the target site ----------
#
# Uses the CLI for Microsoft 365 (`m365`) — its Entra app IS on Microsoft's
# pre-authorized list for the required SharePoint Graph scopes. The Azure
# CLI is NOT (`az rest POST .../sites/{id}/permissions` 403s with
# AADSTS65002 — Microsoft's hard-coded first-party preauth gate). Don't
# try az here.

# The legacy PnP M365 CLI Entra app id — preserved by Microsoft as a
# well-known sign-in app for the m365 CLI ever since the m365 CLI dropped
# its built-in default in v11+. Setting this via env var means we don't
# trigger `m365 setup`'s interactive wizard.
M365_CLI_LEGACY_APP_ID="${M365_CLI_LEGACY_APP_ID:-31359c7f-bd7e-475c-86db-fdb8c937548e}"

if [ "$SKIP_SITE_GRANT" = "1" ]; then
  say "skipping site grant (--skip-site-grant set)"
else
  # Node version check — m365 CLI v11 needs Node 20.12+ (uses `styleText`
  # from `node:util`, added in 20.12). Earlier Nodes throw a cryptic
  # `SyntaxError: The requested module 'node:util' does not provide an
  # export named 'styleText'` from `m365 setup` etc. Catch upfront with
  # a clear message.
  if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node --version 2>/dev/null | sed 's/^v//')
    NODE_MAJOR="${NODE_VER%%.*}"
    NODE_MINOR=$(printf '%s' "$NODE_VER" | awk -F. '{print $2}')
    if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "${NODE_MINOR:-0}" -lt 12 ]; }; then
      cat >&2 <<MSG

  ✗ Node $NODE_VER is too old for m365 CLI v11 (requires Node 20.12+).

  Fastest fix (uses nvm — already present on this machine):

    nvm install 22       # current LTS — fine for everything
    nvm use 22
    npm install -g @pnp/cli-microsoft365   # re-install on the new Node
    bash scripts/setup-sharepoint-pipeline.sh

  Or stay on 20.x and just bump past 20.12:

    nvm install 20.18
    nvm use 20.18
    npm install -g @pnp/cli-microsoft365
    bash scripts/setup-sharepoint-pipeline.sh

MSG
      die "Node version $NODE_VER < 20.12 required by m365 CLI"
    fi
  fi

  # Auto-install m365 CLI if missing. Uses npm which we expect to be on
  # PATH given this is a pnpm workspace. Falls back with a clear error if
  # npm itself is missing.
  if ! command -v m365 >/dev/null 2>&1; then
    if ! command -v npm >/dev/null 2>&1; then
      die "npm not installed — install Node.js first, or run the site grant manually per docs/365/sharepoint-docs-publish.md."
    fi
    say "installing CLI for Microsoft 365 (@pnp/cli-microsoft365) globally via npm…"
    run npm install -g @pnp/cli-microsoft365 >/dev/null 2>&1 \
      || die "npm install of @pnp/cli-microsoft365 failed — try \`npm install -g @pnp/cli-microsoft365\` directly for the full error."
  fi
  # m365 itself can throw the styleText error on `m365 version`. Catch it.
  if ! M365_VER_OUTPUT=$(m365 version 2>&1); then
    if echo "$M365_VER_OUTPUT" | grep -q 'styleText'; then
      die "m365 CLI was installed under an older Node and inherited a binary that needs Node 20.12+. After upgrading Node (see message above), re-run \`npm install -g @pnp/cli-microsoft365\` to rebuild for the new Node version."
    fi
    die "m365 CLI failed to start: $M365_VER_OUTPUT"
  fi
  ok "m365 CLI ready ($M365_VER_OUTPUT)"

  # m365 CLI v11+ requires a sign-in app to be configured first via
  # `m365 setup` (one-time per machine, writes to ~/.config/configstore/
  # cli-m365-config.json). The exact env-var-name-that-overrides-this
  # has changed across v11/v12 (AAD→Entra rename), so we don't try to
  # set it via env — we just detect the "appId is required" error and
  # instruct the user to run `m365 setup` with the well-known PnP app id.
  # See docs/365/sharepoint-docs-publish.md § 5b for the full walkthrough.

  # `m365 status` always exits 0 (prints "Logged out" when not signed in),
  # so we can't rely on its exit code. Check the JSON `connectedAs` field
  # explicitly — it's the signed-in account's email when logged in, "Logged
  # out" / null / absent when not.
  m365_signed_in() {
    local who
    who=$(m365 status --output json 2>/dev/null \
      | jq -r '.connectedAs // empty' 2>/dev/null || echo "")
    [ -n "$who" ] && [ "$who" != "Logged out" ]
  }

  # Detect the "appId is required" state by attempting `m365 status` and
  # looking at the error. Failing fast here is much better UX than letting
  # `m365 login` blow up later with the same error.
  M365_STATUS_OUT=$(m365 status 2>&1 || true)
  if echo "$M365_STATUS_OUT" | grep -q 'appId is required'; then
    cat >&2 <<MSG

  ✗ m365 CLI has no sign-in app configured yet (one-time per machine).

  This is a one-time setup. m365 CLI v11+ has no default Entra app —
  you have to register one in your tenant first and tell m365 which it
  is. See docs/365/sharepoint-docs-publish.md § 5 for the 4-click app
  registration (then § 6 for the m365 setup wizard answers).

  TL;DR:
    1. Entra → App registrations → + New registration
         Name:               skintyeenation-admin-cli
         Account types:      single tenant
         Redirect URI:       Public client/native → http://localhost
       Copy the Application (client) ID.
    2. API permissions → Microsoft Graph → Delegated:
         Sites.FullControl.All, User.Read
       Click "Grant admin consent".
    3. Authentication → Advanced → Allow public client flows → Yes.
    4. Run: m365 setup
       At Client ID prompt, paste the app id from step 1.
       Leave Client secret EMPTY, choose Interactively.
    5. Re-run this script.

MSG
    die "m365 needs \`m365 setup\` (see message above)"
  fi

  # Find the m365-configured sign-in app id. This is the app m365 uses
  # to sign you in (delegated/browser), distinct from $ENTRA_APP_ID
  # (which is the publisher / app-only auth target). We need to patch
  # its redirect URI before `m365 login` can succeed — without one,
  # Entra fails the browser auth with AADSTS500113. The user might have
  # registered the app but forgotten the redirect URI; or registered it
  # with "Web" instead of "Mobile/desktop"; either way, this fixes it
  # idempotently.
  #
  # Config key name has varied across m365 versions (clientId, appId,
  # entraAppId), so we try each.
  SIGNIN_APP_ID=""
  for KEY in clientId entraAppId appId; do
    VAL=$(m365 cli config get --key "$KEY" 2>/dev/null \
      | sed 's/^"//; s/"$//' | tr -d '\n' || echo "")
    if echo "$VAL" | grep -qE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-'; then
      SIGNIN_APP_ID="$VAL"
      break
    fi
  done

  if [ -n "$SIGNIN_APP_ID" ]; then
    say "patching sign-in app $SIGNIN_APP_ID with http://localhost redirect URI + public client flow (idempotent)…"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  (dry-run) az ad app update --id %s --public-client-redirect-uris http://localhost --is-fallback-public-client true\n' "$SIGNIN_APP_ID"
      ok "(dry-run) sign-in app patch would be applied"
    else
      UPDATE_OUT=$(az ad app update --id "$SIGNIN_APP_ID" \
        --public-client-redirect-uris http://localhost \
        --is-fallback-public-client true 2>&1 || echo "__ERR__")
      if [ "$UPDATE_OUT" = "__ERR__" ] || echo "$UPDATE_OUT" | grep -qiE 'forbidden|insufficient|does not exist|not found|error'; then
        warn "couldn't patch sign-in app $SIGNIN_APP_ID — proceeding anyway, m365 login may fail with AADSTS500113."
        warn "  output: $UPDATE_OUT"
        warn "  manual fix: Entra → App registrations → that app → Authentication → + Add a platform → Mobile and desktop applications → check http://localhost → Configure. Also: Advanced settings → Allow public client flows → Yes → Save."
      else
        ok "sign-in app redirect URI + public client flow configured"
      fi
    fi
  else
    warn "couldn't determine m365 sign-in app id from cli config — if m365 login fails with AADSTS500113, see troubleshooting in docs/365/sharepoint-docs-publish.md."
  fi

  if ! m365_signed_in; then
    say "not signed in to m365 — running \`m365 login --authType browser\` (browser will open)…"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  (dry-run) m365 login --authType browser\n'
    else
      LOGIN_OUT=$(m365 login --authType browser 2>&1) || {
        if echo "$LOGIN_OUT" | grep -q 'appId is required'; then
          die "m365 login can't proceed: no sign-in app configured. Run \`m365 setup\` (see docs/365/sharepoint-docs-publish.md § 6), then re-run this script."
        fi
        if echo "$LOGIN_OUT" | grep -q 'AADSTS500113'; then
          die "m365 login failed with AADSTS500113 (no redirect URI). The sign-in app $SIGNIN_APP_ID needs http://localhost added under Authentication → Mobile and desktop applications. Script tried to patch it but it didn't take — see warnings above."
        fi
        if echo "$LOGIN_OUT" | grep -q 'AADSTS700016'; then
          die "m365 login failed with AADSTS700016 (app not found in tenant). The app id m365 is configured with ($SIGNIN_APP_ID) doesn't exist in your tenant. Recheck what you pasted at \`m365 setup\` — it must be the Application (client) ID from the Entra app's Overview page, in your tenant."
        fi
        die "m365 login didn't complete: $LOGIN_OUT — try \`m365 login --authType deviceCode\` if the browser flow won't work, then re-run this script."
      }
      m365_signed_in \
        || die "m365 says it's still not signed in after login. Run \`m365 status --output json\` to diagnose, then re-run this script."
    fi
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    ok "m365 signed in as $(m365 status --output json 2>/dev/null | jq -r '.connectedAs // "unknown"' 2>/dev/null || echo 'unknown')"
  else
    ok "(dry-run) skipping m365 sign-in check"
  fi

  # Check existing site grant. The apppermission-list call returns either
  # a JSON array on success OR something else on failure (network / perms);
  # we use `|| echo "[]"` to keep `set -e` from killing the script silently
  # if the call errors. If the call returned actual data, jq picks the
  # matching app's permission id out of it.
  say "checking site grant on '$SHAREPOINT_SITE_URL' for app id $ENTRA_APP_ID …"
  EXISTING_GRANT=""
  if [ "$DRY_RUN" -eq 0 ]; then
    PERM_LIST_JSON=$(m365 spo site apppermission list \
      --siteUrl "$SHAREPOINT_SITE_URL" --output json 2>&1 || echo "__ERR__")
    if [ "$PERM_LIST_JSON" = "__ERR__" ] || [ -z "$PERM_LIST_JSON" ]; then
      warn "m365 spo site apppermission list returned empty — assuming no existing grant."
      EXISTING_GRANT=""
    elif echo "$PERM_LIST_JSON" | jq -e . >/dev/null 2>&1; then
      EXISTING_GRANT=$(echo "$PERM_LIST_JSON" | jq -r --arg appid "$ENTRA_APP_ID" \
        '.[] | select(.grantedToIdentitiesV2[]?.application.id == $appid) | .id' \
        2>/dev/null | head -1)
    else
      warn "m365 spo site apppermission list didn't return valid JSON — assuming no existing grant. Output was:"
      printf '%s\n' "$PERM_LIST_JSON" | head -5 >&2
      EXISTING_GRANT=""
    fi
  fi
  if [ -n "$EXISTING_GRANT" ] && [ "$EXISTING_GRANT" != "null" ]; then
    ok "site grant already exists (permission id $EXISTING_GRANT)"
  else
    say "granting 'write' on the site to '$ENTRA_APP_DISPLAY_NAME'…"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  (dry-run) m365 spo site apppermission add --siteUrl %s --appId %s --appDisplayName %s --permission write\n' \
        "$SHAREPOINT_SITE_URL" "$ENTRA_APP_ID" "$ENTRA_APP_DISPLAY_NAME"
      ok "(dry-run) site grant would be created"
    else
      GRANT_RESULT=$(m365 spo site apppermission add \
        --siteUrl "$SHAREPOINT_SITE_URL" \
        --appId "$ENTRA_APP_ID" \
        --appDisplayName "$ENTRA_APP_DISPLAY_NAME" \
        --permission write \
        --output json 2>&1) || GRANT_RESULT="__ERR__:$GRANT_RESULT"
      if [[ "$GRANT_RESULT" == __ERR__:* ]]; then
        die "m365 spo site apppermission add failed: ${GRANT_RESULT#__ERR__:}"
      fi
      ok "site grant created via m365"
    fi
  fi
fi

# ----- 1) federated credential on the Entra app ------------------------------

say "checking federated credential on Entra app for subject '$SC_SUBJECT'…"
EXISTING_FED_CRED=$(az ad app federated-credential list \
  --id "$ENTRA_APP_ID" \
  --query "[?subject=='$SC_SUBJECT'].id | [0]" -o tsv --only-show-errors 2>/dev/null || echo "")
if [ -n "$EXISTING_FED_CRED" ] && [ "$EXISTING_FED_CRED" != "null" ]; then
  ok "federated credential already exists (id $EXISTING_FED_CRED)"
else
  say "creating federated credential…"
  FED_CRED_JSON=$(cat <<EOF
{
  "name": "ado-${ORG}-${PROJECT}-${SC_NAME}",
  "issuer": "$SC_ISSUER",
  "subject": "$SC_SUBJECT",
  "description": "ADO service connection $SC_NAME for the SharePoint docs publisher pipeline",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) az ad app federated-credential create --id %s --parameters <json>\n' "$ENTRA_APP_ID"
  else
    echo "$FED_CRED_JSON" | az ad app federated-credential create \
      --id "$ENTRA_APP_ID" \
      --parameters @/dev/stdin \
      --only-show-errors >/dev/null
  fi
  ok "federated credential created"
fi

# ----- 2) ADO service connection (workload identity federation) --------------

say "checking ADO service connection '$SC_NAME'…"
SC_ID=$(az devops service-endpoint list \
  --organization "$ORG_URL" --project "$PROJECT" \
  --query "[?name=='$SC_NAME'].id | [0]" -o tsv --only-show-errors 2>/dev/null || echo "")
if [ -n "$SC_ID" ] && [ "$SC_ID" != "null" ]; then
  ok "service connection '$SC_NAME' already exists (id $SC_ID)"
else
  say "creating service connection '$SC_NAME' (workload identity federation, manual subject)…"
  # We pre-declared the subject as $SC_SUBJECT, and the federated credential
  # on the Entra app trusts that subject (step 1 above). Now we tell ADO
  # which Entra app + subject to use.
  #
  # `az devops` doesn't have a direct subcommand for WIF service
  # connections, so we POST to the REST API. The body shape is documented at
  # https://learn.microsoft.com/en-us/rest/api/azure/devops/serviceendpoint/endpoints/create
  SC_BODY=$(cat <<EOF
{
  "name": "$SC_NAME",
  "type": "azurerm",
  "url": "https://management.azure.com/",
  "authorization": {
    "scheme": "WorkloadIdentityFederation",
    "parameters": {
      "tenantid": "$TENANT_ID",
      "serviceprincipalid": "$ENTRA_APP_ID"
    }
  },
  "data": {
    "subscriptionId": "$(az account show --query id -o tsv)",
    "subscriptionName": "$(az account show --query name -o tsv)",
    "environment": "AzureCloud",
    "scopeLevel": "Subscription",
    "creationMode": "Manual"
  },
  "isShared": false,
  "isReady": true,
  "serviceEndpointProjectReferences": [
    {
      "projectReference": {
        "id": "$(az devops project show --project "$PROJECT" --organization "$ORG_URL" --query id -o tsv)",
        "name": "$PROJECT"
      },
      "name": "$SC_NAME",
      "description": "SharePoint docs publisher — Sites.Selected scoped to $ENTRA_APP_DISPLAY_NAME via federated credentials"
    }
  ]
}
EOF
)
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) POST %s/_apis/serviceendpoint/endpoints?api-version=7.1-preview.4 with WIF body\n' "$ORG_URL"
    SC_ID="DRY-RUN-SC-ID"
  else
    SC_ID=$(echo "$SC_BODY" | az rest \
      --method POST \
      --uri "$ORG_URL/_apis/serviceendpoint/endpoints?api-version=7.1-preview.4" \
      --headers content-type=application/json \
      --body @/dev/stdin \
      --query id -o tsv 2>/dev/null)
    [ -n "$SC_ID" ] && [ "$SC_ID" != "null" ] \
      || die "service connection creation failed (check Entra app + subscription perms)"
  fi
  ok "service connection '$SC_NAME' created (id $SC_ID)"
fi

# ----- 3) Library variable group ---------------------------------------------

say "checking variable group '$VARGROUP_NAME'…"
VG_ID=$(az pipelines variable-group list \
  --organization "$ORG_URL" --project "$PROJECT" \
  --query "[?name=='$VARGROUP_NAME'].id | [0]" -o tsv --only-show-errors 2>/dev/null || echo "")
if [ -n "$VG_ID" ] && [ "$VG_ID" != "null" ]; then
  ok "variable group '$VARGROUP_NAME' already exists (id $VG_ID)"
else
  say "creating variable group '$VARGROUP_NAME'…"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) az pipelines variable-group create --name %s --variables AZURE_TENANT_ID=… AZURE_CLIENT_ID=… SHAREPOINT_SITE_ID=… SHAREPOINT_DRIVE_NAME=%s\n' "$VARGROUP_NAME" "$SHAREPOINT_DRIVE"
    VG_ID="DRY-RUN-VG-ID"
  else
    VG_ID=$(az pipelines variable-group create \
      --organization "$ORG_URL" --project "$PROJECT" \
      --name "$VARGROUP_NAME" \
      --description "SharePoint docs publisher config (no secrets — workload identity federation)" \
      --authorize true \
      --variables \
        "AZURE_TENANT_ID=$TENANT_ID" \
        "AZURE_CLIENT_ID=$ENTRA_APP_ID" \
        "SHAREPOINT_SITE_ID=$SHAREPOINT_SITE_ID" \
        "SHAREPOINT_DRIVE_NAME=$SHAREPOINT_DRIVE" \
      --query id -o tsv --only-show-errors)
  fi
  ok "variable group '$VARGROUP_NAME' created (id $VG_ID)"
fi

# ----- 4) register the pipeline ----------------------------------------------

say "checking pipeline '$PIPELINE_NAME'…"
PIPELINE_ID=$(az pipelines list \
  --organization "$ORG_URL" --project "$PROJECT" \
  --query "[?name=='$PIPELINE_NAME'].id | [0]" -o tsv --only-show-errors 2>/dev/null || echo "")
if [ -n "$PIPELINE_ID" ] && [ "$PIPELINE_ID" != "null" ]; then
  ok "pipeline '$PIPELINE_NAME' already exists (id $PIPELINE_ID)"
else
  say "creating pipeline '$PIPELINE_NAME' pointing at ${YAML_PATH}…"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) az pipelines create --name %s --repository %s --branch master --yaml-path %s\n' "$PIPELINE_NAME" "$REPO" "$YAML_PATH"
    PIPELINE_ID="DRY-RUN-PIPELINE-ID"
  else
    PIPELINE_ID=$(az pipelines create \
      --organization "$ORG_URL" --project "$PROJECT" \
      --name "$PIPELINE_NAME" \
      --description "Publish docs/ to SharePoint via Microsoft Graph (federated credentials)" \
      --repository "$REPO" \
      --repository-type tfsgit \
      --branch master \
      --yaml-path "$YAML_PATH" \
      --skip-first-run true \
      --query id -o tsv --only-show-errors)
  fi
  ok "pipeline '$PIPELINE_NAME' created (id $PIPELINE_ID)"
fi

# ----- done ------------------------------------------------------------------

cat <<EOF

✔ SharePoint publisher pipeline wired up.

  Entra app:              $ENTRA_APP_DISPLAY_NAME ($ENTRA_APP_ID)
  Federated credential:   $SC_SUBJECT
  Service connection:     $SC_NAME (id $SC_ID)
  Variable group:         $VARGROUP_NAME (id $VG_ID)
  Pipeline:               $PIPELINE_NAME (id $PIPELINE_ID)

Test it:
  1) Edit any file under docs/ and push to master.
  2) Watch the run at:
     $ORG_URL/$PROJECT/_build?definitionId=$PIPELINE_ID
  3) Once it's green for ~30 days, retire the legacy GitHub Actions
     workflow per docs/devops/migrate-ci-workflows.md § 6-7.
EOF
