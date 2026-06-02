#!/usr/bin/env bash
# setup-exo-function.sh — provision + deploy the Exchange Online Function
# ----------------------------------------------------------------------------
# Creates everything the EXO PowerShell function needs and deploys the code:
#
#   1. Azure Functions Core Tools (`func`) — installed via brew if missing
#   2. Resource Group:    skintyee-exo (Canada Central by default)
#   3. Storage Account:   skintyeexostorage (required by Functions runtime)
#   4. Key Vault:         skintyee-exo-kv
#   5. Cert in KV:        skintyee-exo-app (uploaded from api/.exo-cert/exo-app.pfx)
#   6. Function App:      skintyee-exo-fn (Linux Consumption, PowerShell 7.4)
#   7. Managed Identity:  Function MI → KV (Secrets User + Certificate User)
#   8. App settings:      KEY_VAULT_NAME, EXO_CERT_NAME, EXO_APP_ID, EXO_ORGANIZATION
#   9. Function deploy:   `func azure functionapp publish` from exo-function/
#  10. api/.env:           EXO_FUNCTION_URL + EXO_FUNCTION_KEY persisted
#
# Idempotent. Safe to re-run.
#
# Prereqs (script will warn if missing):
#   - scripts/setup-app-exo.sh has been run (cert exists at api/.exo-cert/)
#   - az login already done; sub selected
#   - brew available (only needed if func tools missing)
#
# Cost: <$1/mo at this load. Consumption plan is pay-per-execution.
# ----------------------------------------------------------------------------
set -euo pipefail

# --- Config (override via env vars) -----------------------------------------
RG_NAME="${RG_NAME:-skintyee-exo}"
LOCATION="${LOCATION:-canadacentral}"
STORAGE_NAME="${STORAGE_NAME:-skintyeexostorage}"
KV_NAME="${KV_NAME:-skintyee-exo-kv}"
CERT_NAME="${CERT_NAME:-skintyee-exo-app}"
FUNC_NAME="${FUNC_NAME:-skintyee-exo-fn}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/api"
EXO_FN_DIR="$REPO_ROOT/exo-function"
PFX_PATH="$API_DIR/.exo-cert/exo-app.pfx"

DRY_RUN=0
SKIP_DEPLOY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     DRY_RUN=1; shift ;;
    --skip-deploy) SKIP_DEPLOY=1; shift ;;
    --help|-h)
      sed -n '2,/^# ----/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown flag: $1 (use --help)" >&2; exit 1 ;;
  esac
done

