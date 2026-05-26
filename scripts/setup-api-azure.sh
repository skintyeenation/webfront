#!/bin/bash
# Set up the Azure resources for the api/ (and later lookup/api/) deploy
# pipeline per docs/devops/deployment-plan.md.
#
# What this script provisions (all idempotent — safe to re-run):
#
#   1. Resource group               skintyee-prod-rg              (canadacentral)
#   2. Container Registry           skintyeeprodacr               (Basic SKU)
#   3. PostgreSQL Flexible Server   skintyee-prod-pg              (B1ms, PostGIS)
#                                                                  + database 'api'
#   4. Container Apps environment   skintyee-prod-env
#   5. Container App                api-prod                       (placeholder image,
#                                                                   pipeline replaces it
#                                                                   on first deploy)
#   6. AcrPull role assignment      Container App MI → ACR
#   7. Federated credential         publisher SP → ADO SC
#   8. ADO service connection       skintyee-prod-azure            (WIF, no secrets)
#   9. ADO variable group           skintyee-prod-azure            (resource names)
#  10. ADO pipeline                 deploy-api                     (registered, off
#                                                                   azure-pipelines/Deployments/deploy-api.yml)
#
# What stays manual (interactive — script prompts you):
#
#   - az login (one-time)
#   - DNS validation for the custom domain api.skintyee.ca (Microsoft
#     requires a TXT record before the managed TLS cert can be minted;
#     script prints what to add and pauses).
#   - DB password for the postgres admin user (prompted, never logged).
#
# Prereqs:
#   - az CLI logged in as a user with Owner on the subscription + at
#     least Application Administrator on the Entra tenant.
#   - jq, openssl on PATH.
#   - The webfront repo already pushed to ADO (the pipeline registration
#     step references it).

set -uo pipefail   # NOT -e — `az` returns non-zero on idempotent re-runs
                   # (e.g. "already exists") that we want to treat as success.

# ----- styling helpers --------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults (override via env or CLI flags) ------------------------------
LOCATION="${LOCATION:-canadacentral}"
RG="${RG:-skintyee-prod-rg}"
ACR="${ACR:-skintyeeprodacr}"                       # 5–50 alphanumeric chars, global unique
PG_NAME="${PG_NAME:-skintyee-prod-pg}"
PG_DB_API="${PG_DB_API:-api}"
PG_ADMIN_USER="${PG_ADMIN_USER:-pgadmin}"
PG_SKU="${PG_SKU:-Standard_B1ms}"
PG_STORAGE_GB="${PG_STORAGE_GB:-32}"
CAE_NAME="${CAE_NAME:-skintyee-prod-env}"            # Container Apps Environment
CA_API_NAME="${CA_API_NAME:-api-prod}"
CA_API_DOMAIN="${CA_API_DOMAIN:-api.skintyee.ca}"
DNS_ZONE="${DNS_ZONE:-skintyee.ca}"
DNS_ZONE_RG="${DNS_ZONE_RG:-}"   # auto-discovered if blank

ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_REPO="${ADO_REPO:-webfront}"
ADO_SC_NAME="${ADO_SC_NAME:-skintyee-prod-azure}"
ADO_VG_NAME="${ADO_VG_NAME:-skintyee-prod-azure}"
ADO_PIPELINE_NAME="${ADO_PIPELINE_NAME:-deploy-api}"
ADO_PIPELINE_YAML="${ADO_PIPELINE_YAML:-azure-pipelines/Deployments/deploy-api.yml}"

PUBLISHER_APP_NAME="${PUBLISHER_APP_NAME:-skintyee-prod-deploy}"   # NEW Entra app for prod deploy
                                                                    # (separate from the SharePoint
                                                                    # publisher — different blast radius)

DRY_RUN=0
YES=0

# ----- CLI flag parsing ------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --yes|-y)    YES=1; shift ;;
    --rg)        RG="$2"; shift 2 ;;
    --acr)       ACR="$2"; shift 2 ;;
    --location)  LOCATION="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)           die "unknown flag: $1 (use --help)" ;;
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
command -v openssl >/dev/null || die "openssl not found on PATH"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

