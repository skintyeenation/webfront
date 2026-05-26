#!/bin/bash
# Set up the Azure resources for the lookup/api/ deploy pipeline,
# reusing the shared infra (resource group, ACR, Container Apps
# environment, Entra deploy app, ADO service connection + variable
# group) that scripts/setup-api-azure.sh already provisioned.
#
# What this script provisions on top of the existing infra (idempotent):
#
#   1. Container App                lookup-prod    (always-on, min-replicas=1)
#   2. AcrPull role assignment      Container App MI → ACR
#   3. Contributor role assignment  deploy SP → the Container App
#   4. ANTHROPIC_API_KEY secret     stored on the Container App
#   5. LOOKUP_CONTAINERAPP var      added to skintyee-prod-azure variable group
#   6. ADO pipeline                 deploy-lookup  (from
#                                                  azure-pipelines/Deployments/deploy-lookup.yml)
#
# What stays manual (script prints what to do):
#
#   - DNS TXT record validation for lookup.skintyee.ca (Microsoft
#     requirement before managed TLS cert mint).
#   - ANTHROPIC_API_KEY value (prompted, never logged; suggests 1Password).
#
# Prereqs:
#   - scripts/setup-api-azure.sh already run successfully (or the
#     equivalent infra exists with the same names).
#   - az CLI logged in as a user with Owner on the subscription +
#     at least Application Administrator on the Entra tenant.

set -uo pipefail

# ----- styling helpers --------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults (match setup-api-azure.sh) -----------------------------------
LOCATION="${LOCATION:-canadacentral}"
RG="${RG:-skintyee-prod-rg}"
ACR="${ACR:-skintyeeprodacr}"
CAE_NAME="${CAE_NAME:-skintyee-prod-env}"
CA_LOOKUP_NAME="${CA_LOOKUP_NAME:-lookup-prod}"
CA_LOOKUP_DOMAIN="${CA_LOOKUP_DOMAIN:-lookup.skintyee.ca}"
DNS_ZONE="${DNS_ZONE:-skintyee.ca}"

ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_REPO="${ADO_REPO:-webfront}"
ADO_SC_NAME="${ADO_SC_NAME:-skintyee-prod-azure}"
ADO_VG_NAME="${ADO_VG_NAME:-skintyee-prod-azure}"
ADO_PIPELINE_NAME="${ADO_PIPELINE_NAME:-deploy-lookup}"
ADO_PIPELINE_YAML="${ADO_PIPELINE_YAML:-azure-pipelines/Deployments/deploy-lookup.yml}"

PUBLISHER_APP_NAME="${PUBLISHER_APP_NAME:-skintyee-prod-deploy}"

DRY_RUN=0
YES=0

# ----- CLI flag parsing ------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)  DRY_RUN=1; shift ;;
    --yes|-y)   YES=1; shift ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)          die "unknown flag: $1 (use --help)" ;;
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
command -v az >/dev/null || die "az CLI not found on PATH"
command -v jq >/dev/null || die "jq not found on PATH"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

SUB_ID=$(az account show --query id -o tsv 2>/dev/null)
TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null)

# ----- verify shared infra exists --------------------------------------------
say "verifying shared infra exists (from setup-api-azure.sh)…"
az group show --name "$RG" --query name -o tsv >/dev/null 2>&1 \
  || die "resource group '$RG' not found — run scripts/setup-api-azure.sh first."
az acr show --name "$ACR" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1 \
  || die "ACR '$ACR' not found — run scripts/setup-api-azure.sh first."
az containerapp env show --name "$CAE_NAME" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1 \
  || die "Container Apps env '$CAE_NAME' not found — run scripts/setup-api-azure.sh first."
PUB_APP_ID=$(az ad app list --display-name "$PUBLISHER_APP_NAME" --query '[0].appId' -o tsv 2>/dev/null || echo "")
[ -n "$PUB_APP_ID" ] && [ "$PUB_APP_ID" != "null" ] \
  || die "deploy Entra app '$PUBLISHER_APP_NAME' not found — run scripts/setup-api-azure.sh first."
