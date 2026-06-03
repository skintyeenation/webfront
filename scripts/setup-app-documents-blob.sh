#!/bin/bash
# Provision the Azure Blob container that backs the app's Documents
# library (see docs/features/documents-and-onboarding.md).
#
# What this does:
#   1. Creates / verifies the `skintyee-app-documents` container on the
#      production storage account (default: skintyeeprodstorage).
#   2. Mints an account-level SAS token with rwdl perms on the container
#      (24-month TTL — easy to rotate via --rotate-sas).
#   3. Wires three secrets into the `api-prod` Container App:
#         AZURE_STORAGE_DOCUMENTS_ACCOUNT
#         AZURE_STORAGE_DOCUMENTS_CONTAINER
#         AZURE_STORAGE_DOCUMENTS_SAS
#      and updates the ADO `skintyee-prod-azure` variable group so
#      future pipeline runs sync the same values.
#
# Phase 1 default driver. STORAGE_DRIVER=blob in the api/ picks this.
# When migrating to SharePoint, run setup-app-forms-sharepoint.sh
# and flip STORAGE_DRIVER to 'sharepoint'.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/setup-app-documents-blob.sh                # create container + initial SAS
#   bash scripts/setup-app-documents-blob.sh --dry-run      # preview az calls
#   bash scripts/setup-app-documents-blob.sh --rotate-sas   # mint a fresh SAS

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults -------------------------------------------------------------
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-skintyeeprodstorage}"
RG="${RG:-skintyee-prod-rg}"
CONTAINER="${CONTAINER:-skintyee-app-documents}"
SAS_TTL_DAYS="${SAS_TTL_DAYS:-730}"   # 24 months
CA_API_NAME="${CA_API_NAME:-api-prod}"
ADO_ORG="${ADO_ORG:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VARGROUP="${ADO_VARGROUP:-skintyee-prod-azure}"

DRY_RUN=0
ROTATE_SAS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --rotate-sas) ROTATE_SAS=1 ;;
    -h|--help)
      sed -n '2,32p' "$0"
      exit 0 ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  %sdry-run%s %s\n' "$YLW" "$RST" "$*"
  else
    "$@"
  fi
}

# ----- preflight -------------------------------------------------------------
command -v az >/dev/null 2>&1 || die "az CLI not found. Install Azure CLI first."
az account show -o none 2>/dev/null || die "Not logged into Azure. Run: az login"

say "Storage account: $STORAGE_ACCOUNT (rg: $RG)"
say "Container:       $CONTAINER"
say "SAS TTL:         $SAS_TTL_DAYS days"

# ----- container ------------------------------------------------------------
if [[ "$ROTATE_SAS" -ne 1 ]]; then
  say "Ensuring container exists…"
  run az storage container create \
    --account-name "$STORAGE_ACCOUNT" \
    --name "$CONTAINER" \
    --auth-mode login \
    -o none && ok "Container ready: $CONTAINER"
fi

# ----- SAS ------------------------------------------------------------------
say "Minting SAS (rwdl on $CONTAINER, ${SAS_TTL_DAYS}d TTL)…"
EXPIRY=$(date -u -v+"${SAS_TTL_DAYS}"d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
         date -u -d "+${SAS_TTL_DAYS} days" '+%Y-%m-%dT%H:%M:%SZ')
if [[ "$DRY_RUN" -eq 1 ]]; then
  SAS="DRY-RUN-SAS-VALUE"
else
  SAS=$(az storage container generate-sas \
        --account-name "$STORAGE_ACCOUNT" \
        --name "$CONTAINER" \
        --permissions rwdl \
        --expiry "$EXPIRY" \
        --as-user --auth-mode login \
        --https-only -o tsv 2>/dev/null) || \
        SAS=$(az storage container generate-sas \
        --account-name "$STORAGE_ACCOUNT" \
        --name "$CONTAINER" \
        --permissions rwdl \
        --expiry "$EXPIRY" \
        --https-only -o tsv)
fi
[[ -n "$SAS" ]] || die "Failed to mint SAS."
ok "SAS minted (expires $EXPIRY)"

# ----- wire into Container App ----------------------------------------------
say "Updating Container App $CA_API_NAME secrets…"
run az containerapp secret set \
  -n "$CA_API_NAME" -g "$RG" \
  --secrets \
    "azure-storage-documents-account=$STORAGE_ACCOUNT" \
    "azure-storage-documents-container=$CONTAINER" \
    "azure-storage-documents-sas=$SAS" \
  -o none && ok "Secrets set."

run az containerapp update \
  -n "$CA_API_NAME" -g "$RG" \
  --set-env-vars \
    "AZURE_STORAGE_DOCUMENTS_ACCOUNT=secretref:azure-storage-documents-account" \
    "AZURE_STORAGE_DOCUMENTS_CONTAINER=secretref:azure-storage-documents-container" \
    "AZURE_STORAGE_DOCUMENTS_SAS=secretref:azure-storage-documents-sas" \
    "STORAGE_DRIVER=blob" \
  -o none && ok "Env vars bound."

# ----- wire into ADO variable group -----------------------------------------
say "Updating ADO variable group $ADO_VARGROUP…"
if [[ "$DRY_RUN" -eq 1 ]]; then
  warn "Skipping ADO update (dry-run)."
else
  if command -v az-devops >/dev/null 2>&1 || az extension show --name azure-devops -o none 2>/dev/null; then
    VG_ID=$(az pipelines variable-group list \
            --org "$ADO_ORG" --project "$ADO_PROJECT" \
            --query "[?name=='$ADO_VARGROUP'].id" -o tsv 2>/dev/null | head -1)
    if [[ -n "$VG_ID" ]]; then
      for kv in \
        "AZURE_STORAGE_DOCUMENTS_ACCOUNT=$STORAGE_ACCOUNT" \
        "AZURE_STORAGE_DOCUMENTS_CONTAINER=$CONTAINER" \
        "STORAGE_DRIVER=blob"; do
        key="${kv%%=*}"; val="${kv#*=}"
        az pipelines variable-group variable update \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$key" --value "$val" -o none 2>/dev/null || \
        az pipelines variable-group variable create \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$key" --value "$val" -o none
      done
      # SAS is secret — store as secret variable.
      az pipelines variable-group variable update \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "AZURE_STORAGE_DOCUMENTS_SAS" --value "$SAS" --secret true -o none 2>/dev/null || \
      az pipelines variable-group variable create \
        --org "$ADO_ORG" --project "$ADO_PROJECT" \
        --group-id "$VG_ID" --name "AZURE_STORAGE_DOCUMENTS_SAS" --value "$SAS" --secret true -o none
      ok "ADO variables synced."
    else
      warn "Variable group '$ADO_VARGROUP' not found in $ADO_ORG/$ADO_PROJECT — skipping."
    fi
  else
    warn "azure-devops extension not installed; run 'az extension add --name azure-devops' to enable ADO sync."
  fi
fi

ok "Done."
say "Test the api/ container app to verify reads/writes work end-to-end."
