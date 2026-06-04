#!/usr/bin/env bash
# Set the STAFF_AUTH_SECRET Container App secret used to sign staff
# sign-in JWTs (HS256, 24h TTL) — see docs/features/staff-auth.md
# locked decision #1. Idempotent: regenerates the secret and updates
# the live Container App in one shot. Existing tokens get invalidated
# at the next sign-in attempt because the signing key changes.
#
# Usage:
#   ./scripts/setup-staff-auth-secret.sh                  # prod (default)
#   APP_NAME=api-dev RG=skintyee-dev-rg ./scripts/...     # other env
#   ./scripts/setup-staff-auth-secret.sh --rotate         # force regen
#
# Prereqs:
#   - az login as a tenant admin (Container App Contributor)
#   - openssl (for entropy)

set -euo pipefail

APP_NAME="${APP_NAME:-api-prod}"
RG="${RG:-skintyee-prod-rg}"
SECRET_NAME="staff-auth-secret"     # secret name in Container App
ENV_VAR="STAFF_AUTH_SECRET"          # env var name inside the container

FORCE_ROTATE=0
for arg in "$@"; do
  case "$arg" in
    --rotate) FORCE_ROTATE=1 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

echo "▸ target: Container App ${APP_NAME} (rg ${RG})"

# Check if the secret is already set; skip generation unless --rotate.
existing=$(az containerapp secret list --name "$APP_NAME" --resource-group "$RG" --query "[?name=='$SECRET_NAME'].name | [0]" -o tsv 2>/dev/null || true)
if [[ -n "$existing" && "$FORCE_ROTATE" -eq 0 ]]; then
  echo "✓ ${SECRET_NAME} already set; pass --rotate to regenerate."
  exit 0
fi

# 48 bytes of entropy → 64-char base64. Comfortably above the 32-char
# minimum StaffAuthService.secret() enforces.
NEW_SECRET=$(openssl rand -base64 48 | tr -d '\n=')
echo "▸ generated 64-char secret (not printed)"

echo "▸ updating ${SECRET_NAME}…"
az containerapp secret set \
  --name "$APP_NAME" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${NEW_SECRET}" >/dev/null

echo "▸ wiring env var ${ENV_VAR} → ${SECRET_NAME}…"
az containerapp update \
  --name "$APP_NAME" --resource-group "$RG" \
  --set-env-vars "${ENV_VAR}=secretref:${SECRET_NAME}" >/dev/null

echo "✓ done. Tokens signed before this rotation are now invalid."
