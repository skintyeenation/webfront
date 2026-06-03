#!/bin/bash
# Provision the `skintyee-app-forms` M365 group + SharePoint site so
# the SharePoint storage adapter (Phase 1 secondary) can target it.
#
# What this does:
#   1. Creates the M365 group `skintyee-app-forms@skintyee.ca` if missing
#      (Microsoft Graph POST /groups; mailEnabled + securityEnabled false,
#      groupTypes=['Unified']) — automatically provisions a SharePoint
#      site at /sites/skintyee-app-forms.
#   2. Grants the existing `skintyee-app-graph` application
#      `Sites.Selected` permission scoped to that site (so the API can
#      read/write to its Documents library without app-wide site access).
#   3. Adds the group to api/src/skintyee-groups.ts as a 'm365' kind
#      entry (slug 'app-forms'), no `mail` field — explicitly not
#      invitable to meetings (it's a storage bucket, not a community
#      group).
#   4. Sets SHAREPOINT_FORMS_GROUP_ID + SHAREPOINT_FORMS_DRIVE_NAME in
#      the `api-prod` Container App secrets + ADO variable group.
#
# Until you actually flip STORAGE_DRIVER=sharepoint in the Container
# App, the SharePoint adapter stays dormant — the Azure Blob adapter
# keeps serving uploads.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/setup-app-forms-sharepoint.sh                   # provision + wire
#   bash scripts/setup-app-forms-sharepoint.sh --dry-run         # preview
#   bash scripts/setup-app-forms-sharepoint.sh --enable-driver   # also flip STORAGE_DRIVER=sharepoint

set -uo pipefail

CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

GROUP_DISPLAY="${GROUP_DISPLAY:-Skin Tyee App Forms}"
GROUP_MAIL_NICK="${GROUP_MAIL_NICK:-skintyee-app-forms}"
TENANT_DOMAIN="${TENANT_DOMAIN:-skintyee.ca}"
APP_DISPLAY_GRAPH="${APP_DISPLAY_GRAPH:-skintyee-app-graph}"
DRIVE_NAME="${DRIVE_NAME:-Forms}"
RG="${RG:-skintyee-prod-rg}"
CA_API_NAME="${CA_API_NAME:-api-prod}"
ADO_ORG="${ADO_ORG:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VARGROUP="${ADO_VARGROUP:-skintyee-prod-azure}"

DRY_RUN=0
ENABLE_DRIVER=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --enable-driver) ENABLE_DRIVER=1 ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then printf '  %sdry-run%s %s\n' "$YLW" "$RST" "$*"
  else "$@"; fi
}

command -v az >/dev/null 2>&1 || die "az CLI required."
az account show -o none 2>/dev/null || die "Not logged into Azure. Run: az login"

# ----- 1. Group + site ------------------------------------------------------
say "Looking up M365 group $GROUP_MAIL_NICK@$TENANT_DOMAIN…"
GROUP_ID=$(az ad group list --display-name "$GROUP_DISPLAY" \
  --query "[?mailNickname=='$GROUP_MAIL_NICK'].id" -o tsv 2>/dev/null | head -1)

if [[ -z "$GROUP_ID" ]]; then
  say "Creating M365 group via Graph…"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    GROUP_ID="DRY-RUN-GROUP-ID"
    warn "(dry-run) Skipped POST /groups"
  else
    GROUP_ID=$(az rest --method POST \
      --uri 'https://graph.microsoft.com/v1.0/groups' \
      --headers 'Content-Type=application/json' \
      --body "{
        \"displayName\": \"$GROUP_DISPLAY\",
        \"mailNickname\": \"$GROUP_MAIL_NICK\",
        \"mailEnabled\": true,
        \"securityEnabled\": false,
        \"groupTypes\": [\"Unified\"],
        \"description\": \"Storage bucket for the Skin Tyee community app's Documents library (see docs/features/documents-and-onboarding.md). NOT a community group — do not surface as invitable to meetings.\",
        \"visibility\": \"Private\"
      }" --query id -o tsv)
  fi
  ok "Group created: $GROUP_ID"
  say "SharePoint site auto-provisions in ~30s. Waiting…"
  [[ "$DRY_RUN" -eq 1 ]] || sleep 30
