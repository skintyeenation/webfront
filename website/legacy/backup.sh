#!/usr/bin/env bash
# Snapshot the running WordPress: full MySQL dump + wp-content tarball
# (uploads, mu-plugins, themes, plugins). Outputs timestamped files in
# ./backups/.
#
# Run from the repo root:  ./backup.sh
# Restore:                  ./restore.sh <timestamp>

set -euo pipefail

cd "$(dirname "$0")"

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

echo "[backup] dumping database -> backups/db-$TS.sql"
docker compose exec -T db mysqldump \
  --single-transaction \
  --add-drop-table \
  -uroot -prootpass skintyee \
  > backups/db-$TS.sql

DB_SIZE=$(du -h backups/db-$TS.sql | cut -f1)
echo "[backup]   -> $DB_SIZE"

echo "[backup] archiving wp-content -> backups/wp-content-$TS.tar.gz"
tar -czf backups/wp-content-$TS.tar.gz \
  --exclude='cache' \
  --exclude='upgrade' \
  -C wp-data wp-content

WP_SIZE=$(du -h backups/wp-content-$TS.tar.gz | cut -f1)
echo "[backup]   -> $WP_SIZE"

# Optional: keep only the last 20 backups to avoid disk bloat. Comment out
# this block if you want to keep everything forever.
echo "[backup] pruning old backups (keeping last 20 of each kind)"
ls -t backups/db-*.sql 2>/dev/null | tail -n +21 | xargs -r rm
ls -t backups/wp-content-*.tar.gz 2>/dev/null | tail -n +21 | xargs -r rm

echo ""
echo "[done] $TS"
ls -lh backups/db-$TS.sql backups/wp-content-$TS.tar.gz
