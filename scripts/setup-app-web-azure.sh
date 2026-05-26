#!/bin/bash
# Set up Azure Static Web Apps for the Skin Tyee community app at
# app.skintyee.ca. Pairs with scripts/setup-eas-app.sh (which handles
# the native iOS/Android side via EAS Build) — together they cover
# both build targets for the same Expo source tree.
#
# What this script provisions (idempotent):
#
#   1. Static Web App resource          skintyee-prod-app   (Free SKU)
#   2. Custom domain                    app.skintyee.ca     (manual TXT validation)
#   3. SWA_DEPLOYMENT_TOKEN secret      added to skintyee-prod-azure variable group
#   4. ADO pipeline                     deploy-app-web      (from
#                                                            azure-pipelines/Deployments/deploy-app-web.yml)
#
# Prereqs:
#   - scripts/setup-api-azure.sh already run (shares the RG + variable group)
#   - az CLI signed in to skintyeenation with Owner on the subscription
#
# Usage:
#   bash scripts/setup-app-web-azure.sh

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults --------------------------------------------------------------
LOCATION="${LOCATION:-canadacentral}"
# Static Web Apps is only available in certain regions; canadacentral isn't
# one of them as of 2026. SWA picks the nearest available region for the
# Free SKU automatically — we just need to declare *a* location for the RG.
SWA_LOCATION="${SWA_LOCATION:-eastus2}"

RG="${RG:-skintyee-prod-rg}"
SWA_NAME="${SWA_NAME:-skintyee-prod-app}"
SWA_DOMAIN="${SWA_DOMAIN:-app.skintyee.ca}"
SWA_SKU="${SWA_SKU:-Free}"
DNS_ZONE="${DNS_ZONE:-skintyee.ca}"

ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_REPO="${ADO_REPO:-webfront}"
ADO_VG_NAME="${ADO_VG_NAME:-skintyee-prod-azure}"
ADO_PIPELINE_NAME="${ADO_PIPELINE_NAME:-deploy-app-web}"
ADO_PIPELINE_YAML="${ADO_PIPELINE_YAML:-azure-pipelines/Deployments/deploy-app-web.yml}"

DRY_RUN=0
YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes|-y)  YES=1; shift ;;
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

# ----- prereq checks ---------------------------------------------------------
command -v az >/dev/null || die "az CLI not found"
command -v jq >/dev/null || die "jq not found"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

# Verify the shared RG + variable group exist (setup-api-azure.sh ran).
az group show --name "$RG" >/dev/null 2>&1 \
  || die "resource group '$RG' not found — run scripts/setup-api-azure.sh first."
