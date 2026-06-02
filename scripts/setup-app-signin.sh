#!/bin/bash
# Provision the Entra app `skintyee-app-signin` — the application the
# community app uses to sign users in via Microsoft (Entra ID).
#
# Distinct from `skintyee-app-graph` (which is app-only, server-side,
# read-only across the tenant). This one is:
#   • Public client (no client secret — PKCE flow from the SPA/native app)
#   • Delegated auth (signed-in user's identity)
#   • Single tenant (skintyeenation only)
#   • Redirect URIs cover web (https://app.skintyee.ca), native deep
#     link (ca.skintyee.app://auth), and Expo Go (exp://… via the
#     Expo proxy for dev testing)
#   • User.Read (delegated) — basic profile (name, email, UPN) is all
#     we need to derive the in-app role from the user's identity
#
# No admin consent required — User.Read is a default-consentable scope
# (users consent for themselves on first sign-in).
#
# Per ADR-14 + docs/features/planner-dashboard.md § Phase 2 trigger.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/setup-app-signin.sh              # interactive
#   bash scripts/setup-app-signin.sh --dry-run    # preview the az calls

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults -------------------------------------------------------------
APP_DISPLAY="${APP_DISPLAY:-skintyee-app-signin}"
APP_PACKAGE="${APP_PACKAGE:-ca.skintyee.app}"
WEB_URL="${WEB_URL:-https://app.skintyee.ca}"
ADO_ORG="${ADO_ORG:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VARGROUP="${ADO_VARGROUP:-skintyee-prod-azure}"

# Microsoft Graph
GRAPH_RESOURCE_ID="00000003-0000-0000-c000-000000000000"
# User.Read delegated permission ID — well-known
USER_READ_DELEGATED="e1fe6dd8-ba31-4d61-89e7-88639da4683d"

DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown flag: $1 (use --help)" ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) %s\n' "$*"
  else
    "$@"
  fi
}

# ----- prereqs --------------------------------------------------------------
command -v az >/dev/null || die "az CLI not found"
command -v jq >/dev/null || die "jq not found (brew install jq)"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null)
say "tenant: $TENANT_ID"

# ----- 1) Create / find the Entra app ---------------------------------------
say "ensuring Entra app '$APP_DISPLAY' exists…"
APP_ID=$(az ad app list --display-name "$APP_DISPLAY" --query '[0].appId' -o tsv 2>/dev/null || echo "")
if [ -z "$APP_ID" ]; then
  if [ "$DRY_RUN" -eq 0 ]; then
    APP_ID=$(az ad app create \
      --display-name "$APP_DISPLAY" \
      --sign-in-audience AzureADMyOrg \
      --query appId -o tsv 2>/dev/null)
    [ -n "$APP_ID" ] || die "couldn't create the app"
    ok "Entra app created — appId=$APP_ID"
  else
    APP_ID="00000000-0000-0000-0000-DRYRUN0000ID"
    printf '  (dry-run) az ad app create --display-name %s\n' "$APP_DISPLAY"
  fi
else
  ok "$APP_DISPLAY already exists — appId=$APP_ID"
fi

# Create SP (idempotent)
if [ "$DRY_RUN" -eq 0 ]; then
  az ad sp show --id "$APP_ID" >/dev/null 2>&1 \
    || az ad sp create --id "$APP_ID" --only-show-errors >/dev/null 2>&1 \
    || warn "couldn't create SP (may already exist)"
fi

# ----- 2) Configure as public client + add redirect URIs --------------------
say "configuring SPA + native redirect URIs…"

# Web (SPA): for an Expo web build hosted at https://app.skintyee.ca,
#   the redirect URI is the page itself OR a sub-path. We use the
#   root URL plus an /auth route to match Expo Router's convention.
#
# Native: Expo's AuthSession.makeRedirectUri({ scheme: 'ca.skintyee.app' })
#   returns 'ca.skintyee.app://' on iOS/Android dev builds and
#   'msauth.ca.skintyee.app://auth' if MSAL-style is required. Register
#   both so either form works.
#
# Expo Go: dev testing uses 'exp://localhost:19000' or similar; we add
#   that too so testing in the simulator works without an EAS build.

