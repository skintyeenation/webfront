#!/bin/bash
# Download + locally grep the federal Proactive Disclosure bulk CSVs (contracts
# and grants/contributions). These files are ~100MB each, so they're skipped
# by the e2e screenshot capture and gitignored — fetch them manually here for
# offline keyword scans / data analysis.
#
# Usage:
#   ./scripts/fetch-bulk.sh                  # downloads both → ./out/bulk/
#   ./scripts/fetch-bulk.sh contracts        # contracts only
#   ./scripts/fetch-bulk.sh grants           # grants only
#   ./scripts/fetch-bulk.sh contracts <q>    # also grep <q> after download

set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${OUT:-./out/bulk}"
mkdir -p "$OUT"

CONTRACTS_URL='https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv'
GRANTS_URL='https://open.canada.ca/data/dataset/432527ab-7aac-45b5-81d6-7597107a7013/resource/1d15a62f-5656-49ad-8c88-f40ce689d831/download/grants.csv'

UA='Mozilla/5.0 (compatible; skintyee-lookup/0.1)'

download() {
  local name="$1" url="$2" out="$OUT/$name.csv"
  echo "▸ downloading $name → $out"
  curl -L -A "$UA" -o "$out" --progress-bar "$url"
  echo "  $(du -h "$out" | cut -f1) · $(wc -l < "$out") rows"
}

scan() {
  local name="$1" needle="$2" csv="$OUT/$name.csv"
  if [ ! -f "$csv" ]; then echo "⚠ $csv not found; run download first"; return 1; fi
  echo "▸ grep '$needle' in $name.csv (case-insensitive)"
  grep -ci "$needle" "$csv" || true
  grep -i "$needle" "$csv" | head -20
}

mode="${1:-all}"
needle="${2:-}"

case "$mode" in
  contracts)
    download contracts "$CONTRACTS_URL"
    [ -n "$needle" ] && scan contracts "$needle"
    ;;
  grants)
    download grants "$GRANTS_URL"
    [ -n "$needle" ] && scan grants "$needle"
    ;;
  all)
    download contracts "$CONTRACTS_URL"
    download grants "$GRANTS_URL"
    echo "✔ done → $OUT/"
    ;;
  *)
    echo "usage: fetch-bulk.sh [contracts|grants|all] [keyword]"
    exit 1
    ;;
esac
