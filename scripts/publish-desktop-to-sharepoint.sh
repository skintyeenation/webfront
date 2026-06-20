#!/bin/bash
# Publish the built Skin Tyee desktop installers (electron-builder output in
# app/desktop-dist/) to a SharePoint document library via Microsoft Graph, and
# print a download link for each. Mirrors the auth + drive-resolution contract
# of publish-docs-to-sharepoint.sh (Sites.Selected, app-only Graph).
#
# Large binaries (.exe / .dmg / .AppImage / .deb are >4 MB) MUST use a Graph
# upload SESSION with chunked PUTs — a plain /content PUT caps at 4 MB.
#
# Auth (same as the docs publisher):
#   A) GRAPH_TOKEN_PREACQUIRED                       (Azure Pipelines / WIF)
#   B) AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET   (client creds)
#
# Required:
#   SHAREPOINT_SITE_ID      Graph site-id triple {host},{site-guid},{web-guid}
#   SHAREPOINT_DRIVE_NAME   Document library display name (e.g. "Documents")
# Optional:
#   SHAREPOINT_TARGET_PATH  Subfolder in the drive. Default: webfront/desktop
#   ARTIFACT_DIR            Where the installers are.  Default: app/desktop-dist
#   ARTIFACT_VERSION        Version/label subfolder (e.g. a build number). Default: none
#
# Usage:
#   bash scripts/publish-desktop-to-sharepoint.sh
#   bash scripts/publish-desktop-to-sharepoint.sh --dry-run

set -euo pipefail
DRY_RUN=0; [ "${1:-}" = "--dry-run" ] && DRY_RUN=1

for cmd in jq curl; do command -v "$cmd" >/dev/null 2>&1 || { echo "✗ need $cmd" >&2; exit 1; }; done

: "${SHAREPOINT_SITE_ID:?missing SHAREPOINT_SITE_ID}"
: "${SHAREPOINT_DRIVE_NAME:?missing SHAREPOINT_DRIVE_NAME}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT/app/desktop-dist}"
BASE_PATH="${SHAREPOINT_TARGET_PATH:-webfront/desktop}"
[ -n "${ARTIFACT_VERSION:-}" ] && BASE_PATH="$BASE_PATH/$ARTIFACT_VERSION"

# ----- token ----------------------------------------------------------------
if [ -n "${GRAPH_TOKEN_PREACQUIRED:-}" ]; then
  TOKEN="$GRAPH_TOKEN_PREACQUIRED"
else
  : "${AZURE_TENANT_ID:?missing AZURE_TENANT_ID (or GRAPH_TOKEN_PREACQUIRED)}"
  : "${AZURE_CLIENT_ID:?missing AZURE_CLIENT_ID}"
  : "${AZURE_CLIENT_SECRET:?missing AZURE_CLIENT_SECRET}"
  TOKEN=$(curl -sf "https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
    -d grant_type=client_credentials -d "client_id=${AZURE_CLIENT_ID}" \
    -d "client_secret=${AZURE_CLIENT_SECRET}" -d scope=https://graph.microsoft.com/.default \
    | jq -r '.access_token')
fi
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "✗ failed to acquire Graph token" >&2; exit 1; }

# ----- drive ----------------------------------------------------------------
DRIVE_ID=$(curl -sf -H "authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drives" \
  | jq -r --arg name "$SHAREPOINT_DRIVE_NAME" '.value[] | select(.name==$name) | .id')
[ -n "$DRIVE_ID" ] || { echo "✗ drive '$SHAREPOINT_DRIVE_NAME' not found" >&2; exit 1; }

# Only ship the actual installers (skip electron-builder's metadata/blockmaps).
shopt -s nullglob
FILES=()
for f in "$ARTIFACT_DIR"/*.exe "$ARTIFACT_DIR"/*.dmg "$ARTIFACT_DIR"/*.AppImage "$ARTIFACT_DIR"/*.deb "$ARTIFACT_DIR"/*.zip; do
  FILES+=("$f")
done
[ ${#FILES[@]} -gt 0 ] || { echo "✗ no installers in $ARTIFACT_DIR (run 'pnpm --filter @skintyee/app desktop:build:*' first)" >&2; exit 1; }

echo "▸ publishing ${#FILES[@]} artifact(s) → /${BASE_PATH} on '${SHAREPOINT_DRIVE_NAME}'"

upload_one() {
  local file="$1" name remote session url size offset chunk end
  name="$(basename "$file")"
  remote="${BASE_PATH}/${name}"
  size=$(wc -c < "$file" | tr -d ' ')
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry-run) would upload $name (${size} bytes) → /$remote"; return; fi

  # Create an upload session (replace if exists).
  session=$(curl -sf -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"item":{"@microsoft.graph.conflictBehavior":"replace"}}' \
    "https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${remote}:/createUploadSession" \
    | jq -r '.uploadUrl')
  [ -n "$session" ] && [ "$session" != "null" ] || { echo "  ✗ $name: no upload session" >&2; return 1; }

  # 10 MiB chunks (must be a multiple of 320 KiB per Graph).
  chunk=$((10*1024*1024)); offset=0; local resp=""
  while [ "$offset" -lt "$size" ]; do
    end=$((offset+chunk)); [ "$end" -gt "$size" ] && end="$size"
    # Portable efficient slice: skip to offset, take (end-offset) bytes.
    resp=$(tail -c "+$((offset+1))" "$file" | head -c "$((end-offset))" | \
      curl -sf -X PUT "$session" \
        -H "content-length: $((end-offset))" \
        -H "content-range: bytes ${offset}-$((end-1))/${size}" \
        --data-binary @-)
    offset="$end"
  done
  local web; web=$(echo "$resp" | jq -r '.webUrl // empty')
  echo "  ✓ $name  →  ${web:-uploaded}"
}

for f in "${FILES[@]}"; do upload_one "$f"; done
echo "▸ done. Share the /${BASE_PATH} folder (or the per-file links above) with users."
