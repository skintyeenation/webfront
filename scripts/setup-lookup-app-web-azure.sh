#!/bin/bash
# Set up Azure Static Web Apps for the lookup tool app (lookup/app/)
# at lookup-app.skintyee.ca. Web-only deploy — the lookup app doesn't
# ship to iOS / Android stores (it's a browser-only tool for staff /
# the public to look up Canadian business / Nations / grants data).
#
# Twin of scripts/setup-app-web-azure.sh — same shape, different
# Static Web App resource + deployment token + custom domain.
#
# What this script provisions (idempotent):
#
#   1. Static Web App resource          skintyee-prod-lookup-app   (Free SKU)
#   2. Custom domain                    lookup-app.skintyee.ca     (manual TXT validation)
#   3. LOOKUP_APP_SWA_DEPLOYMENT_TOKEN  added to skintyee-prod-azure variable group
#   4. ADO pipeline                     deploy-lookup-app-web      (from
#                                                                   azure-pipelines/Deployments/deploy-lookup-app-web.yml)
#
# Prereqs:
#   - scripts/setup-api-azure.sh already run (shares the RG + variable group)

set -uo pipefail

CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults --------------------------------------------------------------
LOCATION="${LOCATION:-canadacentral}"
SWA_LOCATION="${SWA_LOCATION:-eastus2}"     # SWA's nearest available region
RG="${RG:-skintyee-prod-rg}"
SWA_NAME="${SWA_NAME:-skintyee-prod-lookup-app}"
SWA_DOMAIN="${SWA_DOMAIN:-lookup-app.skintyee.ca}"
SWA_SKU="${SWA_SKU:-Free}"
DNS_ZONE="${DNS_ZONE:-skintyee.ca}"

ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_REPO="${ADO_REPO:-webfront}"
ADO_VG_NAME="${ADO_VG_NAME:-skintyee-prod-azure}"
ADO_PIPELINE_NAME="${ADO_PIPELINE_NAME:-deploy-lookup-app-web}"
ADO_PIPELINE_YAML="${ADO_PIPELINE_YAML:-azure-pipelines/Deployments/deploy-lookup-app-web.yml}"
SECRET_NAME="${SECRET_NAME:-LOOKUP_APP_SWA_DEPLOYMENT_TOKEN}"

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

az group show --name "$RG" >/dev/null 2>&1 \
  || die "resource group '$RG' not found — run scripts/setup-api-azure.sh first."

VG_ID=$(az pipelines variable-group list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
[ -n "$VG_ID" ] && [ "$VG_ID" != "null" ] \
  || die "variable group '$ADO_VG_NAME' not found — run scripts/setup-api-azure.sh first."

# ----- summary + confirm -----------------------------------------------------

cat <<EOF

${CYAN}Skin Tyee lookup-app — web hosting setup (Azure Static Web Apps)${RST}

  Resource group:     $RG    (existing)
  Static Web App:     $SWA_NAME  ($SWA_SKU SKU)
  Region (SWA):       $SWA_LOCATION
  Custom domain:      $SWA_DOMAIN
  DNS zone:           $DNS_ZONE
  ADO pipeline:       $ADO_PIPELINE_NAME (from $ADO_PIPELINE_YAML)
  Var group secret:   $SECRET_NAME

EOF

if [ "$DRY_RUN" -eq 1 ]; then
  warn "DRY RUN — no Azure / ADO changes will be made."
elif [ "$YES" -ne 1 ]; then
  printf '  Proceed? [y/N] '
  read -r ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || die "aborted."
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

# ----- 2) deployment token → ADO variable group secret ----------------------
if [ "$DRY_RUN" -eq 0 ]; then
  say "retrieving SWA deployment token…"
  SWA_TOKEN=$(az staticwebapp secrets list --resource-group "$RG" --name "$SWA_NAME" \
    --query 'properties.apiKey' -o tsv 2>/dev/null)
  [ -n "$SWA_TOKEN" ] || die "couldn't retrieve SWA deployment token."

  say "adding $SECRET_NAME secret to '$ADO_VG_NAME'…"
  EXISTS=$(az pipelines variable-group variable list \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
    --query "${SECRET_NAME}.value" -o tsv 2>/dev/null || echo "")
  if [ -z "$EXISTS" ]; then
    az pipelines variable-group variable create \
      --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
      --name "$SECRET_NAME" --secret true --value "$SWA_TOKEN" \
      --only-show-errors >/dev/null
  else
    az pipelines variable-group variable update \
      --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --group-id "$VG_ID" \
      --name "$SECRET_NAME" --secret true --value "$SWA_TOKEN" \
      --only-show-errors >/dev/null
  fi
  ok "$SECRET_NAME stored in variable group"
fi

# ----- 3) register the deploy-lookup-app-web pipeline ----------------------
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

# ----- final summary --------------------------------------------------------
cat <<EOF

${GRN}✔ done — lookup-app web hosting provisioned.${RST}

What's left (manual):

  1. ${CYAN}Bind the custom domain $SWA_DOMAIN${RST}:

       az staticwebapp hostname set \\
         --resource-group $RG --name $SWA_NAME \\
         --hostname $SWA_DOMAIN \\
         --validation-method 'cname-delegation'

     Then add a CNAME in Azure DNS:
       lookup-app   →   $SWA_HOSTNAME

  2. ${CYAN}First deploy${RST}:

       # touch any file in lookup/app/ + push, OR run the pipeline from the ADO UI
       git push azure master
       # Monitor: $ADO_ORG_URL/$ADO_PROJECT/_build

     After ~3–5 min the app is live at:
       https://$SWA_HOSTNAME           (default — works immediately)
       https://$SWA_DOMAIN              (works once step 1 completes)

For more detail see docs/devops/app-deploy-web.md.

EOF