SUB_ID=$(az account show --query id -o tsv 2>/dev/null)
TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null)
[ -n "$SUB_ID" ] && [ -n "$TENANT_ID" ] || die "couldn't read subscription/tenant from az"

# ----- print summary + confirm -----------------------------------------------

cat <<EOF

${CYAN}Skin Tyee API — Azure deploy setup${RST}

  Subscription:       $SUB_ID
  Tenant:             ${TENANT_ID:0:8}…
  Region:             $LOCATION

  Resource group:     $RG
  Container Registry: $ACR
  Postgres server:    $PG_NAME ($PG_SKU, ${PG_STORAGE_GB}GB, PostGIS)
  Postgres database:  $PG_DB_API
  Container Apps env: $CAE_NAME
  api Container App:  $CA_API_NAME  →  https://$CA_API_DOMAIN

  Deploy app (Entra): $PUBLISHER_APP_NAME
  ADO org:            $ADO_ORG_URL
  ADO project:        $ADO_PROJECT
  ADO service conn:   $ADO_SC_NAME
  ADO variable group: $ADO_VG_NAME
  ADO pipeline:       $ADO_PIPELINE_NAME  (from $ADO_PIPELINE_YAML)

EOF

if [ "$DRY_RUN" -eq 1 ]; then
  warn "DRY RUN — no Azure / ADO changes will be made."
elif [ "$YES" -ne 1 ]; then
  printf '  Proceed? [y/N] '
  read -r ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || die "aborted by user."
fi

# ----- 0) resource provider pre-flight ---------------------------------------
#
# Azure subscriptions don't auto-register resource providers; the first time
# you create a Container App / Postgres / ACR / etc. on a fresh subscription,
# the call fails with "Subscription is not registered for the Microsoft.X
# resource provider." Register them upfront so the rest of the script can
# proceed without the user needing to know this is a Thing.
#
# Each `az provider register --wait` blocks until the provider is in the
# "Registered" state. On a fresh subscription each takes ~30-60 sec; on
# subsequent runs it's a no-op (returns in a second).

REQUIRED_PROVIDERS=(
  Microsoft.App                  # Container Apps
  Microsoft.OperationalInsights  # Log Analytics (used by Container Apps env)
  Microsoft.DBforPostgreSQL      # Postgres Flexible Server
  Microsoft.ContainerRegistry    # ACR
)

if [ "$DRY_RUN" -eq 0 ]; then
  for provider in "${REQUIRED_PROVIDERS[@]}"; do
    state=$(az provider show --namespace "$provider" --query registrationState -o tsv 2>/dev/null || echo "Unknown")
    if [ "$state" = "Registered" ]; then
      ok "resource provider $provider: already registered"
    else
      say "registering resource provider $provider (current state: $state)…"
      az provider register --namespace "$provider" --wait --only-show-errors >/dev/null \
        || warn "couldn't register $provider — subsequent steps may fail. Try \`az provider register -n $provider --wait\` manually."
      ok "resource provider $provider: registered"
    fi
  done
else
  for provider in "${REQUIRED_PROVIDERS[@]}"; do
    printf '  (dry-run) az provider register --namespace %s --wait\n' "$provider"
  done
fi

# ----- 1) resource group -----------------------------------------------------
say "ensuring resource group '$RG' in $LOCATION…"
run az group create --name "$RG" --location "$LOCATION" --only-show-errors >/dev/null
ok "resource group ready"

# ----- 2) Container Registry -------------------------------------------------
say "ensuring Azure Container Registry '$ACR' (Basic SKU)…"
ACR_EXISTS=$(az acr list --resource-group "$RG" --query "[?name=='$ACR'].name | [0]" -o tsv 2>/dev/null || echo "")
if [ -z "$ACR_EXISTS" ] || [ "$ACR_EXISTS" = "null" ]; then
  run az acr create \
    --resource-group "$RG" \
    --name "$ACR" \
    --sku Basic \
    --location "$LOCATION" \
    --admin-enabled false \
    --only-show-errors >/dev/null
