#!/bin/bash
# Provision the shared cloud-side backup infrastructure for Skin Tyee:
#
#   • Storage account `skintyeebackups` (Cool tier, LRS, canadacentral)
#   • Five containers, each with 90-day immutability + write-only SAS:
#       m365-email-archive        — Exchange Online
#       m365-sharepoint-archive   — SharePoint (future workload)
#       entra-snapshots           — Entra ID (future workload)
#       azure-snapshots           — Azure resource config (future workload)
#       postgres-dumps            — Postgres pg_dump (Phase 2 workload)
#   • Application Insights `ai-backup` for heartbeat metrics
#   • Action Group `ag-backup-critical` — SMS + voice + email
#   • Two alert rules: missing heartbeat (36h) + explicit failure
#   • Entra app `skintyee-m365-backup` (workload 1 — the only one being
#     stood up first; other workloads' Entra apps get added later)
#
# Replaces what was originally scoped as 5 separate per-workload setup
# scripts. Per docs/devops/backup-architecture.md: one script, one set
# of shared infrastructure, then each workload just plugs in.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/setup-backup-cloud.sh                    # interactive
#   bash scripts/setup-backup-cloud.sh --dry-run          # preview az calls
#   SMS_PHONE='+1-250-555-0100' VOICE_PHONE='+1-250-555-0100' \
#     ALERT_EMAIL='it@skintyee.ca' bash scripts/setup-backup-cloud.sh
#                                                         # non-interactive

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults (match docs/devops/backup-architecture.md) ------------------
RG="${RG:-skintyee-prod-rg}"
LOCATION="${LOCATION:-canadacentral}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-skintyeebackups}"
AI_NAME="${AI_NAME:-ai-backup}"
AG_NAME="${AG_NAME:-ag-backup-critical}"
AG_SHORT_NAME="${AG_SHORT_NAME:-SkBackup}"   # max 12 chars; SMS sender id
M365_APP_DISPLAY="${M365_APP_DISPLAY:-skintyee-m365-backup}"

IMMUTABILITY_DAYS="${IMMUTABILITY_DAYS:-90}"
SAS_EXPIRY_YEARS="${SAS_EXPIRY_YEARS:-1}"

# Five containers (workload → container map; see backup-architecture.md)
CONTAINERS=(
  "m365-email-archive"
  "m365-sharepoint-archive"
  "entra-snapshots"
  "azure-snapshots"
  "postgres-dumps"
)

# Microsoft Graph permission IDs (application, not delegated)
# Mail.Read, Calendars.Read, Contacts.Read, User.Read.All
GRAPH_RESOURCE_ID="00000003-0000-0000-c000-000000000046"
M365_PERMS=(
  "810c84a8-4a9e-49e6-bf7d-12d183f40d01"  # Mail.Read
  "798ee544-9d2d-430c-a058-570e29e34338"  # Calendars.Read
  "089fe4d0-434a-44c5-8827-41ba8a0b17f5"  # Contacts.Read
  "df021288-bdef-4463-88db-98f22de89214"  # User.Read.All
)

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

# ----- prereq checks --------------------------------------------------------
command -v az >/dev/null || die "az CLI not found"
command -v jq >/dev/null || die "jq not found (brew install jq)"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

SUB_ID=$(az account show --query id -o tsv 2>/dev/null)
TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null)
say "subscription:  $SUB_ID"
say "tenant:        $TENANT_ID"

if [ "${DRY_RUN}" -eq 0 ]; then
  EXISTS_RG=$(az group exists --name "$RG" 2>/dev/null)
  if [ "$EXISTS_RG" != "true" ]; then
    die "resource group '$RG' doesn't exist — run scripts/setup-api-azure.sh first"
  fi
  ok "resource group $RG exists"
fi

