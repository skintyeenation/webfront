#!/usr/bin/env bash
# Canonical "start fresh" script. Use this instead of running `docker compose
# down -v && rm -rf wp-data db-data` directly — it always snapshots the
# current state to ./backups/ first so you can roll back with ./restore.sh.
#
# After wiping, you'll typically follow up with ./importer/import.sh to
# rebuild from scratch.

set -euo pipefail

cd "$(dirname "$0")"

# Safety net: snapshot whatever's running before nuking it.
if docker compose ps db 2>/dev/null | grep -q "Up"; then
  echo "[wipe] taking emergency snapshot of current state..."
  ./backup.sh
  echo ""
fi

read -r -p "this will DESTROY wp-data and db-data. continue? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "cancelled"; exit 1; }

echo "[wipe] docker compose down -v"
docker compose down -v

echo "[wipe] rm -rf wp-data db-data"
rm -rf wp-data db-data

echo "[wipe] docker compose up -d"
docker compose up -d

echo ""
echo "[done] wiped. run ./importer/import.sh to rebuild, or ./restore.sh <ts> to restore a snapshot."