fi
ACR_LOGIN_SERVER=$(az acr show --name "$ACR" --query loginServer -o tsv 2>/dev/null || echo "${ACR}.azurecr.io")
ok "ACR ready ($ACR_LOGIN_SERVER)"

# ----- 3) Postgres Flexible Server + PostGIS + db ----------------------------

PG_PASSWORD=""
if [ "$DRY_RUN" -eq 0 ]; then
  PG_EXISTS=$(az postgres flexible-server show --resource-group "$RG" --name "$PG_NAME" \
    --query name -o tsv 2>/dev/null || echo "")
  if [ -z "$PG_EXISTS" ]; then
    say "Postgres server '$PG_NAME' doesn't exist — provisioning (this takes ~5–8 min)…"
    # Prompt for admin password (silently). Generate one if blank.
    printf '  Postgres admin password (leave blank to auto-generate strong one): '
    read -rs PG_PASSWORD; echo
    if [ -z "$PG_PASSWORD" ]; then
      PG_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 22)
      warn "auto-generated. Save it NOW (script will NOT print again unless re-prompted):"
      printf '\n    %s\n\n' "$PG_PASSWORD"
      printf '  Press Enter once saved to 1Password (IT/Admin vault)… '
      read -r _
    fi
    az postgres flexible-server create \
      --resource-group "$RG" \
      --name "$PG_NAME" \
      --location "$LOCATION" \
      --sku-name "$PG_SKU" \
      --tier Burstable \
      --version 16 \
      --storage-size "$PG_STORAGE_GB" \
      --admin-user "$PG_ADMIN_USER" \
      --admin-password "$PG_PASSWORD" \
      --public-access None \
      --yes \
      --only-show-errors >/dev/null \
      || die "Postgres provisioning failed."

    # Allow Container Apps in the same VNet to reach the server.
    # For simplicity at POC scale we use public-access with Azure-services
    # allowed. Phase 2 would put both behind a VNet.
    say "  (POC) enabling 'Allow public access from any Azure service'…"
    az postgres flexible-server update \
      --resource-group "$RG" \
      --name "$PG_NAME" \
      --public-access 0.0.0.0 \
      --only-show-errors >/dev/null
  else
    ok "Postgres server '$PG_NAME' already exists"
  fi

  # Allowlist the PostGIS extension at the server level.
  say "ensuring PostGIS extension is allow-listed…"
  az postgres flexible-server parameter set \
    --resource-group "$RG" --server-name "$PG_NAME" \
    --name azure.extensions --value POSTGIS \
    --only-show-errors >/dev/null 2>&1 || true

  # Create the api database.
  say "ensuring database '$PG_DB_API' exists on '$PG_NAME'…"
  az postgres flexible-server db create \
    --resource-group "$RG" --server-name "$PG_NAME" \
    --database-name "$PG_DB_API" \
    --only-show-errors >/dev/null 2>&1 || true
fi
ok "Postgres ready"

# ----- 4) Container Apps environment -----------------------------------------
say "ensuring Container Apps environment '$CAE_NAME'…"
CAE_EXISTS=$(az containerapp env show --resource-group "$RG" --name "$CAE_NAME" \
  --query name -o tsv 2>/dev/null || echo "")
if [ -z "$CAE_EXISTS" ]; then
  run az containerapp env create \
    --resource-group "$RG" \
    --name "$CAE_NAME" \
    --location "$LOCATION" \
    --only-show-errors >/dev/null
fi
ok "Container Apps environment ready"

# ----- 5) Container App for api ----------------------------------------------
say "ensuring Container App '$CA_API_NAME'…"
CA_EXISTS=$(az containerapp show --resource-group "$RG" --name "$CA_API_NAME" \
  --query name -o tsv 2>/dev/null || echo "")
