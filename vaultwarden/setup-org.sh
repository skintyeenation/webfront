#!/usr/bin/env bash
# setup-org.sh - create the Skin Tyee org STRUCTURE (collections + groups +
# access) after the human bootstrap (org-setup.md Steps 1-3). Idempotent-ish.
#
# Collections need the org encryption key -> created via the `bw` CLI logged in
# as the owner (BW_SESSION). Groups carry no key -> created via the org public
# API (org API key). See org-setup.md for the structure these mirror.
#
# Required env:
#   VAULT_URL        https://vault.skintyee.ca
#   ORG_ID           the organization id (bw list organizations)
#   BW_SESSION       an unlocked owner session  (bw unlock --raw)
#   BW_CLIENTID      org API key client_id      (organization.<id>)
#   BW_CLIENTSECRET  org API key client_secret
#
# SCAFFOLD: verify `bw`/public-API payloads against the deployed versions before
# trusting a run. Requires: bw, jq, curl.
set -euo pipefail
: "${VAULT_URL:?}"; : "${ORG_ID:?}"; : "${BW_SESSION:?}"; : "${BW_CLIENTID:?}"; : "${BW_CLIENTSECRET:?}"
command -v bw >/dev/null || { echo "install the Bitwarden CLI (bw)"; exit 1; }
export BW_SESSION

# --- structure (keep in sync with org-setup.md) -----------------------------
COLLECTIONS=(
  "IT & Infrastructure" "Finance" "Council & Chief" "Band Management"
  "Housing" "Forestry" "Land Resources" "GIS / Mapping"
  "Fire & Emergency" "Band Office (general)"
)
# group-slug => pipe-separated collections it can access
declare -A GROUP_ACCESS=(
  [it]="IT & Infrastructure"
  [system-admin]="*"
  [admins]="IT & Infrastructure"
  [finance]="Finance"
  [council]="Council & Chief"
  [chief]="Council & Chief"
  [band-manager]="Band Management|Band Office (general)"
  [management]="Band Management|Band Office (general)"
  [housing]="Housing"
  [forestry]="Forestry"
  [land-resources]="Land Resources"
  [gis]="GIS / Mapping"
  [fire-chief]="Fire & Emergency"
  [staff]="Band Office (general)"
  [band-members]="Band Office (general)"
)

bw config server "$VAULT_URL" >/dev/null
bw sync >/dev/null

echo "== Collections =="
for name in "${COLLECTIONS[@]}"; do
  if bw list org-collections --organizationid "$ORG_ID" | jq -e --arg n "$name" '.[]|select(.name==$n)' >/dev/null; then
    echo "  = $name (exists)"
  else
    bw get template org-collection \
      | jq --arg n "$name" --arg o "$ORG_ID" '.name=$n | .organizationId=$o' \
      | bw encode | bw create org-collection --organizationid "$ORG_ID" >/dev/null
    echo "  + $name"
  fi
done

# name -> collection id
declare -A CID
while IFS=$'\t' read -r id n; do CID["$n"]="$id"; done < <(bw list org-collections --organizationid "$ORG_ID" | jq -r '.[]|[.id,.name]|@tsv')

echo "== Org API token =="
TOKEN=$(curl -s "$VAULT_URL/identity/connect/token" \
  -d grant_type=client_credentials -d scope=api.organization \
  -d "client_id=$BW_CLIENTID" -d "client_secret=$BW_CLIENTSECRET" | jq -r .access_token)
[ "$TOKEN" != "null" ] && [ -n "$TOKEN" ] || { echo "token failed (check org API key)"; exit 1; }

echo "== Groups + access =="
for slug in "${!GROUP_ACCESS[@]}"; do
  spec="${GROUP_ACCESS[$slug]}"
  # build collections[] for the group
  if [ "$spec" = "*" ]; then
    cols=$(printf '%s\n' "${CID[@]}" | jq -R '{id:.,readOnly:false}' | jq -s .)
  else
    cols=$(IFS='|'; for c in $spec; do printf '%s\n' "${CID[$c]:-}"; done | grep . | jq -R '{id:.,readOnly:false}' | jq -s .)
  fi
  body=$(jq -nc --arg name "$slug" --argjson cols "$cols" '{name:$name, accessAll:false, collections:$cols}')
  curl -s -X POST "$VAULT_URL/api/public/groups" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$body" >/dev/null && echo "  + group $slug -> ${spec}"
done

echo "Done. Invite members (org-setup.md Step 6) or enable Directory Connector (entra-sync.md)."
