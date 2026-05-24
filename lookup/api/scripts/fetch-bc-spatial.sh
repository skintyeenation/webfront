#!/bin/bash
# Download BC Crown land-use planning + Indigenous land use plan boundary
# datasets from the BC Open Data catalogue. These are spatial datasets (WFS
# GeoJSON + shapefile zips) we use for cross-referencing reserve boundaries
# against provincial planning regions. Outputs are gitignored.
#
# Usage:
#   ./scripts/fetch-bc-spatial.sh                 # download every dataset
#   ./scripts/fetch-bc-spatial.sh slrp            # SLRP only
#   ./scripts/fetch-bc-spatial.sh public-lup      # publicly-available LUP only
#   ./scripts/fetch-bc-spatial.sh recreation      # Recreation Sites/Reserves/Interpretive Forests
#   ./scripts/fetch-bc-spatial.sh mineral-profiles # BC mineral deposit type reference table (CSV)
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

# Recreation Sites, Reserves, and Interpretive Forests (incl. closures).
# Note: "Reserves" here are Crown Recreation Reserves under Forest Tenure
# Administration — NOT Indigenous reserves. (Indigenous reserve geometry is
# pulled separately from the NRCan CLSS Aboriginal Lands ArcGIS layer by
# band-detail.ts.)
REC_LAYER='pub:WHSE_FOREST_TENURE.FTEN_REC_DTAILS_CLOSURES_SV'

# Publicly Available Land Use Plans → direct shapefile zip from BC COMS API
PUBLIC_LUP_URL='https://coms.api.gov.bc.ca/api/v1/object/b2a2af52-130c-4412-abfb-320d66cd95a6'

# Mineral Deposit Profiles — 160-row reference table (CSV) of BC mineral
# deposit types. Not spatial, but useful alongside MINFILE point data for
# understanding what kind of mineralization sits inside a given territory.
MINERAL_PROFILES_URL='https://catalogue.data.gov.bc.ca/dataset/83195f0a-ebc7-4bed-a99c-9edcff96f445/resource/3b88dcd0-02c3-4581-91cd-102bd90eeb51/download/mineraldepositprofiles.csv'

download_slrp() {
  local out="$OUT/slrp.geojson"
  echo "▸ slrp → $out"
  local url="$WFS?service=WFS&version=2.0.0&request=GetFeature&typeNames=$SLRP_LAYER&outputFormat=application/json"
  curl -fL -A "$UA" --progress-bar -o "$out" "$url"
  local count=$(python3 -c "import json; print(len(json.load(open('$out'))['features']))" 2>/dev/null || echo "?")
  echo "  $(du -h "$out" | cut -f1) · $count features (all currently-published SLRPs; retired shapes need warehouse download)"
}

download_recreation() {
  local out="$OUT/recreation-sites-reserves-interpretive-forests.geojson"
  echo "▸ recreation → $out"
  local url="$WFS?service=WFS&version=2.0.0&request=GetFeature&typeNames=$REC_LAYER&outputFormat=application/json"
  curl -fL -A "$UA" --progress-bar -o "$out" "$url"
  local count=$(python3 -c "import json; print(len(json.load(open('$out'))['features']))" 2>/dev/null || echo "?")
  echo "  $(du -h "$out" | cut -f1) · $count features (sites + Crown recreation reserves + interpretive forests; NOT Indigenous reserves)"
}

download_mineral_profiles() {
  local out="$OUT/mineral-deposit-profiles.csv"
  echo "▸ mineral-profiles → $out"
  curl -fL -A "$UA" --progress-bar -o "$out" "$MINERAL_PROFILES_URL"
  local count=$(($(wc -l < "$out") - 1))
  echo "  $(du -h "$out" | cut -f1) · $count profiles (BC mineral deposit type reference table — not spatial)"
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
  slrp)             download_slrp ;;
  public-lup)       download_public_lup ;;
  recreation)       download_recreation ;;
  mineral-profiles) download_mineral_profiles ;;
  all)
    download_slrp
    download_public_lup
    download_recreation
    download_mineral_profiles
    echo "✔ done → $OUT/"
    ;;
  *)
    echo "usage: fetch-bc-spatial.sh [slrp|public-lup|recreation|mineral-profiles|all]"
    exit 1
    ;;
esac
