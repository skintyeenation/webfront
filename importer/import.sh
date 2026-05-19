#!/usr/bin/env bash
# Import scraped content into the running WordPress container via WP-CLI.
#
# Run from the repo root after `docker compose up -d` has finished and after
# the scraper has produced ./scraped/manifest.json.

set -euo pipefail

cd "$(dirname "$0")/.."

WP="docker compose run --rm wpcli"

# 1. Install WordPress if it hasn't been already.
if ! $WP core is-installed >/dev/null 2>&1; then
  echo "[setup] installing WordPress..."
  $WP core install \
    --url=http://localhost:8080 \
    --title="Skin Tyee First Nation" \
    --admin_user=admin \
    --admin_email=admin@skintyee.ca \
    --admin_password=admin \
    --skip-email
fi

# 2. Pretty permalinks so the imported slugs become real URLs.
$WP rewrite structure '/%postname%/' --hard

# 3. Hand off to the Python importer running inside the wpcli container.
#    The importer reads the manifest, calls `wp media import` and `wp post create`,
#    and patches {{MEDIA:...}} placeholders with the uploaded attachment URLs.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli /importer/import.php