# ----- 1) Pre-flight: register resource providers ---------------------------
say "registering Azure resource providers (idempotent)…"
for PROVIDER in Microsoft.Storage Microsoft.Insights Microsoft.AlertsManagement; do
  STATE=$(az provider show --namespace "$PROVIDER" --query registrationState -o tsv 2>/dev/null || echo "")
  if [ "$STATE" = "Registered" ]; then
    ok "$PROVIDER already Registered"
  else
    run az provider register --namespace "$PROVIDER" --only-show-errors --wait \
      && ok "$PROVIDER → Registered" \
      || warn "couldn't register $PROVIDER (may need explicit sub-Owner role)"
  fi
done

# ----- 2) Storage account ---------------------------------------------------
say "creating storage account ${STORAGE_ACCOUNT}…"
if [ "${DRY_RUN}" -eq 0 ] && az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" >/dev/null 2>&1; then
  ok "$STORAGE_ACCOUNT already exists"
else
  # Verify global uniqueness BEFORE attempting to create — saves an error message
  AVAILABLE=$(az storage account check-name --name "$STORAGE_ACCOUNT" --query nameAvailable -o tsv 2>/dev/null)
  if [ "$AVAILABLE" = "false" ] && [ "$DRY_RUN" -eq 0 ]; then
    REASON=$(az storage account check-name --name "$STORAGE_ACCOUNT" --query reason -o tsv 2>/dev/null)
    [ "$REASON" = "AlreadyExists" ] || die "name '$STORAGE_ACCOUNT' not available: $REASON"
    warn "$STORAGE_ACCOUNT exists in another sub/tenant — verifying we own it"
    az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" >/dev/null 2>&1 \
      || die "$STORAGE_ACCOUNT is taken by someone else; pick a different name"
  fi
  run az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --access-tier Cool \
    --allow-blob-public-access false \
    --min-tls-version TLS1_2 \
    --only-show-errors >/dev/null \
    || die "couldn't create storage account"
  ok "$STORAGE_ACCOUNT created (Cool, LRS, ${LOCATION})"
fi

# Enable blob versioning + soft delete (30-day) on the account so we have a
# safety net for newly-written blobs whose immutability hasn't kicked in yet.
if [ "${DRY_RUN}" -eq 0 ]; then
  run az storage account blob-service-properties update \
    --account-name "$STORAGE_ACCOUNT" --resource-group "$RG" \
    --enable-versioning true \
    --enable-delete-retention true \
    --delete-retention-days 30 \
    --only-show-errors >/dev/null \
    && ok "versioning + 30-day soft delete enabled" \
    || warn "couldn't update blob service properties (may already be set)"
fi

# Storage account key (used only by this script to provision the containers
# + their SAS tokens; we don't write the key anywhere)
if [ "${DRY_RUN}" -eq 0 ]; then
  STORAGE_KEY=$(az storage account keys list \
    --account-name "$STORAGE_ACCOUNT" --resource-group "$RG" \
    --query '[0].value' -o tsv 2>/dev/null)
  [ -n "$STORAGE_KEY" ] || die "couldn't read storage account key"
fi

