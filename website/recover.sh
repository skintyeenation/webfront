#!/usr/bin/env bash
# Recover the local WordPress site after wp-data has been emptied/wiped.
#
# `wp-data/` is a (gitignored) bind mount holding WordPress core + themes +
# plugins + uploads. If it gets wiped (e.g. a stray `rm -rf` or `docker compose
# down -v`), the site goes blank / 403 / shows the install screen. This script
# heals it idempotently:
#
#   1. Brings the stack up (the wordpress image re-copies core into empty wp-data).
#   2. If the DB has no tables, restores the latest ./backups snapshot.
#   3. Re-places media files (the DB references uploads/YYYY/MM/<sha1>.<ext>;
#      the scraper writes scraped/media/<sha1>.<ext> — same names) so images/logo
#      resolve again.
#   4. Restores the custom mu-plugins from the repo and flushes Elementor CSS.
#
# If there is NO backup and NO scraped media, run a full rebuild instead:
#   ./.venv/bin/python scraper/crawl.py && ./importer/import.sh
#
# Usage:  ./recover.sh

set -euo pipefail
cd "$(dirname "$0")"

DC="docker compose -f docker-compose.yml"

echo "[recover] bringing the stack up..."
$DC up -d
# wait for db
for _ in $(seq 1 30); do
  $DC exec -T db mysqladmin ping -uroot -prootpass >/dev/null 2>&1 && break
  sleep 1
done

TABLES=$($DC exec -T db mysql -uroot -prootpass skintyee -N -e "SHOW TABLES" 2>/dev/null | wc -l | tr -d ' ')
echo "[recover] skintyee tables: $TABLES"

if [ "$TABLES" -eq 0 ]; then
  LATEST=$(ls -t backups/db-*.sql 2>/dev/null | head -1 || true)
  if [ -n "$LATEST" ]; then
    echo "[recover] DB empty — restoring latest backup: $LATEST"
    $DC exec -T db mysql -uroot -prootpass skintyee < "$LATEST"
    LATEST_WP=$(ls -t backups/wp-content-*.tar.gz 2>/dev/null | head -1 || true)
    if [ -n "$LATEST_WP" ]; then
      echo "[recover] restoring wp-content from: $LATEST_WP"
      tar -xzf "$LATEST_WP" -C wp-data
    fi
  else
    echo "[recover] no DB backup found — run a full rebuild:" >&2
    echo "          ./.venv/bin/python scraper/crawl.py && ./importer/import.sh" >&2
    exit 1
  fi
fi

# Restore custom mu-plugins from the repo (version-controlled, never lost).
echo "[recover] restoring custom mu-plugins from repo..."
mkdir -p wp-data/wp-content/mu-plugins
for p in skintyee-grid skintyee-cli-fix skintyee-image-sizes skintyee-news-filter; do
  [ -d "wp-plugins/$p" ] && cp -R "wp-plugins/$p" wp-data/wp-content/mu-plugins/
  [ -f "wp-data/wp-content/mu-plugins/$p/$p.php" ] && cat > "wp-data/wp-content/mu-plugins/$p-loader.php" <<PHP
<?php
require_once __DIR__ . '/$p/$p.php';
PHP
done

# Re-place media so the DB's uploads/YYYY/MM/<sha1> paths resolve. Mirror every
# scraped file into each month dir the DB references (cheap; content-addressed).
if ls scraped/media/* >/dev/null 2>&1; then
  MONTHS=$($DC exec -T db mysql -uroot -prootpass skintyee -N -e \
    "SELECT DISTINCT SUBSTRING_INDEX(meta_value,'/',2) FROM wp_postmeta WHERE meta_key='_wp_attached_file'" 2>/dev/null | tr -d '\r')
  for m in ${MONTHS:-2026/05}; do
    echo "[recover] placing media into uploads/$m ..."
    mkdir -p "wp-data/wp-content/uploads/$m"
    cp -n scraped/media/* "wp-data/wp-content/uploads/$m/" 2>/dev/null || true
  done
else
  echo "[recover] no scraped media on disk — images may be missing; re-scrape to restore."
fi

# Ownership so Apache (www-data, uid 33) can read.
$DC exec -T -u 0 wordpress chown -R 33:33 /var/www/html/wp-content/uploads 2>/dev/null || true

# Regenerate all thumbnail sizes from the originals — posts/leadership cards
# reference WP's generated sizes (e.g. <sha1>-300x200.jpg), not just originals.
echo "[recover] regenerating image thumbnails..."
$DC run --rm wpcli media regenerate --yes >/dev/null 2>&1 || true
$DC exec -T -u 0 wordpress chown -R 33:33 /var/www/html/wp-content/uploads 2>/dev/null || true

# Flush Elementor's generated CSS (it lives in uploads and may be stale).
$DC run --rm wpcli elementor flush_css >/dev/null 2>&1 || true

echo ""
echo "[recover] done -> http://localhost:8080/"
echo "          if images are still missing, re-scrape + import:"
echo "          ./.venv/bin/python scraper/crawl.py && ./importer/import.sh"