say()  { printf "\033[36m▸\033[0m %s\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
die()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }
run()  { if [ $DRY_RUN -eq 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }

# --- Preflight --------------------------------------------------------------
command -v az >/dev/null   || die "az CLI not installed"
command -v jq >/dev/null   || die "jq not installed"
[ -f "$PFX_PATH" ]         || die "cert not found at $PFX_PATH — run scripts/setup-app-exo.sh first"
[ -d "$EXO_FN_DIR" ]       || die "exo-function/ directory not found at $EXO_FN_DIR"

# Func Core Tools — install if missing
if ! command -v func >/dev/null; then
  say "Azure Functions Core Tools missing — installing via brew…"
  command -v brew >/dev/null || die "brew not installed; install func manually: https://aka.ms/funccoretools"
  run brew tap azure/functions
  run brew install azure-functions-core-tools@4
fi
ok "func tools: $(func --version 2>/dev/null || echo '?')"

TENANT_ID=$(az account show --query 'tenantId' -o tsv)
SUB_ID=$(az account show --query 'id' -o tsv)
say "tenant:       $TENANT_ID"
say "subscription: $SUB_ID"

# Source api/.env to get EXO_APP_ID + EXO_ORGANIZATION + EXO_CERT_PASSWORD
[ -f "$API_DIR/.env" ] || die "api/.env not found — run scripts/setup-app-exo.sh first"
set -a; source "$API_DIR/.env"; set +a
[ -n "${EXO_APP_ID:-}" ]         || die "EXO_APP_ID missing from api/.env"
[ -n "${EXO_ORGANIZATION:-}" ]    || die "EXO_ORGANIZATION missing from api/.env"
[ -n "${EXO_CERT_PASSWORD:-}" ]   || die "EXO_CERT_PASSWORD missing from api/.env"

# --- 1. Resource Group -----------------------------------------------------
say "ensuring resource group '$RG_NAME' in ${LOCATION}…"
EXISTS=$(az group exists --name "$RG_NAME")
if [ "$EXISTS" = "true" ]; then
  ok "RG exists"
else
  run az group create --name "$RG_NAME" --location "$LOCATION" --query 'id' -o tsv
  ok "RG created"
fi

# --- 2. Storage Account ----------------------------------------------------
say "ensuring storage account '$STORAGE_NAME'…"
if az storage account show --name "$STORAGE_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  ok "storage exists"
else
  run az storage account create \
    --name "$STORAGE_NAME" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --allow-blob-public-access false \
    --query 'name' -o tsv
  ok "storage created"
fi

# --- 3. Key Vault ----------------------------------------------------------
say "ensuring key vault '$KV_NAME'…"
if az keyvault show --name "$KV_NAME" >/dev/null 2>&1; then
  ok "KV exists"
else
  run az keyvault create \
    --name "$KV_NAME" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --enable-rbac-authorization true \
    --query 'name' -o tsv
  ok "KV created (RBAC-authorized)"
fi

# Grant the current user (you) RBAC to manage cert (one-time bootstrap)
ME=$(az ad signed-in-user show --query 'id' -o tsv 2>/dev/null || echo "")
KV_ID=$(az keyvault show --name "$KV_NAME" --query 'id' -o tsv)
if [ -n "$ME" ]; then
  if ! az role assignment list --assignee "$ME" --scope "$KV_ID" --query "[?roleDefinitionName=='Key Vault Administrator'].id | [0]" -o tsv | grep -q .; then
    say "granting yourself Key Vault Administrator on ${KV_NAME}…"
    run az role assignment create --assignee "$ME" --role "Key Vault Administrator" --scope "$KV_ID" >/dev/null
    ok "RBAC granted — waiting 30s for propagation…"
    sleep 30
  fi
fi

# --- 4. Upload cert to KV --------------------------------------------------
say "uploading cert to KV as '$CERT_NAME'…"
if az keyvault certificate show --vault-name "$KV_NAME" --name "$CERT_NAME" >/dev/null 2>&1; then
  ok "cert already in KV"
else
  if [ $DRY_RUN -eq 0 ]; then
    az keyvault certificate import \
      --vault-name "$KV_NAME" \
      --name "$CERT_NAME" \
      --file "$PFX_PATH" \
      --password "$EXO_CERT_PASSWORD" \
      --query 'name' -o tsv
    ok "cert uploaded"
  fi
fi

# --- 5. Function App -------------------------------------------------------
say "ensuring function app '$FUNC_NAME'…"
if az functionapp show --name "$FUNC_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  ok "function app exists"
else
  run az functionapp create \
    --name "$FUNC_NAME" \
    --resource-group "$RG_NAME" \
    --storage-account "$STORAGE_NAME" \
    --consumption-plan-location "$LOCATION" \
    --runtime powershell \
    --runtime-version 7.4 \
    --functions-version 4 \
    --os-type Linux \
    --query 'name' -o tsv
  ok "function app created"
fi

# Enable system-assigned managed identity
say "enabling managed identity on function app…"
FUNC_MI=$(az functionapp identity show --name "$FUNC_NAME" --resource-group "$RG_NAME" --query 'principalId' -o tsv 2>/dev/null || echo "")
if [ -z "$FUNC_MI" ]; then
  FUNC_MI=$(run az functionapp identity assign --name "$FUNC_NAME" --resource-group "$RG_NAME" --query 'principalId' -o tsv)
  ok "MI assigned: $FUNC_MI"
else
  ok "MI already enabled: $FUNC_MI"
fi

# New MIs take ~30-90s to propagate from MSI → Graph; az role assignment
# create resolves the assignee against Graph, so we have to wait. Retry
# until az can find the principal (max ~3 min).
say "waiting for managed identity to propagate to Graph…"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if az ad sp show --id "$FUNC_MI" --query 'id' -o tsv >/dev/null 2>&1; then
    ok "MI visible in Graph after $((i * 15))s"
    break
  fi
  sleep 15
done

# Grant function MI → KV: Certificate User + Secret User (it needs both —
# Get-AzKeyVaultCertificate gives metadata, Get-AzKeyVaultSecret gives the
# private key blob)
for role in "Key Vault Certificate User" "Key Vault Secrets User"; do
  if ! az role assignment list --assignee "$FUNC_MI" --scope "$KV_ID" --query "[?roleDefinitionName=='$role'].id | [0]" -o tsv 2>/dev/null | grep -q .; then
    say "granting function MI '$role' on ${KV_NAME}…"
    # Retry on transient "principal not found" errors that can persist
    # for a moment past the propagation check above.
    for attempt in 1 2 3 4 5; do
      if az role assignment create --assignee-object-id "$FUNC_MI" --assignee-principal-type ServicePrincipal --role "$role" --scope "$KV_ID" >/dev/null 2>&1; then
        ok "granted"; break
      fi
      [ $attempt -lt 5 ] && { warn "retrying in 20s…"; sleep 20; } || die "couldn't grant '$role' to MI"
    done
  else
    ok "function already has '$role'"
  fi
done

# --- 6. App settings -------------------------------------------------------
say "setting function app settings…"
run az functionapp config appsettings set \
  --name "$FUNC_NAME" --resource-group "$RG_NAME" \
  --settings \
    "KEY_VAULT_NAME=$KV_NAME" \
    "EXO_CERT_NAME=$CERT_NAME" \
    "EXO_APP_ID=$EXO_APP_ID" \
    "EXO_ORGANIZATION=$EXO_ORGANIZATION" \
    "FUNCTIONS_WORKER_RUNTIME=powershell" \
    "FUNCTIONS_WORKER_RUNTIME_VERSION=7.4" \
  --output none
ok "app settings written"

# --- 7. Bundle PowerShell modules + deploy ---------------------------------
# Linux Consumption plan doesn't support managedDependency in host.json,
# so EXO + Az modules must be shipped inside the function package under
# Modules/. Save-Module pulls fresh copies each run — bulletproof and the
# Modules/ dir is gitignored so we don't commit ~100MB.
if [ $SKIP_DEPLOY -eq 0 ]; then
  command -v pwsh >/dev/null || die "pwsh required to bundle modules (Save-Module)"

  say "bundling PowerShell modules into $EXO_FN_DIR/Modules/ …"
  if [ ! -d "$EXO_FN_DIR/Modules/ExchangeOnlineManagement" ] || [ ! -d "$EXO_FN_DIR/Modules/Az.KeyVault" ]; then
    if [ $DRY_RUN -eq 0 ]; then
      pwsh -NoProfile -Command "
        Save-Module -Name ExchangeOnlineManagement -Path '$EXO_FN_DIR/Modules' -Force -RequiredVersion 3.9.2 -ErrorAction Stop
        Save-Module -Name Az.Accounts              -Path '$EXO_FN_DIR/Modules' -Force -ErrorAction Stop
        Save-Module -Name Az.KeyVault              -Path '$EXO_FN_DIR/Modules' -Force -ErrorAction Stop
      " 2>&1 | tail -5
    fi
    ok "modules bundled"
  else
    ok "modules already bundled (use rm -rf $EXO_FN_DIR/Modules to force refresh)"
  fi

  say "deploying function code (this can take 2-5 min on first run)…"
  if [ $DRY_RUN -eq 0 ]; then
    ( cd "$EXO_FN_DIR" && func azure functionapp publish "$FUNC_NAME" --powershell ) 2>&1 | tail -10
    ok "deployed"
  fi
else
  warn "skipping deploy (--skip-deploy)"
fi

# --- 8. Read URL + key + persist to api/.env -------------------------------
say "resolving function URL + key…"
FN_HOSTNAME=$(az functionapp show --name "$FUNC_NAME" --resource-group "$RG_NAME" --query 'defaultHostName' -o tsv)
# Function key for the ExoFunction endpoint (may not exist until first deploy)
FN_KEY=$(az functionapp function keys list \
  --name "$FUNC_NAME" --resource-group "$RG_NAME" \
  --function-name ExoFunction --query 'default' -o tsv 2>/dev/null || echo "")
if [ -z "$FN_KEY" ]; then
  # Fall back to the master host key
  FN_KEY=$(az functionapp keys list --name "$FUNC_NAME" --resource-group "$RG_NAME" --query 'functionKeys.default' -o tsv 2>/dev/null || echo "")
fi
EXO_FUNCTION_URL="https://${FN_HOSTNAME}/api/ExoFunction"
ok "URL:  $EXO_FUNCTION_URL"
ok "key:  ${FN_KEY:0:8}…"

upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$API_DIR/.env" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$API_DIR/.env"
  else
    echo "${key}=${val}" >> "$API_DIR/.env"
  fi
}
if [ $DRY_RUN -eq 0 ]; then
  upsert_env "EXO_FUNCTION_URL" "$EXO_FUNCTION_URL"
  upsert_env "EXO_FUNCTION_KEY" "$FN_KEY"
  ok "EXO_FUNCTION_URL + EXO_FUNCTION_KEY persisted to api/.env"