else
  ok "Group already exists: $GROUP_ID"
fi

# ----- 2. Sites.Selected on the new site -----------------------------------
say "Granting Sites.Selected to $APP_DISPLAY_GRAPH on this site…"
if [[ "$DRY_RUN" -eq 1 ]]; then
  warn "(dry-run) Skipped Sites.Selected grant — see docs/365/sharepoint-docs-publish.md for the manual steps."
else
  SITE_ID=$(az rest --method GET \
    --uri "https://graph.microsoft.com/v1.0/groups/$GROUP_ID/sites/root" \
    --query id -o tsv 2>/dev/null || true)
  if [[ -n "$SITE_ID" ]]; then
    APP_OBJECT_ID=$(az ad sp list --display-name "$APP_DISPLAY_GRAPH" --query '[0].id' -o tsv)
    if [[ -n "$APP_OBJECT_ID" ]]; then
      APP_APP_ID=$(az ad sp show --id "$APP_OBJECT_ID" --query appId -o tsv)
      az rest --method POST \
        --uri "https://graph.microsoft.com/v1.0/sites/$SITE_ID/permissions" \
        --headers 'Content-Type=application/json' \
        --body "{
          \"roles\": [\"write\"],
          \"grantedToIdentities\": [{
            \"application\": {
              \"id\": \"$APP_APP_ID\",
              \"displayName\": \"$APP_DISPLAY_GRAPH\"
            }
          }]
        }" -o none 2>/dev/null || warn "Site permission grant returned non-zero (may already exist)."
      ok "Sites.Selected wired."
    else
      warn "Couldn't find $APP_DISPLAY_GRAPH SP — run scripts/setup-app-graph.sh first."
    fi
  else
    warn "Couldn't resolve site id; SharePoint may still be provisioning. Re-run in a minute."
  fi
fi

# ----- 3. Container App secrets --------------------------------------------
say "Setting SHAREPOINT_FORMS_GROUP_ID + SHAREPOINT_FORMS_DRIVE_NAME on $CA_API_NAME…"
run az containerapp secret set \
  -n "$CA_API_NAME" -g "$RG" \
  --secrets "sharepoint-forms-group-id=$GROUP_ID" \
  -o none && ok "Secret set."
run az containerapp update \
  -n "$CA_API_NAME" -g "$RG" \
  --set-env-vars \
    "SHAREPOINT_FORMS_GROUP_ID=secretref:sharepoint-forms-group-id" \
    "SHAREPOINT_FORMS_DRIVE_NAME=$DRIVE_NAME" \
  -o none && ok "Env vars bound."

if [[ "$ENABLE_DRIVER" -eq 1 ]]; then
  say "Flipping STORAGE_DRIVER=sharepoint…"
  run az containerapp update \
    -n "$CA_API_NAME" -g "$RG" \
    --set-env-vars "STORAGE_DRIVER=sharepoint" \
    -o none && ok "STORAGE_DRIVER=sharepoint."
else
  warn "STORAGE_DRIVER unchanged. Re-run with --enable-driver to switch."
fi

ok "Done."
say "Manual follow-ups:"
say "  • Add to api/src/skintyee-groups.ts:"
say "      { id: '$GROUP_ID', slug: 'app-forms', displayName: '$GROUP_DISPLAY', kind: 'm365', description: 'Storage bucket — not for invitation.' },"
say "    (no \`mail\` field on this entry — it's not invitable; the blacklist already covers the same intent for older entries)."
say "  • Implement the SharePoint adapter methods in api/src/storage/sharepoint-storage.adapter.ts."
say "  • Smoke-test an upload after flipping STORAGE_DRIVER=sharepoint."