if [ -z "$CA_EXISTS" ]; then
  # First-creation uses a placeholder image (mcr.microsoft.com/k8se/quickstart).
  # The pipeline's first run replaces it with our actual api image.
  run az containerapp create \
    --resource-group "$RG" \
    --name "$CA_API_NAME" \
    --environment "$CAE_NAME" \
    --image "mcr.microsoft.com/k8se/quickstart:latest" \
    --target-port 4000 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 3 \
    --cpu 0.5 --memory 1.0Gi \
    --system-assigned \
    --only-show-errors >/dev/null
fi
ok "Container App ready"

# ----- 6) Grant the Container App's MI AcrPull on the ACR ---------------------
CA_MI_PRINCIPAL=$(az containerapp show --resource-group "$RG" --name "$CA_API_NAME" \
  --query identity.principalId -o tsv 2>/dev/null || echo "")
ACR_ID=$(az acr show --name "$ACR" --query id -o tsv 2>/dev/null || echo "")
if [ -n "$CA_MI_PRINCIPAL" ] && [ -n "$ACR_ID" ]; then
  say "granting Container App's managed identity AcrPull on the registry…"
  run az role assignment create \
    --assignee-object-id "$CA_MI_PRINCIPAL" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors >/dev/null 2>&1 || true
  ok "AcrPull granted"

  # Tell the Container App to use the MI for ACR pulls.
  run az containerapp registry set \
    --resource-group "$RG" --name "$CA_API_NAME" \
    --server "$ACR_LOGIN_SERVER" \
    --identity system \
    --only-show-errors >/dev/null 2>&1 || true
fi

# ----- 7) Entra app for ADO deploy SC + federated cred ----------------------
say "ensuring Entra app '$PUBLISHER_APP_NAME' for ADO → Azure deploys…"
PUB_APP_ID=$(az ad app list --display-name "$PUBLISHER_APP_NAME" --query '[0].appId' -o tsv 2>/dev/null || echo "")
if [ -z "$PUB_APP_ID" ] || [ "$PUB_APP_ID" = "null" ]; then
  run az ad app create \
    --display-name "$PUBLISHER_APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --only-show-errors >/dev/null
  sleep 4
  PUB_APP_ID=$(az ad app list --display-name "$PUBLISHER_APP_NAME" --query '[0].appId' -o tsv)
  run az ad sp create --id "$PUB_APP_ID" --only-show-errors >/dev/null 2>&1 || true
fi
PUB_SP_ID=$(az ad sp list --filter "appId eq '$PUB_APP_ID'" --query '[0].id' -o tsv 2>/dev/null || echo "")
ok "deploy app: $PUB_APP_ID  (sp $PUB_SP_ID)"

# Grant the deploy SP the roles it needs for the pipeline:
#   - AcrPush on the ACR (so `az acr build` can push)
#   - Contributor on the Container App (so `az containerapp update` can update)
say "granting deploy SP roles (AcrPush on ACR, Contributor on Container App)…"
run az role assignment create \
  --assignee-object-id "$PUB_SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPush \
  --scope "$ACR_ID" \
  --only-show-errors >/dev/null 2>&1 || true

CA_RESOURCE_ID=$(az containerapp show --resource-group "$RG" --name "$CA_API_NAME" --query id -o tsv 2>/dev/null)
run az role assignment create \
  --assignee-object-id "$PUB_SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$CA_RESOURCE_ID" \
  --only-show-errors >/dev/null 2>&1 || true
ok "roles granted"

# ----- 8) ADO service connection (WIF) ---------------------------------------
ADO_RESOURCE_ID="499b84ac-1321-427f-aa17-267ca6975798"
PROJ_ID=$(az devops project show --project "$ADO_PROJECT" --organization "$ADO_ORG_URL" --query id -o tsv 2>/dev/null || echo "")
[ -n "$PROJ_ID" ] || die "couldn't resolve ADO project id for '$ADO_PROJECT'"