if [ "$DRY_RUN" -eq 0 ]; then
  BODY=$(cat <<EOF
{
  "spa": {
    "redirectUris": [
      "${WEB_URL}",
      "${WEB_URL}/auth",
      "http://localhost:19006",
      "http://localhost:8081"
    ]
  },
  "publicClient": {
    "redirectUris": [
      "${APP_PACKAGE}://auth",
      "${APP_PACKAGE}://",
      "msauth.${APP_PACKAGE}://auth",
      "exp://localhost:19000",
      "exp://127.0.0.1:19000"
    ]
  },
  "web": {
    "implicitGrantSettings": {
      "enableAccessTokenIssuance": false,
      "enableIdTokenIssuance": false
    }
  }
}
EOF
)
  az rest --method PATCH \
    --uri "https://graph.microsoft.com/v1.0/applications(appId='${APP_ID}')" \
    --body "$BODY" --headers 'Content-Type=application/json' \
    --only-show-errors 2>&1 | head -3 || warn "couldn't patch redirect URIs"
  ok "SPA + public-client redirect URIs registered"
fi

# ----- 3) Add User.Read (delegated) permission ------------------------------
say "adding Microsoft Graph User.Read (delegated)…"
run az ad app permission add \
  --id "$APP_ID" \
  --api "$GRAPH_RESOURCE_ID" \
  --api-permissions "${USER_READ_DELEGATED}=Scope" \
  --only-show-errors 2>/dev/null

# User.Read is default-consentable — users consent for themselves on
# first sign-in. No admin consent needed. (If we add Group.Read or
# similar later, we'd need to grant admin consent.)
ok "User.Read added (default-consentable; users consent on first sign-in)"

# ----- 4) Update ADO variable group with non-secret fields ------------------
if [ "$DRY_RUN" -eq 0 ]; then
  say "updating ADO variable group '$ADO_VARGROUP' with the public-client appId…"
  VG_ID=$(az pipelines variable-group list \
    --org "$ADO_ORG" --project "$ADO_PROJECT" \
    --query "[?name=='$ADO_VARGROUP'].id | [0]" -o tsv 2>/dev/null)
  if [ -n "$VG_ID" ]; then
    for KV in "SIGNIN_APP_ID=$APP_ID" "SIGNIN_TENANT_ID=$TENANT_ID"; do
      KEY="${KV%%=*}"
      VAL="${KV#*=}"
      EXISTS=$(az pipelines variable-group variable list \
        --org "$ADO_ORG" --project "$ADO_PROJECT" --group-id "$VG_ID" \
        --query "$KEY" -o tsv 2>/dev/null || echo "")
      if [ -n "$EXISTS" ]; then
        az pipelines variable-group variable update \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$KEY" --value "$VAL" \
          --only-show-errors >/dev/null 2>&1 && ok "$KEY updated"
      else
        az pipelines variable-group variable create \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$KEY" --value "$VAL" \
          --only-show-errors >/dev/null 2>&1 && ok "$KEY added"
      fi
    done
  else
    warn "variable group '$ADO_VARGROUP' not found — skipping"
  fi
fi

# ----- 5) Output ------------------------------------------------------------
printf '\n%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"
printf '%s   skintyee-app-signin provisioned   %s\n' "$YLW" "$RST"
printf '%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"

cat <<EOF

Public values (NOT secrets — safe to bake into the client bundle):
  tenantId:       ${TENANT_ID}
  appId:          ${APP_ID:-DRY-RUN}
  authority:      https://login.microsoftonline.com/${TENANT_ID}/v2.0
  scopes:         openid profile email User.Read

Redirect URIs registered (for app.config.js + expo-auth-session):
  SPA (web):
    ${WEB_URL}
    ${WEB_URL}/auth
    http://localhost:19006   (Expo web dev)
    http://localhost:8081    (Metro web dev)
  Public client (native + Expo Go):
    ${APP_PACKAGE}://auth
    ${APP_PACKAGE}://
    msauth.${APP_PACKAGE}://auth
    exp://localhost:19000
    exp://127.0.0.1:19000

Next steps:
  1) Add to app/app.config.js → extra.signinAppId = process.env.EXPO_PUBLIC_SIGNIN_APP_ID
     so the app gets the appId at build time. Set EXPO_PUBLIC_SIGNIN_APP_ID
     in the deploy-app-web pipeline (already in the variable group).
  2) Wire the Microsoft sign-in flow via expo-auth-session — see
     app/src/store/modules/auth.ts for the refactor.
  3) Test sign-in at https://app.skintyee.ca after the next deploy.

No secrets to save to 1Password — public clients use PKCE, no
client_secret. The appId is public information (it's in the browser
URL during sign-in anyway).

See:
  docs/features/planner-dashboard.md       — ADR-14 (the design)
  docs/devops/app-signin-runbook.md        — operational runbook (to be written)
  app/src/store/modules/auth.ts            — client-side sign-in flow
EOF
