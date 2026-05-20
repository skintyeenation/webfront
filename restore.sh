#!/usr/bin/env bash
# Restore a previously-taken backup. Pass the timestamp (YYYYMMDD-HHMMSS) or
# 'latest' to use the newest backup pair.
#
# Examples:
#   ./restore.sh latest
#   ./restore.sh 20260519-180442
#
# This will:
#   1. Stop containers (so MySQL releases locks)
#   2. Wipe wp-data + db-data
#   3. Bring containers back up
#   4. Extract wp-content tarball into wp-data/
#   5. Pipe the DB dump into MySQL

set -euo pipefail

cd "$(dirname "$0")"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <timestamp|latest>" >&2
  exit 1
fi

TS="$1"
if [[ "$TS" == "latest" ]]; then
  TS=$(ls -t backups/db-*.sql 2>/dev/null | head -1 | sed -E 's|backups/db-(.*)\.sql|\1|')
  if [[ -z "$TS" ]]; then
    echo "no backups found in backups/" >&2
    exit 1
  fi
  echo "[restore] resolved 'latest' -> $TS"
fi

DB_FILE="backups/db-$TS.sql"
WP_FILE="backups/wp-content-$TS.tar.gz"

[[ -f "$DB_FILE" ]] || { echo "missing $DB_FILE" >&2; exit 1; }
[[ -f "$WP_FILE" ]] || { echo "missing $WP_FILE" >&2; exit 1; }

echo "[restore] using $TS"
echo "[restore] db:   $(du -h $DB_FILE | cut -f1)  $DB_FILE"
echo "[restore] wp:   $(du -h $WP_FILE | cut -f1)  $WP_FILE"

read -r -p "this will wipe wp-data + db-data. continue? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "cancelled"; exit 1; }

# Safety net: snapshot the CURRENT live state before destroying it. If
# the user picked the wrong backup to restore, this gives them a way back.
if docker compose ps db 2>/dev/null | grep -q "Up"; then
  echo "[restore] taking emergency snapshot of current state before destroy..."
  ./backup.sh
  echo ""
fi

echo "[restore] stopping containers"
docker compose down -v

echo "[restore] wiping wp-data + db-data"
rm -rf wp-data db-data

echo "[restore] starting db (fresh)"
docker compose up -d db
# Wait for healthy
until docker compose exec -T db mysqladmin -uroot -prootpass ping >/dev/null 2>&1; do
  sleep 2
done

echo "[restore] loading db dump"
docker compose exec -T db mysql -uroot -prootpass skintyee < "$DB_FILE"

echo "[restore] starting wordpress"
docker compose up -d wordpress

echo "[restore] extracting wp-content"
mkdir -p wp-data
tar -xzf "$WP_FILE" -C wp-data/

echo ""
echo "[done] restored $TS — http://localhost:8080/"
