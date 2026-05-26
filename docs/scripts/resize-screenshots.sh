#!/bin/bash
# Generate 240px-wide thumbnails of every PNG / JPG under docs/media/
# into docs/media/thumbs/, mirroring the directory structure.
#
# Why: ADO's Repos file viewer strips HTML <img width=...> tags. To
# get inline thumbnails that render on BOTH ADO Files view AND GitHub,
# we need pre-sized images referenced with plain markdown:
#     ![](media/thumbs/foo.png)
# instead of
#     <img src="media/foo.png" width="240">
#
# Run this script after adding / replacing a screenshot. Thumbs are
# committed to the repo so the markdown image refs resolve everywhere
# (including SharePoint via the publisher pipeline).
#
# Usage:
#   bash docs/scripts/resize-screenshots.sh           # generate / refresh thumbs
#   bash docs/scripts/resize-screenshots.sh --force   # regenerate even if up-to-date
#   bash docs/scripts/resize-screenshots.sh --width 320  # custom width (default 240)
#
# Tool preference:
#   1. ImageMagick (`magick` or `convert`)  — preferred, cross-platform, best quality
#   2. sips                                  — macOS built-in fallback
#   3. vipsthumbnail                         — alternative (libvips), if installed

set -euo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- args -----------------------------------------------------------------
WIDTH=240
FORCE=0
SRC_DIR="docs/media"
DEST_DIR="docs/media/thumbs"

while [ $# -gt 0 ]; do
  case "$1" in
    --width)   WIDTH="$2"; shift 2 ;;
    --force)   FORCE=1; shift ;;
    --src)     SRC_DIR="$2"; shift 2 ;;
    --dest)    DEST_DIR="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown flag: $1 (use --help)" ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

[ -d "$SRC_DIR" ] || die "source dir not found: $SRC_DIR"

# ----- pick a resizing tool -------------------------------------------------
TOOL=""
if command -v magick >/dev/null 2>&1; then
  TOOL="magick"
elif command -v convert >/dev/null 2>&1; then
  TOOL="convert"
elif command -v vipsthumbnail >/dev/null 2>&1; then
  TOOL="vipsthumbnail"
elif command -v sips >/dev/null 2>&1; then
  TOOL="sips"
else
  die "no image-resize tool found. Install ImageMagick: \`brew install imagemagick\` (macOS) or \`apt install imagemagick\` (Linux)."
fi
say "using resize tool: $TOOL  ·  width=${WIDTH}px"

# ----- helpers --------------------------------------------------------------
resize_one() {
  local src="$1"
  local dst="$2"
  case "$TOOL" in
    magick)
      magick "$src" -resize "${WIDTH}x>" -strip -quality 85 "$dst" ;;
    convert)
      convert "$src" -resize "${WIDTH}x>" -strip -quality 85 "$dst" ;;
    vipsthumbnail)
      vipsthumbnail "$src" --size "${WIDTH}x" -o "$dst" ;;
    sips)
      # sips writes to stdout via -s, but it's simpler to copy + resize in place.
      cp "$src" "$dst"
      sips --resampleWidth "$WIDTH" "$dst" >/dev/null 2>&1
      ;;
  esac
}

# Compare mtimes; rebuild if src is newer than dst (or dst doesn't exist, or --force).
needs_rebuild() {
  local src="$1"
  local dst="$2"
  [ "$FORCE" -eq 1 ] && return 0
  [ ! -f "$dst" ] && return 0
  [ "$src" -nt "$dst" ] && return 0
  return 1
}

# ----- walk + resize --------------------------------------------------------
# Skip the thumbs dir itself (never thumbnail a thumbnail).
THUMBS_ABS=$(cd "$REPO_ROOT" && readlink -f "$DEST_DIR" 2>/dev/null || echo "$REPO_ROOT/$DEST_DIR")

generated=0
skipped=0
errors=0

while IFS= read -r -d '' src; do
  # Path of src relative to SRC_DIR (e.g. "website/home.png" or "dashboard.png").
  rel="${src#${SRC_DIR}/}"
  dst="${DEST_DIR}/${rel}"
  mkdir -p "$(dirname "$dst")"

  if needs_rebuild "$src" "$dst"; then
    if resize_one "$src" "$dst" 2>/dev/null; then
      generated=$((generated + 1))
    else
      warn "failed to resize: $src"
      errors=$((errors + 1))
    fi
  else
    skipped=$((skipped + 1))
  fi
done < <(find "$SRC_DIR" \
  -type d \( -path "$DEST_DIR" -o -name 'thumbs' \) -prune -o \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print0 \
  | sort -z)

echo
ok "generated $generated thumbnail(s), skipped $skipped (up to date), $errors error(s)"
echo "  Thumbs live in: $DEST_DIR/"
echo "  Reference them from markdown as:  ![](media/thumbs/<name>.png)"
echo "  (relative paths from docs/*.md; from repo root: docs/media/thumbs/<name>.png)"

[ "$errors" -gt 0 ] && exit 1
exit 0
