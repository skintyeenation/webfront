#!/usr/bin/env bash
# Regenerate the website visual walkthrough screenshots.
#
# Run this whenever the skintyee.ca site changes. It:
#   1. ensures the local WordPress stack is up,
#   2. lists published PAGES (post_type=page — individual posts are excluded),
#   3. installs puppeteer-core on first run (drives the installed Chrome —
#      no bundled browser download),
#   4. captures a full-page screenshot of each page into docs/media/website/.
#
# Usage (from anywhere):  ./docs/scripts/shoot-website.sh
# Override Chrome:        CHROME="/path/to/chrome" ./docs/scripts/shoot-website.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DC="docker compose -f website/docker-compose.yml"
CHROME_DEFAULT="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export CHROME="${CHROME:-$CHROME_DEFAULT}"

if [ ! -x "$CHROME" ]; then
  echo "error: Chrome not found at '$CHROME' — set CHROME=/path/to/chrome" >&2
  exit 1
fi

echo "[shots] ensuring WordPress stack is up..."
$DC up -d >/dev/null
for _ in $(seq 1 30); do
  $DC exec -T db mysqladmin ping -uroot -prootpass >/dev/null 2>&1 && break
  sleep 1
done

echo "[shots] listing published pages (excluding posts)..."
$DC run --rm wpcli post list --post_type=page --post_status=publish --fields=url --format=csv 2>/dev/null \
  | tail -n +2 | tr -d '\r' | sort -u | python3 "$SCRIPT_DIR/mklist.py"

if [ ! -d "$SCRIPT_DIR/node_modules/puppeteer-core" ]; then
  echo "[shots] installing puppeteer-core (first run)..."
  ( cd "$SCRIPT_DIR" && npm install --silent )
fi

echo "[shots] capturing full-page screenshots -> docs/media/website/ ..."
node "$SCRIPT_DIR/shoot.mjs"

echo ""
echo "[shots] done. Review docs/media/website/ and update docs/website-walkthrough.md"
echo "        if pages were added/removed, then commit."
