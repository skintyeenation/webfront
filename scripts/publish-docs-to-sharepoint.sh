#!/bin/bash
# Sync `docs/` to a SharePoint document library via Microsoft Graph.
#
# For every .md file under docs/, uploads (a) the raw markdown and
# (b) a pandoc-rendered .html sibling — both at the corresponding
# remote path under $SHAREPOINT_TARGET_PATH/, mirroring the repo's
# directory structure. Idempotent: re-running overwrites any file
# whose content has changed (Graph API replaces files on PUT). Files
# removed from the repo are NOT removed from SharePoint (intentional —
# SharePoint keeps version history).
#
# Auth: app-only Microsoft Graph against an Entra ID app with the
# `Sites.Selected` application permission, admin-granted to the specific
# target site. See `docs/365/sharepoint-docs-publish.md` for the one-time
# Azure portal setup.
#
# Two token-acquisition paths supported:
#
#   A) GRAPH_TOKEN_PREACQUIRED — used by `azure-pipelines/publish-docs-to-sharepoint.yml`.
#      The Azure Pipeline mints a Graph token via workload identity
#      federation (`az account get-access-token`) and exports it as this
#      env var. NO client_secret involved anywhere. This is the
#      post-migration default per ADR-9.
#
#   B) AZURE_CLIENT_SECRET + AZURE_TENANT_ID + AZURE_CLIENT_ID — legacy
#      client_credentials flow. Used by the GitHub Actions workflow
#      (`.github/workflows/publish-docs-to-sharepoint.yml`) which stays
#      in-tree as a fallback until the Azure Pipeline is verified, and by
#      local dev (where the secret lives in `lookup/.env`).
#
# Always required:
#   SHAREPOINT_SITE_ID         — Graph site-id: `{hostname},{site-guid},{web-guid}`
#   SHAREPOINT_DRIVE_NAME      — Document library display name (e.g. "Documents")
#   SHAREPOINT_TARGET_PATH     — (optional) Subfolder inside the drive
#                                 Default: webfront
#
# Usage:
#   bash scripts/publish-docs-to-sharepoint.sh
#   bash scripts/publish-docs-to-sharepoint.sh --dry-run

set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

# ----- prereqs ----------------------------------------------------------------

for cmd in pandoc jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "✗ required command not found: $cmd" >&2
    exit 1
  fi
done

if [ "$DRY_RUN" -eq 0 ]; then
  : "${SHAREPOINT_SITE_ID:?missing SHAREPOINT_SITE_ID}"
  : "${SHAREPOINT_DRIVE_NAME:?missing SHAREPOINT_DRIVE_NAME}"
  # AZURE_CLIENT_SECRET is only required for the legacy client_credentials
  # path — if `GRAPH_TOKEN_PREACQUIRED` is set (Azure Pipelines path with
  # federated credentials), we skip the client_credentials env vars.
  if [ -z "${GRAPH_TOKEN_PREACQUIRED:-}" ]; then
    : "${AZURE_TENANT_ID:?missing AZURE_TENANT_ID (or set GRAPH_TOKEN_PREACQUIRED)}"
    : "${AZURE_CLIENT_ID:?missing AZURE_CLIENT_ID (or set GRAPH_TOKEN_PREACQUIRED)}"
    : "${AZURE_CLIENT_SECRET:?missing AZURE_CLIENT_SECRET (or set GRAPH_TOKEN_PREACQUIRED)}"
  fi
fi
TARGET_PATH="${SHAREPOINT_TARGET_PATH:-webfront}"

cd "$(dirname "$0")/.."   # repo root
DOCS_DIR="${DOCS_DIR:-docs}"
RENDER_DIR="$(mktemp -d)"
trap 'rm -rf "$RENDER_DIR"' EXIT

# ----- 1) acquire token -------------------------------------------------------