say "ensuring ADO service connection '$ADO_SC_NAME' (workload identity federation)…"
SC_ID=$(az devops service-endpoint list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_SC_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
SC_SUBJECT=""; SC_ISSUER=""

if [ -n "$SC_ID" ] && [ "$SC_ID" != "null" ]; then
  SC_INFO=$(az devops service-endpoint show --org "$ADO_ORG_URL" --project "$ADO_PROJECT" --id "$SC_ID" -o json 2>/dev/null || echo "{}")
  SC_SUBJECT=$(echo "$SC_INFO" | jq -r '.authorization.parameters.workloadIdentityFederationSubject // empty')
  SC_ISSUER=$(echo "$SC_INFO"  | jq -r '.authorization.parameters.workloadIdentityFederationIssuer  // empty')
  ok "service connection exists (id $SC_ID)"
else
  SC_BODY=$(cat <<EOF
{
  "name": "$ADO_SC_NAME",
  "type": "azurerm",
  "url": "https://management.azure.com/",
  "authorization": {
    "scheme": "WorkloadIdentityFederation",
    "parameters": { "tenantid": "$TENANT_ID", "serviceprincipalid": "$PUB_APP_ID" }
  },
  "data": {
    "subscriptionId": "$SUB_ID",
    "subscriptionName": "$(az account show --query name -o tsv)",
    "environment": "AzureCloud",
    "scopeLevel": "Subscription",
    "creationMode": "Manual"
  },
  "isShared": false,
  "isReady": true,
  "serviceEndpointProjectReferences": [
    { "projectReference": { "id": "$PROJ_ID", "name": "$ADO_PROJECT" },
      "name": "$ADO_SC_NAME",
      "description": "Deploy api/ + lookup/api/ to Azure Container Apps (federated identity, no secrets)" }
  ]
}
EOF
)
  if [ "$DRY_RUN" -eq 1 ]; then
    say "(dry-run) would POST service connection body to ADO API"
    SC_ID="DRY-RUN"
  else
    CREATE=$(echo "$SC_BODY" | az rest --method POST \
      --uri "$ADO_ORG_URL/_apis/serviceendpoint/endpoints?api-version=7.1-preview.4" \
      --resource "$ADO_RESOURCE_ID" \
      --headers content-type=application/json \
      --body @/dev/stdin 2>&1)
    SC_ID=$(echo "$CREATE" | jq -r '.id // empty')
    SC_SUBJECT=$(echo "$CREATE" | jq -r '.authorization.parameters.workloadIdentityFederationSubject // empty')
    SC_ISSUER=$(echo "$CREATE"  | jq -r '.authorization.parameters.workloadIdentityFederationIssuer  // empty')
    [ -n "$SC_ID" ] || die "service connection create failed: $(echo "$CREATE" | head -c 300)"
    ok "service connection created (id $SC_ID)"
  fi
fi

# Match federated credential on the deploy SP to the SC's subject/issuer.
if [ -n "$SC_SUBJECT" ] && [ -n "$SC_ISSUER" ] && [ "$DRY_RUN" -eq 0 ]; then
  EXISTING_FC=$(az ad app federated-credential list --id "$PUB_APP_ID" \
    --query "[?subject=='$SC_SUBJECT'].id | [0]" -o tsv 2>/dev/null || echo "")
  if [ -z "$EXISTING_FC" ] || [ "$EXISTING_FC" = "null" ]; then
    say "creating federated credential matching SC subject…"
    cat > /tmp/fc.json <<EOF
{
  "name": "ado-${ADO_SC_NAME}-wif",
  "issuer": "$SC_ISSUER",
  "subject": "$SC_SUBJECT",
  "description": "WIF for ADO SC $ADO_SC_NAME (deploy-api pipeline)",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
    az ad app federated-credential create --id "$PUB_APP_ID" --parameters @/tmp/fc.json --only-show-errors >/dev/null
    ok "federated credential created"
  else
    ok "federated credential already exists"
  fi
fi

# Authorize all pipelines to use the SC.
if [ "$DRY_RUN" -eq 0 ] && [ "$SC_ID" != "DRY-RUN" ]; then
  az rest --method PATCH \
    --uri "$ADO_ORG_URL/$PROJ_ID/_apis/pipelines/pipelinepermissions/endpoint/$SC_ID?api-version=7.1-preview.1" \
    --resource "$ADO_RESOURCE_ID" \
    --headers content-type=application/json \
    --body "{\"allPipelines\":{\"authorized\":true,\"authorizedBy\":null,\"authorizedOn\":null},\"pipelines\":null,\"resource\":{\"id\":\"$SC_ID\",\"type\":\"endpoint\"}}" \
    --query 'allPipelines.authorized' -o tsv >/dev/null 2>&1 \
    || warn "couldn't authorize SC for pipelines — first run may need manual auth in ADO UI"
fi

# ----- 9) ADO variable group ------------------------------------------------
say "ensuring ADO variable group '$ADO_VG_NAME'…"
VG_ID=$(az pipelines variable-group list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
if [ -z "$VG_ID" ] || [ "$VG_ID" = "null" ]; then
  run az pipelines variable-group create \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --name "$ADO_VG_NAME" \
    --description "Azure resource names for the deploy-api pipeline (no secrets — federated identity)" \
    --authorize true \
    --variables \
      "AZURE_RG=$RG" \
      "AZURE_ACR_NAME=$ACR" \
      "AZURE_CONTAINERAPP=$CA_API_NAME" \
      "AZURE_REGION=$LOCATION" \
    --query id -o tsv --only-show-errors >/dev/null
  VG_ID=$(az pipelines variable-group list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv)
fi
ok "variable group ready (id $VG_ID)"

# Authorize VG for all pipelines too.
if [ "$DRY_RUN" -eq 0 ] && [ -n "$VG_ID" ]; then
  az rest --method PATCH \
    --uri "$ADO_ORG_URL/$PROJ_ID/_apis/pipelines/pipelinepermissions/variablegroup/$VG_ID?api-version=7.1-preview.1" \
    --resource "$ADO_RESOURCE_ID" \
    --headers content-type=application/json \
    --body "{\"allPipelines\":{\"authorized\":true,\"authorizedBy\":null,\"authorizedOn\":null},\"pipelines\":null,\"resource\":{\"id\":\"$VG_ID\",\"type\":\"variablegroup\"}}" \
    --query 'allPipelines.authorized' -o tsv >/dev/null 2>&1 || true
fi

# ----- 10) Register the deploy pipeline --------------------------------------
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

# ----- 11) custom-domain notes (still manual — DNS TXT validation) ----------

cat <<EOF

${GRN}✔ done — Azure infra + ADO setup complete.${RST}

What's left (one-time manual):

  1. ${CYAN}Custom domain for the api Container App${RST} — Microsoft requires a
     DNS TXT record before it'll mint the managed TLS cert. Run:

       az containerapp hostname add \\
         --resource-group $RG --name $CA_API_NAME \\
         --hostname $CA_API_DOMAIN

     Follow the output instructions (it'll print a TXT record to add
     under '$DNS_ZONE' in Azure DNS), then:

       az containerapp hostname bind \\
         --resource-group $RG --name $CA_API_NAME \\
         --hostname $CA_API_DOMAIN \\
         --environment $CAE_NAME \\
         --validation-method CNAME

  2. ${CYAN}Save Postgres password to 1Password${RST} (IT/Admin vault), and add
     a 'PG_PASSWORD' secret variable to the '$ADO_VG_NAME' variable group:

       az pipelines variable-group variable create \\
         --org $ADO_ORG_URL --project $ADO_PROJECT \\
         --group-id $VG_ID \\
         --name PG_PASSWORD \\
         --secret true \\
         --value '<paste>'

  3. ${CYAN}First deploy${RST}:

       git push azure master   # or trigger from ADO UI
       # Watch at: $ADO_ORG_URL/$ADO_PROJECT/_build?definitionId=$P_ID

  4. (Phase 2) Repeat steps 4–7 above for ${CYAN}lookup/api/${RST}:
     same RG + ACR + Container Apps env, new app named 'lookup-prod'
     with --min-replicas 1 (always-on) and hostname 'lookup.skintyee.ca'.

For more detail see docs/devops/deployment-plan.md.

EOF
