#!/bin/bash
# Wire the Anthropic (Claude) API key the api/ uses to read receipts for the
# Expenses module (see docs/features/expenses.md).
#
# The api/'s AnthropicService calls the Anthropic Messages API directly (vision)
# to extract amount/vendor/date + suggest an expense tag from each receipt. With
# no key set the service is a graceful no-op (manual entry still works), so this
# is only needed to turn AI receipt-reading ON in production.
#
# What this does:
#   1. Stores the key as the `anthropic-api-key` secret on the `api-prod`
#      Container App and binds it to the ANTHROPIC_API_KEY env var.
#   2. Optionally sets ANTHROPIC_MODEL (default claude-haiku-4-5-20251001).
#   3. Syncs both into the ADO `skintyee-prod-azure` variable group (key as a
#      secret variable) so future pipeline deploys keep them.
#
# Idempotent — safe to re-run (e.g. to rotate the key).
#
# Usage:
#   ANTHROPIC_API_KEY=sk-ant-... bash scripts/setup-app-anthropic.sh
#   bash scripts/setup-app-anthropic.sh sk-ant-...            # key as arg
#   bash scripts/setup-app-anthropic.sh --dry-run             # preview az calls
#   ANTHROPIC_MODEL=claude-sonnet-4-6 ANTHROPIC_API_KEY=sk-ant-... bash scripts/setup-app-anthropic.sh

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults -------------------------------------------------------------
RG="${RG:-skintyee-prod-rg}"
CA_API_NAME="${CA_API_NAME:-api-prod}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}"
ADO_ORG="${ADO_ORG:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VARGROUP="${ADO_VARGROUP:-skintyee-prod-azure}"

DRY_RUN=0
ARG_KEY=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    sk-ant-*)  ARG_KEY="$arg" ;;
  esac
done

KEY="${ARG_KEY:-${ANTHROPIC_API_KEY:-}}"
[[ -n "$KEY" ]] || die "No key. Pass it as an arg or set ANTHROPIC_API_KEY."

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '    %s(dry-run)%s %s\n' "$YLW" "$RST" "$*"
  else
    "$@"
  fi
}

say "Container App:   $CA_API_NAME ($RG)"
say "Model:           $ANTHROPIC_MODEL"
say "Key:             ${KEY:0:10}…(${#KEY} chars)"

# ----- wire into Container App ----------------------------------------------
say "Updating Container App $CA_API_NAME secrets…"
run az containerapp secret set \
  -n "$CA_API_NAME" -g "$RG" \
  --secrets "anthropic-api-key=$KEY" \
  -o none && ok "Secret set."

run az containerapp update \
  -n "$CA_API_NAME" -g "$RG" \
  --set-env-vars \
    "ANTHROPIC_API_KEY=secretref:anthropic-api-key" \
    "ANTHROPIC_MODEL=$ANTHROPIC_MODEL" \
  -o none && ok "Env vars bound (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)."

# ----- wire into ADO variable group -----------------------------------------
say "Updating ADO variable group ${ADO_VARGROUP}…"
if [[ "$DRY_RUN" -eq 1 ]]; then
  warn "Skipping ADO update (dry-run)."
else
  if az extension show --name azure-devops -o none 2>/dev/null; then
    VG_ID=$(az pipelines variable-group list \
            --org "$ADO_ORG" --project "$ADO_PROJECT" \
            --query "[?name=='$ADO_VARGROUP'].id" -o tsv 2>/dev/null | head -1)
    if [[ -n "$VG_ID" ]]; then
      az pipelines variable-group variable update \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "ANTHROPIC_MODEL" --value "$ANTHROPIC_MODEL" -o none 2>/dev/null || \
      az pipelines variable-group variable create \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "ANTHROPIC_MODEL" --value "$ANTHROPIC_MODEL" -o none
      # Key is secret.
      az pipelines variable-group variable update \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "ANTHROPIC_API_KEY" --value "$KEY" --secret true -o none 2>/dev/null || \
      az pipelines variable-group variable create \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "ANTHROPIC_API_KEY" --value "$KEY" --secret true -o none
      ok "ADO variables synced."
    else
      warn "Variable group '$ADO_VARGROUP' not found in $ADO_ORG/$ADO_PROJECT — skipping."
    fi
  else
    warn "azure-devops extension not installed; run 'az extension add --name azure-devops' to enable ADO sync."
  fi
fi

ok "Done."
say "Upload a receipt in the app — the item should come back AI-prefilled."