TOKEN=""
DRIVE_ID=""
if [ "$DRY_RUN" -eq 0 ]; then
  # Two token-acquisition paths, in priority order:
  #
  #  1. GRAPH_TOKEN_PREACQUIRED set — used by the Azure Pipelines path
  #     (`azure-pipelines/publish-docs-to-sharepoint.yml` mints a token
  #     via the federated-credential service connection and exports it).
  #     This is the post-migration default: NO client_secret involved
  #     anywhere.
  #
  #  2. AZURE_CLIENT_SECRET set — legacy client_credentials path used by
  #     the GitHub Actions workflow (now retired per ADR-9) and by local
  #     dev (where the secret lives in `lookup/.env`).
  #
  # The conditional means a single publisher script serves all three
  # contexts without code duplication.
  if [ -n "${GRAPH_TOKEN_PREACQUIRED:-}" ]; then
    echo "▸ using pre-acquired Graph token (federated credential path)"
    TOKEN="$GRAPH_TOKEN_PREACQUIRED"
  else
    echo "▸ acquiring Graph token via client_credentials (tenant ${AZURE_TENANT_ID:0:8}…)"
    TOKEN=$(curl -sf -X POST \
      "https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
      -H "content-type: application/x-www-form-urlencoded" \
      --data-urlencode "client_id=${AZURE_CLIENT_ID}" \
      --data-urlencode "client_secret=${AZURE_CLIENT_SECRET}" \
      --data-urlencode "scope=https://graph.microsoft.com/.default" \
      --data-urlencode "grant_type=client_credentials" \
      | jq -r '.access_token')
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
      echo "✗ token acquisition failed" >&2
      exit 1
    fi
  fi

  echo "▸ resolving drive id for '$SHAREPOINT_DRIVE_NAME' on site"
  DRIVE_ID=$(curl -sf -H "authorization: Bearer $TOKEN" \
    "https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drives" \
    | jq -r --arg name "$SHAREPOINT_DRIVE_NAME" \
        '.value[] | select(.name == $name) | .id' | head -1)
  if [ -z "$DRIVE_ID" ]; then
    echo "✗ drive '$SHAREPOINT_DRIVE_NAME' not found on site" >&2
    echo "  available drives:" >&2
    curl -sf -H "authorization: Bearer $TOKEN" \
      "https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drives" \
      | jq -r '.value[].name' | sed 's/^/    - /' >&2
    exit 1
  fi
fi

# ----- 2) helpers -------------------------------------------------------------

uploaded=0
rendered=0
failed=0

# URL-encode a path while preserving forward slashes.
encode_path() {
  printf '%s' "$1" | jq -sRr '@uri' | sed 's|%2F|/|g'
}

# upload_file <local_path> <remote_path> <content_type>
upload_file() {
  local local_path="$1"
  local remote_path="$2"
  local content_type="$3"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) would PUT → $remote_path"
    return 0
  fi
  local encoded
  encoded=$(encode_path "$remote_path")
  local url="https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encoded}:/content"
  local code
  code=$(curl -sL -o /tmp/sp-resp.json -w "%{http_code}" \
    -X PUT "$url" \
    -H "authorization: Bearer $TOKEN" \
    -H "content-type: $content_type" \
    --data-binary "@$local_path") || code="000"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    uploaded=$((uploaded + 1))
  else
    failed=$((failed + 1))
    echo "  ✗ upload failed (HTTP $code) — $remote_path" >&2
    head -c 240 /tmp/sp-resp.json >&2 || true
    echo >&2
  fi
}

# render_md_to_html <md_path> <html_out_path>
render_md_to_html() {
  local md_path="$1"
  local html_path="$2"
  local title
  title=$(awk '/^# / { sub(/^# /, ""); print; exit }' "$md_path")
  [ -z "$title" ] && title="$(basename "$md_path" .md)"
  mkdir -p "$(dirname "$html_path")"
  # `--highlight-style` was deprecated in pandoc 3.5 in favour of
  # `--syntax-highlighting`, but the older flag still works on the Ubuntu
  # 22.04 / 24.04 runners GitHub Actions ships (pandoc 2.x / 3.1). Suppress
  # the deprecation warning so it doesn't fill the log.
  {
    pandoc -s \
      --metadata "title=$title" \
      --from gfm \
      --to html5 \
      --highlight-style tango \
      -o "$html_path" \
      "$md_path"
  } 2> >(grep -v 'Deprecated: --highlight-style' >&2) || true
  rendered=$((rendered + 1))
}

# ----- 3) walk + upload -------------------------------------------------------

