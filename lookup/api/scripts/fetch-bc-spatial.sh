#!/bin/bash
# Download BC Crown land-use planning + Indigenous land use plan boundary
# datasets from the BC Open Data catalogue. These are spatial datasets (WFS
# GeoJSON + shapefile zips) we use for cross-referencing reserve boundaries
# against provincial planning regions. Outputs are gitignored.
#
# Usage:
#   ./scripts/fetch-bc-spatial.sh           # download both datasets
#   ./scripts/fetch-bc-spatial.sh slrp           # SLRP only
#   ./scripts/fetch-bc-spatial.sh public-lup     # publicly-available LUP only
#
# Datasets:
#   slrp         — Strategic Land and Resource Plans (all currently published
#                  via the WFS layer; retired shapes require BC Geographic
#                  Warehouse Custom Download which is registration-walled)
#   public-lup   — Publicly Available Land Use Plans (incl. Nation-specific LUPs)
#
# Note: the CKAN dataset is split into "Current" + "All", but both list the
# same WFS layer URL. The retirement filter lives at the warehouse level, not
# in the WFS schema (PLAN_STATUS = Legal / Approved / NA / Draft are the only
# status values exposed; no RETIREMENT_DATE field on the public layer).

set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${OUT:-./data/bc-spatial}"
mkdir -p "$OUT"

UA='Mozilla/5.0 (compatible; skintyee-lookup/0.1)'

# BC Geographic Warehouse WFS endpoint. The Strategic Land and Resource Plans
# layer exposes only currently-published shapes — retired plans live in the
# BC Geographic Warehouse Custom Download (registration-walled).
WFS='https://openmaps.gov.bc.ca/geo/pub/wfs'
SLRP_LAYER='pub:WHSE_LAND_USE_PLANNING.RMP_STRGC_LAND_RSRCE_PLAN_SVW'

# Publicly Available Land Use Plans → direct shapefile zip from BC COMS API
PUBLIC_LUP_URL='https://coms.api.gov.bc.ca/api/v1/object/b2a2af52-130c-4412-abfb-320d66cd95a6'

download_slrp() {
  local out="$OUT/slrp.geojson"
  echo "▸ slrp → $out"
  local url="$WFS?service=WFS&version=2.0.0&request=GetFeature&typeNames=$SLRP_LAYER&outputFormat=application/json"
  curl -fL -A "$UA" --progress-bar -o "$out" "$url"
  local count=$(python3 -c "import json; print(len(json.load(open('$out'))['features']))" 2>/dev/null || echo "?")
  echo "  $(du -h "$out" | cut -f1) · $count features (all currently-published SLRPs; retired shapes need warehouse download)"
}

download_public_lup() {
  local out="$OUT/publicly-available-lup.zip"
  echo "▸ public-lup → $out"
  curl -fL -A "$UA" --progress-bar -o "$out" "$PUBLIC_LUP_URL"
  echo "  $(du -h "$out" | cut -f1) (shapefile zip)"
  # Extract for convenience
  local exdir="$OUT/publicly-available-lup"
  mkdir -p "$exdir"
  if command -v unzip >/dev/null 2>&1; then
    unzip -oq "$out" -d "$exdir"
    echo "  extracted → $exdir/"
  else
    echo "  (install \`unzip\` to auto-extract)"
  fi
}

mode="${1:-all}"

case "$mode" in
  slrp)       download_slrp ;;
  public-lup) download_public_lup ;;
  all)
    download_slrp
    download_public_lup
    echo "✔ done → $OUT/"
    ;;
  *)
    echo "usage: fetch-bc-spatial.sh [slrp|public-lup|all]"
    exit 1
    ;;
esac