# ----- 3) Containers + immutability + SAS -----------------------------------
declare -A CONTAINER_SAS
for CONTAINER in "${CONTAINERS[@]}"; do
  say "container ${CONTAINER}…"
  if [ "${DRY_RUN}" -eq 0 ] && az storage container show \
       --name "$CONTAINER" --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
       >/dev/null 2>&1; then
    ok "$CONTAINER already exists"
  else
    run az storage container create \
      --name "$CONTAINER" \
      --account-name "$STORAGE_ACCOUNT" \
      --account-key "$STORAGE_KEY" \
      --public-access off \
      --only-show-errors >/dev/null \
      && ok "$CONTAINER created" \
      || warn "couldn't create $CONTAINER (may already exist)"
  fi

  # 90-day legal-hold immutability policy
  # NB: once locked, NEVER deletable. We create as unlocked (extendable + can be
  # increased; can also be deleted while unlocked). Lock manually only when
  # we're certain the policy is right.
  if [ "${DRY_RUN}" -eq 0 ]; then
    EXISTING=$(az storage container immutability-policy show \
      --account-name "$STORAGE_ACCOUNT" --container-name "$CONTAINER" \
      --query immutabilityPeriodSinceCreationInDays -o tsv 2>/dev/null || echo "")
    if [ "$EXISTING" = "$IMMUTABILITY_DAYS" ]; then
      ok "  immutability policy already $IMMUTABILITY_DAYS days"
    else
      run az storage container immutability-policy create \
        --account-name "$STORAGE_ACCOUNT" \
        --container-name "$CONTAINER" \
        --period "$IMMUTABILITY_DAYS" \
        --only-show-errors >/dev/null \
        && ok "  immutability policy set ($IMMUTABILITY_DAYS-day legal hold; unlocked — lock when ready)" \
        || warn "  couldn't set immutability policy (may need separate ARM call)"
    fi
  fi

  # Generate a write-only SAS for this container.
  # Permissions: c=create, w=write — no read, no delete.
  # Combined with the immutability policy, the SAS holder can ONLY add new
  # blobs; not modify existing, not delete, not read back.
  if [ "${DRY_RUN}" -eq 0 ]; then
    EXPIRY=$(date -u -v+${SAS_EXPIRY_YEARS}y '+%Y-%m-%dT%H:%MZ' 2>/dev/null || \
             date -u -d "+${SAS_EXPIRY_YEARS} year" '+%Y-%m-%dT%H:%MZ')
    SAS=$(az storage container generate-sas \
      --account-name "$STORAGE_ACCOUNT" \
      --account-key "$STORAGE_KEY" \
      --name "$CONTAINER" \
      --permissions cw \
      --expiry "$EXPIRY" \
      --https-only \
      -o tsv 2>/dev/null)
    if [ -n "$SAS" ]; then
      CONTAINER_SAS["$CONTAINER"]="$SAS"
      ok "  write-only SAS generated (expires $EXPIRY)"
    else
      warn "  couldn't generate SAS for $CONTAINER"
    fi
  else
    CONTAINER_SAS["$CONTAINER"]="DRY-RUN-PLACEHOLDER"
  fi
done

# ----- 4) Application Insights ---------------------------------------------
say "creating Application Insights ${AI_NAME}…"
if [ "${DRY_RUN}" -eq 0 ] && az monitor app-insights component show \
     --app "$AI_NAME" --resource-group "$RG" >/dev/null 2>&1; then
  ok "$AI_NAME already exists"
else
  run az monitor app-insights component create \
    --app "$AI_NAME" \
    --location "$LOCATION" \
    --resource-group "$RG" \
    --application-type other \
    --only-show-errors >/dev/null \
    && ok "$AI_NAME created" \
    || warn "couldn't create $AI_NAME (extension may need install: 'az extension add -n application-insights')"
fi

if [ "${DRY_RUN}" -eq 0 ]; then
  AI_CONN=$(az monitor app-insights component show \
    --app "$AI_NAME" --resource-group "$RG" \
    --query connectionString -o tsv 2>/dev/null)
  AI_KEY=$(az monitor app-insights component show \
    --app "$AI_NAME" --resource-group "$RG" \
    --query instrumentationKey -o tsv 2>/dev/null)
  AI_ID=$(az monitor app-insights component show \
    --app "$AI_NAME" --resource-group "$RG" \
    --query id -o tsv 2>/dev/null)
fi

# ----- 5) Action Group (SMS + voice + email) -------------------------------
SMS_PHONE="${SMS_PHONE:-}"
VOICE_PHONE="${VOICE_PHONE:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

if [ -z "$SMS_PHONE" ] && [ "$DRY_RUN" -eq 0 ]; then
  printf '\n%sAction Group contact info%s (press Enter to skip a channel — but every channel skipped is a notification path we lose):\n\n' "$CYAN" "$RST"
  read -rp '  SMS phone (country-code+number, e.g. 12505550100): ' SMS_PHONE
  read -rp '  Voice call phone (same format; can match SMS): ' VOICE_PHONE
  read -rp '  Alert email (e.g. it@skintyee.ca): ' ALERT_EMAIL