fi

printf "\n\033[36m═══════════════════════════════════════════════════════════════════════\033[0m\n"
printf "\033[33m   EXO function deployed and wired   \033[0m\n"
printf "\033[36m═══════════════════════════════════════════════════════════════════════\033[0m\n\n"
cat <<EOF
Resources:
  • Resource group:  $RG_NAME ($LOCATION)
  • Function app:    $FUNC_NAME
  • Key Vault:       $KV_NAME (cert: $CERT_NAME)
  • Storage:         $STORAGE_NAME

Function endpoint:
  POST $EXO_FUNCTION_URL?code=<key>
  body: {"op":"list"} | {"op":"list-access","mailbox":"chief@…"}
        | {"op":"grant","mailbox":"chief@…","user":"lucas@…"}
        | {"op":"revoke","mailbox":"chief@…","user":"lucas@…"}
        | {"op":"list-for-user","user":"lucas@…"}

Test it (lists all 13 shared mailboxes):
  curl -sX POST "$EXO_FUNCTION_URL?code=$FN_KEY" \\
    -H 'Content-Type: application/json' \\
    -d '{"op":"list"}'

Re-deploy after code changes:
  ( cd exo-function && func azure functionapp publish $FUNC_NAME --powershell )

Rotate the function key:
  az functionapp keys set --name $FUNC_NAME --resource-group $RG_NAME --key-type functionKeys --key-name default

Rotate the cert:
  1. bash scripts/setup-app-exo.sh --rotate-cert
  2. az keyvault certificate delete --vault-name $KV_NAME --name $CERT_NAME
  3. az keyvault certificate purge  --vault-name $KV_NAME --name $CERT_NAME
  4. bash scripts/setup-exo-function.sh

Costs: <\$1/mo at this load (Consumption plan + storage + KV).
EOF