VG_ID=$(az pipelines variable-group list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
[ -n "$VG_ID" ] && [ "$VG_ID" != "null" ] \
  || die "variable group '$ADO_VG_NAME' not found — run scripts/setup-api-azure.sh first."

# ----- summary + confirm -----------------------------------------------------

cat <<EOF

${CYAN}Skin Tyee app — web hosting setup (Azure Static Web Apps)${RST}

  Resource group:       $RG    (existing)
  Static Web App:       $SWA_NAME  ($SWA_SKU SKU)
  Region (SWA):         $SWA_LOCATION  (SWA picks nearest CDN edge automatically)
  Custom domain:        $SWA_DOMAIN
  DNS zone:             $DNS_ZONE
  ADO pipeline:         $ADO_PIPELINE_NAME (from $ADO_PIPELINE_YAML)
  ADO variable group:   $ADO_VG_NAME (will gain SWA_DEPLOYMENT_TOKEN)

EOF

if [ "$DRY_RUN" -eq 1 ]; then
  warn "DRY RUN — no Azure / ADO changes will be made."
elif [ "$YES" -ne 1 ]; then
  printf '  Proceed? [y/N] '
  read -r ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || die "aborted."
fi

# ----- 0) resource provider pre-flight ---------------------------------------
# Static Web Apps lives under Microsoft.Web. Register if needed.
if [ "$DRY_RUN" -eq 0 ]; then
  state=$(az provider show --namespace Microsoft.Web --query registrationState -o tsv 2>/dev/null || echo "Unknown")
  if [ "$state" != "Registered" ]; then
    say "registering resource provider Microsoft.Web (current state: $state)…"
    az provider register --namespace Microsoft.Web --wait --only-show-errors >/dev/null \
      || warn "couldn't register Microsoft.Web — staticwebapp create may fail."
  fi
fi

# ----- 1) create Static Web App ---------------------------------------------
say "ensuring Static Web App '$SWA_NAME'…"
SWA_EXISTS=$(az staticwebapp show --resource-group "$RG" --name "$SWA_NAME" \
  --query name -o tsv 2>/dev/null || echo "")
if [ -z "$SWA_EXISTS" ]; then
  run az staticwebapp create \
    --resource-group "$RG" \
    --name "$SWA_NAME" \
    --location "$SWA_LOCATION" \
    --sku "$SWA_SKU" \
    --only-show-errors >/dev/null \
    || die "Static Web App creation failed."
fi
SWA_HOSTNAME=$(az staticwebapp show --resource-group "$RG" --name "$SWA_NAME" \
  --query defaultHostname -o tsv 2>/dev/null || echo "")
ok "Static Web App ready (default hostname: $SWA_HOSTNAME)"

# ----- 2) get deployment token + push to ADO variable group -----------------
if [ "$DRY_RUN" -eq 0 ]; then
  say "retrieving SWA deployment token…"
  SWA_TOKEN=$(az staticwebapp secrets list --resource-group "$RG" --name "$SWA_NAME" \
    --query 'properties.apiKey' -o tsv 2>/dev/null)
  [ -n "$SWA_TOKEN" ] || die "couldn't retrieve SWA deployment token."

  say "adding SWA_DEPLOYMENT_TOKEN secret to '$ADO_VG_NAME'…"
  EXISTS=$(az pipelines variable-group variable list \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
    --query 'SWA_DEPLOYMENT_TOKEN.value' -o tsv 2>/dev/null || echo "")
  if [ -z "$EXISTS" ]; then
    az pipelines variable-group variable create \
      --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
      --name SWA_DEPLOYMENT_TOKEN --secret true --value "$SWA_TOKEN" \
      --only-show-errors >/dev/null
  else
    az pipelines variable-group variable update \
      --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
      --name SWA_DEPLOYMENT_TOKEN --secret true --value "$SWA_TOKEN" \
      --only-show-errors >/dev/null
  fi
  ok "SWA_DEPLOYMENT_TOKEN stored in variable group"
fi

# ----- 3) add GOOGLE_MAPS_API_KEY placeholder if missing --------------------
if [ "$DRY_RUN" -eq 0 ]; then
  EXISTS=$(az pipelines variable-group variable list \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
    --query 'GOOGLE_MAPS_API_KEY.value' -o tsv 2>/dev/null || echo "")
  if [ -z "$EXISTS" ]; then
    say "adding GOOGLE_MAPS_API_KEY placeholder to variable group…"
    az pipelines variable-group variable create \
      --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
      --name GOOGLE_MAPS_API_KEY --secret true \
      --value 'REPLACE-WITH-REAL-KEY-FROM-1PASSWORD' \
      --only-show-errors >/dev/null 2>&1 || true
    warn "GOOGLE_MAPS_API_KEY in '$ADO_VG_NAME' is a placeholder — paste the real key from 1Password (IT/Admin vault) via:"
    warn "  az pipelines variable-group variable update --group-id $VG_ID --name GOOGLE_MAPS_API_KEY --secret true --value '<paste>'"
  fi
fi

# ----- 4) register the deploy-app-web pipeline ------------------------------
say "registering ADO pipeline '$ADO_PIPELINE_NAME' (from $ADO_PIPELINE_YAML)…"
P_ID=$(az pipelines list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_PIPELINE_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
if [ -z "$P_ID" ] || [ "$P_ID" = "null" ]; then
  run az pipelines create \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --name "$ADO_PIPELINE_NAME" \
    --repository "$ADO_REPO" \
    --repository-type tfsgit \
    --branch master \
    --yml-path "$ADO_PIPELINE_YAML" \
    --skip-first-run \
    --only-show-errors >/dev/null \
    && ok "pipeline registered" \
    || warn "couldn't register pipeline — register manually in ADO UI."
else
  ok "pipeline already exists (id $P_ID)"
fi

# ----- 5) final summary + manual-step instructions --------------------------

cat <<EOF

${GRN}✔ done — Azure Static Web App is provisioned.${RST}

What's left (manual):

  1. ${CYAN}Bind the custom domain $SWA_DOMAIN${RST}:

       az staticwebapp hostname set \\
         --resource-group $RG --name $SWA_NAME \\
         --hostname $SWA_DOMAIN \\
         --validation-method 'cname-delegation'

     Then in Azure DNS, add a CNAME record:
       app  →  $SWA_HOSTNAME
     (Or use TXT validation — Azure prints the exact TXT record to add.)

     Once DNS propagates (a few minutes), Azure mints + binds the TLS
     cert automatically.

  2. ${CYAN}Replace GOOGLE_MAPS_API_KEY placeholder${RST} in the variable group with
     the real key from 1Password IT/Admin vault.

  3. ${CYAN}First deploy${RST}:

       # touch any file in app/ + push, OR run from the ADO UI
       git push azure master
       # Monitor: $ADO_ORG_URL/$ADO_PROJECT/_build

     After ~3–5 min the app is live at:
       https://$SWA_HOSTNAME  (default URL — works immediately)
       https://$SWA_DOMAIN    (works once step 1 above completes)

  4. ${CYAN}PR-preview URLs${RST} (built-in, no extra setup): every PR to master
     touching app/** gets its own staging URL at:
       https://${SWA_NAME}-<random>-<region>-<region>.azurestaticapps.net
     visible in the PR comments + the SWA portal blade.

For full operational detail see docs/devops/app-deploy-web.md.

EOF