fi

say "creating Action Group ${AG_NAME}…"
ACTIONS=()
if [ -n "$SMS_PHONE" ]; then
  SMS_CC="${SMS_PHONE:0:1}"
  SMS_NUM="${SMS_PHONE:1}"
  ACTIONS+=(--action sms     it-lead-sms     "$SMS_CC"   "$SMS_NUM")
fi
if [ -n "$VOICE_PHONE" ]; then
  VOICE_CC="${VOICE_PHONE:0:1}"
  VOICE_NUM="${VOICE_PHONE:1}"
  ACTIONS+=(--action voice   it-lead-voice   "$VOICE_CC" "$VOICE_NUM")
fi
if [ -n "$ALERT_EMAIL" ]; then
  ACTIONS+=(--action email   it-lead-email   "$ALERT_EMAIL")
fi

if [ "${DRY_RUN}" -eq 0 ] && az monitor action-group show \
     --name "$AG_NAME" --resource-group "$RG" >/dev/null 2>&1; then
  ok "$AG_NAME already exists — updating receivers"
  if [ ${#ACTIONS[@]} -gt 0 ]; then
    run az monitor action-group update \
      --name "$AG_NAME" \
      --resource-group "$RG" \
      "${ACTIONS[@]}" \
      --only-show-errors >/dev/null \
      || warn "couldn't update Action Group receivers"
  fi
else
  if [ ${#ACTIONS[@]} -eq 0 ]; then
    warn "no contact channels provided — creating empty Action Group (you must add receivers manually)"
    run az monitor action-group create \
      --name "$AG_NAME" \
      --resource-group "$RG" \
      --short-name "$AG_SHORT_NAME" \
      --only-show-errors >/dev/null \
      || warn "couldn't create empty Action Group"
  else
    run az monitor action-group create \
      --name "$AG_NAME" \
      --resource-group "$RG" \
      --short-name "$AG_SHORT_NAME" \
      "${ACTIONS[@]}" \
      --only-show-errors >/dev/null \
      && ok "$AG_NAME created with ${#ACTIONS[@]} channel(s)" \
      || warn "couldn't create Action Group"
  fi
fi

# Quick test of the alerting path (sends real notifications — DON'T skip this)
if [ "$DRY_RUN" -eq 0 ] && [ ${#ACTIONS[@]} -gt 0 ]; then
  printf '\n%sTest the alerting path now?%s This sends a real SMS + voice call + email.\n' "$YLW" "$RST"
  read -rp '  Send test notifications now? [y/N] ' TEST_AG
  if [ "${TEST_AG:-N}" = "y" ] || [ "${TEST_AG:-N}" = "Y" ]; then
    AG_ID=$(az monitor action-group show --name "$AG_NAME" --resource-group "$RG" --query id -o tsv)
    az rest --method post \
      --uri "https://management.azure.com${AG_ID}/createNotifications?api-version=2021-09-01" \
      --body '{"alertType":"servicehealth"}' \
      --only-show-errors >/dev/null 2>&1 \
      && ok "test notification triggered — check SMS/phone/email arrive" \
      || warn "couldn't trigger test (check manually with: az monitor action-group test-notifications create)"
  fi
fi

# ----- 6) Alert rules: missing heartbeat + explicit failure ----------------
say "creating alert rules…"
if [ "$DRY_RUN" -eq 0 ] && [ -n "${AI_ID:-}" ]; then
  AG_ID=$(az monitor action-group show --name "$AG_NAME" --resource-group "$RG" --query id -o tsv 2>/dev/null)

  for ALERT in \
      "m365-backup-missing-heartbeat:m365_backup_success_total:36h:Critical:M365 nightly backup heartbeat missed for >36 hours — investigate immediately" \
      "m365-backup-failed:m365_backup_failure_total:24h:Sev2:M365 backup explicitly reported failure" \
      ; do
    NAME="${ALERT%%:*}"
    REST="${ALERT#*:}"
    METRIC="${REST%%:*}"
    REST="${REST#*:}"
    WINDOW="${REST%%:*}"
    REST="${REST#*:}"
    SEV="${REST%%:*}"
    DESC="${REST#*:}"

    if az monitor metrics alert show --name "$NAME" --resource-group "$RG" >/dev/null 2>&1; then
      ok "$NAME already exists"
    else
      # Pre-create with a placeholder condition; the script that pushes the
      # heartbeat metric defines the metric on first call.
      run az monitor metrics alert create \
        --name "$NAME" \
        --resource-group "$RG" \
        --scopes "$AI_ID" \
        --action "$AG_ID" \
        --window-size "$WINDOW" \
        --evaluation-frequency 1h \
        --severity 1 \
        --description "$DESC" \
        --condition "total customMetrics/${METRIC} < 1" \
        --only-show-errors >/dev/null \
        && ok "$NAME created" \
        || warn "couldn't create alert $NAME (custom-metrics alerts may need the metric to exist first; re-run after first heartbeat)"
    fi
  done
fi

# ----- 7) Entra app for M365 backup (workload 1) ---------------------------
say "creating Entra app ${M365_APP_DISPLAY}…"
M365_APP_ID=$(az ad app list --display-name "$M365_APP_DISPLAY" --query '[0].appId' -o tsv 2>/dev/null || echo "")
if [ -z "$M365_APP_ID" ]; then
  if [ "$DRY_RUN" -eq 0 ]; then
    M365_APP_ID=$(az ad app create \
      --display-name "$M365_APP_DISPLAY" \
      --sign-in-audience AzureADMyOrg \
      --query appId -o tsv 2>/dev/null)
    [ -n "$M365_APP_ID" ] || die "couldn't create app $M365_APP_DISPLAY"
    ok "Entra app created: $M365_APP_ID"
  else
    M365_APP_ID="00000000-0000-0000-0000-DRYRUN0000ID"
    printf '  (dry-run) az ad app create --display-name %s\n' "$M365_APP_DISPLAY"
  fi
else
  ok "$M365_APP_DISPLAY already exists ($M365_APP_ID)"
fi

# Create SP (idempotent)
if [ "$DRY_RUN" -eq 0 ]; then
  az ad sp show --id "$M365_APP_ID" >/dev/null 2>&1 \
    || az ad sp create --id "$M365_APP_ID" --only-show-errors >/dev/null 2>&1 \
    || warn "couldn't create SP (may already exist)"
fi

# Add the 4 application permissions
say "  adding 4 Microsoft Graph permissions (Mail.Read, Calendars.Read, Contacts.Read, User.Read.All)…"
for PERM_ID in "${M365_PERMS[@]}"; do
  run az ad app permission add \
    --id "$M365_APP_ID" \
    --api "$GRAPH_RESOURCE_ID" \
    --api-permissions "${PERM_ID}=Role" \
    --only-show-errors 2>/dev/null
done

# Admin consent (interactive — opens browser if not already signed in as admin)
say "  granting admin consent (interactive — may open a browser)…"
if [ "$DRY_RUN" -eq 0 ]; then
  az ad app permission admin-consent --id "$M365_APP_ID" --only-show-errors 2>/dev/null \
    && ok "admin consent granted" \
    || warn "couldn't grant admin consent (you may need to do this manually in the Entra portal)"
fi

# Client secret (24-month expiry)
say "  creating client secret (24-month expiry)…"
if [ "$DRY_RUN" -eq 0 ]; then
  SECRET_JSON=$(az ad app credential reset \
    --id "$M365_APP_ID" \
    --display-name "m365-backup-onprem" \
    --years 2 \
    --query '{appId:appId, secret:password, tenantId:tenant, expires:endDateTime}' \
    -o json 2>/dev/null)
  if [ -n "$SECRET_JSON" ]; then
    M365_SECRET=$(echo "$SECRET_JSON" | jq -r .secret)
    M365_EXPIRES=$(echo "$SECRET_JSON" | jq -r .expires)
    ok "client secret created (expires $M365_EXPIRES — set a calendar reminder)"
  else
    warn "couldn't create client secret"
  fi
fi

# ----- 8) Output: what goes into 1Password ----------------------------------
printf '\n%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"
printf '%s   SAVE THE FOLLOWING TO 1Password → IT/Admin vault   %s\n' "$YLW" "$RST"
printf '%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"

cat <<EOF

1Password item: skintyee-m365-backup
  tenantId:    ${TENANT_ID}
  appId:       ${M365_APP_ID:-DRY-RUN}
  clientSecret:${M365_SECRET:-DRY-RUN-PLACEHOLDER}
  expires:     ${M365_EXPIRES:-DRY-RUN-PLACEHOLDER}

1Password item: m365-backup-blob-sas
  storageAccount: ${STORAGE_ACCOUNT}
  container:      m365-email-archive
  sasToken:       ${CONTAINER_SAS[m365-email-archive]:-DRY-RUN-PLACEHOLDER}
  blobUrl:        https://${STORAGE_ACCOUNT}.blob.core.windows.net/m365-email-archive

1Password item: m365-backup-ai
  connectionString: ${AI_CONN:-DRY-RUN-PLACEHOLDER}
  instrumentationKey: ${AI_KEY:-DRY-RUN-PLACEHOLDER}

(SAS tokens for the other 4 containers — entra-snapshots, azure-snapshots,
postgres-dumps, m365-sharepoint-archive — are also generated above. Save
those to 1Password when their respective workloads are stood up.)

EOF

# Append all SAS tokens to a temp file for easy paste
TEMP_DIR=$(mktemp -d)
{
  echo "# Generated $(date -u) — copy values to 1Password then DELETE this file"
  echo
  echo "Tenant + app:"
  echo "  TENANT_ID=$TENANT_ID"
  echo "  M365_APP_ID=${M365_APP_ID:-}"
  echo "  M365_CLIENT_SECRET=${M365_SECRET:-}"
  echo
  echo "Storage:"
  echo "  STORAGE_ACCOUNT=$STORAGE_ACCOUNT"
  for CONTAINER in "${CONTAINERS[@]}"; do
    echo "  SAS_${CONTAINER//-/_}=${CONTAINER_SAS[$CONTAINER]:-}"
  done
  echo
  echo "Application Insights:"
  echo "  AI_CONNECTION_STRING=${AI_CONN:-}"
  echo "  AI_INSTRUMENTATION_KEY=${AI_KEY:-}"
} > "$TEMP_DIR/skintyee-backup-secrets.txt"
chmod 600 "$TEMP_DIR/skintyee-backup-secrets.txt"

printf '%s✔ All secrets written to:%s\n  %s\n\n' "$GRN" "$RST" "$TEMP_DIR/skintyee-backup-secrets.txt"
printf '%sCOPY TO 1Password, then:%s rm "%s"\n\n' "$YLW" "$RST" "$TEMP_DIR/skintyee-backup-secrets.txt"

cat <<EOF
${GRN}✔ Cloud-side backup infrastructure provisioned.${RST}

Next steps:
  1) Copy secrets above into 1Password → IT/Admin vault
  2) Delete the temp file above
  3) On Server 2022, run: scripts/setup-backup-server.ps1
  4) Watch SMS/voice/email arrive when the heartbeat alert path is tested

To rotate the M365 client secret later:
  az ad app credential reset --id $M365_APP_ID --display-name "m365-backup-onprem" --years 2

To rotate a SAS token later:
  bash scripts/setup-backup-cloud.sh
  (re-runs everything idempotently; new SAS tokens replace the old ones —
   update 1Password + the server's Run-Backup.ps1 environment with the new
   values, then revoke the old ones via 'az storage account generate-sas
   --account-name $STORAGE_ACCOUNT --account-key <key> --ip <none>')
EOF
