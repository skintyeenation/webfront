#!/bin/bash
# Set (or update) the ANTHROPIC_API_KEY secret on the lookup-prod
# Container App, after scripts/setup-lookup-azure.sh provisioned the
# infrastructure.
#
# Why this is a separate script:
#   setup-lookup-azure.sh creates the Container App. The Anthropic key
#   is optional at setup time (the placeholder image doesn't need it),
#   so the setup script can complete without it. This script wires it
#   up whenever you're ready — typically just before the first
#   deploy-lookup pipeline run that pushes the real lookup-api image.
#
# Idempotent — safe to re-run. Re-running with a different key value
# rotates the secret in place.
#
# Usage:
#   bash scripts/set-lookup-api-key.sh                     # prompts for the key
#   ANTHROPIC_API_KEY='sk-...' bash scripts/set-lookup-api-key.sh   # non-interactive
#   bash scripts/set-lookup-api-key.sh --dry-run           # preview the az calls

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults (match setup-lookup-azure.sh) -------------------------------
RG="${RG:-skintyee-prod-rg}"
CA_LOOKUP_NAME="${CA_LOOKUP_NAME:-lookup-prod}"
SECRET_NAME="${SECRET_NAME:-anthropic-api-key}"
ENV_VAR_NAME="${ENV_VAR_NAME:-ANTHROPIC_API_KEY}"

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

# ----- prereq checks --------------------------------------------------------
command -v az >/dev/null || die "az CLI not found"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

az containerapp show --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
  --query name -o tsv >/dev/null 2>&1 \
  || die "Container App '$CA_LOOKUP_NAME' not found in '$RG'. Run scripts/setup-lookup-azure.sh first."

# ----- get the key ----------------------------------------------------------
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    ANTHROPIC_API_KEY="DRY-RUN-PLACEHOLDER"
  else
    printf '  Anthropic API key (input hidden): '
    if read -rs ANTHROPIC_API_KEY 2>/dev/null; then echo; fi
    [ -n "${ANTHROPIC_API_KEY:-}" ] || die "no key provided. Aborting."
  fi
fi

# ----- set the secret + bind the env var ------------------------------------
say "setting Container App secret '$SECRET_NAME' on ${CA_LOOKUP_NAME}…"
if [ "$DRY_RUN" -eq 1 ]; then
  printf '  (dry-run) az containerapp secret set --resource-group %s --name %s --secrets %s=<value>\n' "$RG" "$CA_LOOKUP_NAME" "$SECRET_NAME"
else
  az containerapp secret set \
    --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
    --secrets "${SECRET_NAME}=${ANTHROPIC_API_KEY}" \
    --only-show-errors >/dev/null \
    || die "couldn't set the secret. Check 'az containerapp secret set' output."
  ok "secret '$SECRET_NAME' stored on Container App (encrypted at rest)"
fi

say "binding env var '$ENV_VAR_NAME' to the secret on ${CA_LOOKUP_NAME}…"
if [ "$DRY_RUN" -eq 1 ]; then
  printf '  (dry-run) az containerapp update --resource-group %s --name %s --set-env-vars %s=secretref:%s\n' "$RG" "$CA_LOOKUP_NAME" "$ENV_VAR_NAME" "$SECRET_NAME"
else
  az containerapp update \
    --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
    --set-env-vars "${ENV_VAR_NAME}=secretref:${SECRET_NAME}" \
    --only-show-errors >/dev/null \
    || warn "secret set but env-var binding failed — check 'az containerapp update' output."
  ok "env var '$ENV_VAR_NAME' bound to secret 'secretref:$SECRET_NAME'"
fi

# ----- final summary --------------------------------------------------------
cat <<EOF

${GRN}✔ done.${RST} The lookup-api will see ANTHROPIC_API_KEY in its
environment on the next Container App revision restart.

The key value is stored encrypted on the Container App; it is NOT
in the variable group, NOT in this repo, NOT in any CI log.

Save a copy of the key to 1Password → IT/Admin vault if you haven't
already — this script doesn't keep a copy.

To rotate later:
  - Generate a new key at https://console.anthropic.com/settings/keys
  - Re-run this script with the new value

To remove (e.g. switching providers):
  az containerapp secret remove \\
    --resource-group $RG --name $CA_LOOKUP_NAME --secret-names $SECRET_NAME
EOF