# Files to upload come from three places:
#  - $DOCS_DIR/**.md (the main docs tree, also rendered to .html)
#  - $ROOT_FILES at repo root — README/CHANGELOG/CONTRIBUTING/LICENSE/SECURITY.
#    These stay at the repo root (where GitHub/ADO display them) but get
#    mirrored to SharePoint so non-developers can read them too.
#  - $DOCS_DIR/** non-markdown ASSETS (images, PDFs, etc.) — referenced
#    from the markdown files via relative paths. Without these, the
#    rendered HTML on SharePoint shows broken image tags.

ROOT_FILES=(README.md CHANGELOG.md CONTRIBUTING.md LICENSE.md SECURITY.md)

# Asset extensions to publish alongside the .md tree. Whitelist (rather
# than "everything non-.md") because docs/ can contain build tooling
# (e.g. docs/scripts/*.py, *.mjs, *.sh, package*.json) that we don't
# want in SharePoint.
ASSET_EXTS=(png jpg jpeg gif svg webp bmp ico pdf pptx docx xlsx mp4 mov webm mp3)

# content_type_for <path> — best-effort MIME type lookup for an asset path
content_type_for() {
  case "${1##*.}" in
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    gif) echo "image/gif" ;;
    svg) echo "image/svg+xml" ;;
    webp) echo "image/webp" ;;
    bmp) echo "image/bmp" ;;
    ico) echo "image/vnd.microsoft.icon" ;;
    pdf) echo "application/pdf" ;;
    pptx) echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    xlsx) echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    mp4) echo "video/mp4" ;;
    mov) echo "video/quicktime" ;;
    webm) echo "video/webm" ;;
    mp3) echo "audio/mpeg" ;;
    *)   echo "application/octet-stream" ;;
  esac
}

echo "▸ walking $DOCS_DIR/ + repo-root notable files + assets…"

# Build the file lists separately — markdown gets render-to-html
# treatment, assets get uploaded as-is with proper content-type.
TMP_MD_LIST=$(mktemp)
TMP_ASSET_LIST=$(mktemp)
trap "rm -f $TMP_MD_LIST $TMP_ASSET_LIST; rm -rf $RENDER_DIR" EXIT

# Markdown: root files first (only those that exist), then docs/**.md
for f in "${ROOT_FILES[@]}"; do
  [ -f "$f" ] && printf '%s\n' "$f" >> "$TMP_MD_LIST"
done
find "$DOCS_DIR" \
  -type d \( -name node_modules -o -name dist -o -name .next -o -name out -o -name scripts \) -prune -o \
  -type f -name '*.md' -print | sort >> "$TMP_MD_LIST"

# Assets: build a find expression matching every $ASSET_EXTS extension
# (case-insensitive — README.PNG vs README.png both match).
FIND_EXPR=()
for ext in "${ASSET_EXTS[@]}"; do
  [ ${#FIND_EXPR[@]} -gt 0 ] && FIND_EXPR+=(-o)
  FIND_EXPR+=(-iname "*.${ext}")
done
find "$DOCS_DIR" \
  -type d \( -name node_modules -o -name dist -o -name .next -o -name out -o -name scripts \) -prune -o \
  -type f \( "${FIND_EXPR[@]}" \) -print | sort >> "$TMP_ASSET_LIST"

# --- Render + upload markdown files (and their .html siblings) -----------
while IFS= read -r md; do
  [ -z "$md" ] && continue
  remote_md="$TARGET_PATH/$md"
  remote_html="${remote_md%.md}.html"
  local_html="$RENDER_DIR/${md%.md}.html"
  render_md_to_html "$md" "$local_html"
  upload_file "$md" "$remote_md" "text/markdown"
  upload_file "$local_html" "$remote_html" "text/html"
done < "$TMP_MD_LIST"

# --- Upload assets as-is, with proper content-type -----------------------
while IFS= read -r asset; do
  [ -z "$asset" ] && continue
  remote_asset="$TARGET_PATH/$asset"
  ctype=$(content_type_for "$asset")
  upload_file "$asset" "$remote_asset" "$ctype"
done < "$TMP_ASSET_LIST"

echo ""
echo "✔ done — rendered $rendered .html · uploaded $uploaded files · failed $failed"
[ "$failed" -gt 0 ] && exit 1
exit 0
