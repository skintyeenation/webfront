#!/bin/bash
# Back up the lookup tool's JSON file store to a timestamped tarball under
# `lookup/backups/`. The data layer is the per-record JSON envelopes at
# `lookup/api/data/<bucket>/<key>.json` plus the worker queue, used for:
#
#   - band detail cache         (nations/{bandNumber}.json)
#   - OCR'd Schedule of Federal Funding PDFs (nations-funds/{band}_{fy}.json)
#   - bulk band list            (nations-list/all.json)
#   - BCFSC SAFE companies      (bcfsc-safe/all.json)
#   - available-grants catalogue (available-grants/all-hubs.json)
#   - background worker queue   (queue.json)
#
# Excluded from the archive (reproducible / disposable):
#   - data/bc-spatial/  ~130 MB — re-fetch with `pnpm fetch:bc-spatial`
#   - data/scratch/     working PDFs — re-fetched as worker runs
#
# Usage:
#   ./scripts/backup-db.sh                  # → lookup/backups/lookup-data-<ts>.tar.gz
#   ./scripts/backup-db.sh /custom/path     # write tarball to a custom path
#
# Restore:
#   tar -xzf lookup-data-<ts>.tar.gz -C lookup/api/   # restores the data/ dir

set -euo pipefail

cd "$(dirname "$0")/.."   # lookup/api
ROOT="$(pwd)"
BACKUPS_DIR="${1:-$ROOT/../backups}"
mkdir -p "$BACKUPS_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUPS_DIR/lookup-data-$STAMP.tar.gz"

if [ ! -d data ]; then
  echo "✗ no data/ directory at $ROOT/data — nothing to back up." >&2
  exit 1
fi

echo "▸ backing up $ROOT/data → $OUT (excluding bc-spatial + scratch)"
tar -czf "$OUT" \
  --exclude='data/bc-spatial' \
  --exclude='data/scratch' \
  data/

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(tar -tzf "$OUT" | wc -l | tr -d ' ')
echo "  ✓ $SIZE · $COUNT entries"
echo ""
echo "Recent backups in $BACKUPS_DIR:"
ls -lht "$BACKUPS_DIR" | head -6