PUB_SP_ID=$(az ad sp list --filter "appId eq '$PUB_APP_ID'" --query '[0].id' -o tsv 2>/dev/null)
ok "shared infra ready (RG, ACR, env, deploy SP all found)"

ACR_ID=$(az acr show --name "$ACR" --query id -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name "$ACR" --query loginServer -o tsv)

# ----- print summary + confirm -----------------------------------------------

cat <<EOF

${CYAN}Skin Tyee lookup-api — Azure deploy setup${RST}

  Region:               $LOCATION
  Resource group:       $RG    (existing)
  Container Registry:   $ACR   (existing)
  Container Apps env:   $CAE_NAME    (existing)
  Deploy SP:            $PUBLISHER_APP_NAME → $PUB_APP_ID    (existing)

  ${YLW}NEW:${RST}
  lookup Container App: $CA_LOOKUP_NAME  →  https://$CA_LOOKUP_DOMAIN
                        always-on (min-replicas=1)
  ADO pipeline:         $ADO_PIPELINE_NAME (from $ADO_PIPELINE_YAML)
  Container App secret: ANTHROPIC_API_KEY (you'll be prompted)

EOF

if [ "$DRY_RUN" -eq 1 ]; then
  warn "DRY RUN — no Azure / ADO changes will be made."
elif [ "$YES" -ne 1 ]; then
  printf '  Proceed? [y/N] '
  read -r ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || die "aborted by user."
fi

# ----- 1) ANTHROPIC_API_KEY (prompt) -----------------------------------------
ANTHROPIC_API_KEY=""
if [ "$DRY_RUN" -eq 0 ]; then
  printf '  Anthropic API key (will be stored as a Container App secret): '
  read -rs ANTHROPIC_API_KEY; echo
  [ -n "$ANTHROPIC_API_KEY" ] || warn "  no key provided — Container App will fail at runtime until you add it."
fi

# ----- 2) Create lookup Container App ----------------------------------------
say "ensuring Container App '$CA_LOOKUP_NAME' (always-on, min-replicas=1)…"
CA_EXISTS=$(az containerapp show --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
  --query name -o tsv 2>/dev/null || echo "")
if [ -z "$CA_EXISTS" ]; then
  CREATE_CMD=(
    az containerapp create
      --resource-group "$RG"
      --name "$CA_LOOKUP_NAME"
      --environment "$CAE_NAME"
      --image "mcr.microsoft.com/k8se/quickstart:latest"
      --target-port 5050
      --ingress external
      --min-replicas 1
      --max-replicas 3
      --cpu 0.5 --memory 1.0Gi
      --system-assigned
      --only-show-errors
  )
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    CREATE_CMD+=(--secrets "anthropic-api-key=$ANTHROPIC_API_KEY")
    CREATE_CMD+=(--env-vars "ANTHROPIC_API_KEY=secretref:anthropic-api-key" "NODE_ENV=production")
  fi
  run "${CREATE_CMD[@]}" >/dev/null
  ok "Container App created"
else
  ok "Container App already exists"
  # Update the secret + env-var if the key was provided this run.
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    say "updating ANTHROPIC_API_KEY secret on existing Container App…"
    run az containerapp secret set \
      --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
      --secrets "anthropic-api-key=$ANTHROPIC_API_KEY" \
      --only-show-errors >/dev/null
    run az containerapp update \
      --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
      --set-env-vars "ANTHROPIC_API_KEY=secretref:anthropic-api-key" "NODE_ENV=production" \
      --only-show-errors >/dev/null
  fi
fi

# ----- 3) AcrPull for the lookup Container App's MI --------------------------
CA_MI_PRINCIPAL=$(az containerapp show --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
  --query identity.principalId -o tsv 2>/dev/null || echo "")
if [ -n "$CA_MI_PRINCIPAL" ]; then
  say "granting lookup Container App's MI AcrPull on the registry…"
  run az role assignment create \
    --assignee-object-id "$CA_MI_PRINCIPAL" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors >/dev/null 2>&1 || true
  run az containerapp registry set \
    --resource-group "$RG" --name "$CA_LOOKUP_NAME" \
    --server "$ACR_LOGIN_SERVER" \
    --identity system \
    --only-show-errors >/dev/null 2>&1 || true
  ok "AcrPull granted + registry configured"
fi

# ----- 4) Contributor for the deploy SP on this Container App ----------------
CA_RESOURCE_ID=$(az containerapp show --resource-group "$RG" --name "$CA_LOOKUP_NAME" --query id -o tsv 2>/dev/null)
say "granting deploy SP Contributor on $CA_LOOKUP_NAME…"
run az role assignment create \
  --assignee-object-id "$PUB_SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$CA_RESOURCE_ID" \
  --only-show-errors >/dev/null 2>&1 || true
ok "deploy SP Contributor granted"

# ----- 5) Add LOOKUP_CONTAINERAPP to the existing variable group -------------
say "adding LOOKUP_CONTAINERAPP variable to '$ADO_VG_NAME'…"
VG_ID=$(az pipelines variable-group list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
[ -n "$VG_ID" ] && [ "$VG_ID" != "null" ] \
  || die "variable group '$ADO_VG_NAME' not found — run setup-api-azure.sh first."

# variable-group variable create errors out if the var exists; update otherwise.
EXISTS=$(az pipelines variable-group variable list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --group-id "$VG_ID" --query 'LOOKUP_CONTAINERAPP.value' -o tsv 2>/dev/null || echo "")
if [ -z "$EXISTS" ]; then
  run az pipelines variable-group variable create \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --group-id "$VG_ID" \
    --name LOOKUP_CONTAINERAPP --value "$CA_LOOKUP_NAME" \
    --only-show-errors >/dev/null
else
  run az pipelines variable-group variable update \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --group-id "$VG_ID" \
    --name LOOKUP_CONTAINERAPP --value "$CA_LOOKUP_NAME" \
    --only-show-errors >/dev/null 2>&1 || true
fi
ok "LOOKUP_CONTAINERAPP=$CA_LOOKUP_NAME"

# ----- 6) Register the deploy pipeline ---------------------------------------
say "ensuring ADO pipeline '$ADO_PIPELINE_NAME' (from $ADO_PIPELINE_YAML)…"
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
    --only-show-errors >/dev/null
fi
ok "pipeline registered"

# ----- final summary ---------------------------------------------------------

cat <<EOF

${GRN}✔ done — lookup deploy infra ready.${RST}

What's left (one-time manual):

  1. ${CYAN}Custom domain for the lookup Container App${RST}:

       az containerapp hostname add \\
         --resource-group $RG --name $CA_LOOKUP_NAME \\
         --hostname $CA_LOOKUP_DOMAIN

     Add the printed TXT record under '$DNS_ZONE' in Azure DNS, then:

       az containerapp hostname bind \\
         --resource-group $RG --name $CA_LOOKUP_NAME \\
         --hostname $CA_LOOKUP_DOMAIN \\
         --environment $CAE_NAME \\
         --validation-method CNAME

  2. ${CYAN}Save the Anthropic API key to 1Password${RST} (IT/Admin vault) if you
     haven't already. The Container App stores it as an internal
     secret but 1Password is your audit trail.

  3. ${CYAN}First deploy${RST}:

       # touch any file under lookup/api/ + push to trigger
       git push azure master
       # Or run from ADO UI: $ADO_ORG_URL/$ADO_PROJECT/_build?definitionId=$P_ID

For more detail see docs/devops/deployment-plan.md.

EOF
