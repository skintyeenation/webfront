#!/usr/bin/env bash
# Import scraped content into the running WordPress container via WP-CLI.
#
# Run from the repo root after `docker compose up -d` has finished and after
# the scraper has produced ./scraped/manifest.json.

set -euo pipefail

cd "$(dirname "$0")/.."

WP="docker compose run --rm wpcli"

# 0. Auto-backup before doing anything potentially destructive.
#    Several scripts below modify post_content / theme_mods / menus
#    in-place; if the user has made manual edits in wp-admin since the
#    last script run, this snapshot is their rollback. Skipped on fresh
#    installs (nothing to back up yet).
if $WP core is-installed >/dev/null 2>&1; then
  echo "[setup] taking pre-import backup..."
  ./backup.sh
  echo ""
fi

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

# 3. Activate Astra (clean, flexible, classic 'primary' menu location, widely used
#    for community / non-profit sites). The bundled block themes don't register
#    classic menu locations, so the nav we build needs a classic-theme target.
THEME="${SKINTYEE_THEME:-astra}"
if ! $WP theme is-installed "$THEME" 2>/dev/null; then
  $WP theme install "$THEME" --activate
else
  $WP theme activate "$THEME"
fi

# 4. Install all skintyee mu-plugins:
#    - skintyee-grid: Bootstrap-grid CSS shim for imported markup
#    - skintyee-cli-fix: pre-loads is_plugin_active() so Elementor 4.x doesn't
#      fatal-error every time wp-cli runs (known Elementor bug)
#    - skintyee-image-sizes: registers skintyee_card hard-cropped thumbnail
#    - skintyee-news-filter: restricts /news/ blog index to News-category posts
mkdir -p wp-data/wp-content/mu-plugins
cp -r wp-plugins/skintyee-grid wp-data/wp-content/mu-plugins/
cp -r wp-plugins/skintyee-cli-fix wp-data/wp-content/mu-plugins/
cp -r wp-plugins/skintyee-image-sizes wp-data/wp-content/mu-plugins/ 2>/dev/null || true
cp -r wp-plugins/skintyee-news-filter wp-data/wp-content/mu-plugins/
# Loader stubs at the mu-plugins root (WP only auto-loads top-level .php there).
cat > wp-data/wp-content/mu-plugins/skintyee-grid-loader.php <<'PHP'
<?php
require_once __DIR__ . '/skintyee-grid/skintyee-grid.php';
PHP
cat > wp-data/wp-content/mu-plugins/skintyee-cli-fix-loader.php <<'PHP'
<?php
require_once __DIR__ . '/skintyee-cli-fix/skintyee-cli-fix.php';
PHP
if [ -f wp-data/wp-content/mu-plugins/skintyee-image-sizes/skintyee-image-sizes.php ]; then
  cat > wp-data/wp-content/mu-plugins/skintyee-image-sizes-loader.php <<'PHP'
<?php
require_once __DIR__ . '/skintyee-image-sizes/skintyee-image-sizes.php';
PHP
fi
cat > wp-data/wp-content/mu-plugins/skintyee-news-filter-loader.php <<'PHP'
<?php
require_once __DIR__ . '/skintyee-news-filter/skintyee-news-filter.php';
PHP

# 5. Apply Astra brand customization (colors, typography, header layout) so the
#    imported content reads like a designed site instead of vanilla Astra defaults.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/astra-brand.php");'

# 6. Install Astra Sites (Starter Templates) + Elementor. Elementor is required
#    by build-home-elementor.php below. Astra Sites is optional but lets the
#    user install design demos from wp-admin if they want a fuller template.
for plugin in elementor astra-sites; do
  if ! $WP plugin is-installed "$plugin" 2>/dev/null; then
    $WP plugin install "$plugin" --activate
  else
    $WP plugin activate "$plugin"
  fi
done

# 7. Hand off to the PHP importer running inside the wpcli container.
#    The importer reads the manifest, calls `wp media import` and `wp post create`,
#    and patches {{MEDIA:...}} placeholders with the uploaded attachment URLs.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli /importer/import.php

# 8. Create the /news/ page first so step 9 can reference it from the footer
#    menu. WP's page_for_posts option points here so the post archive renders
#    at /news/ automatically.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/setup-news.php");'

# 9. Rename pages to short titles + rebuild the two menus (header + footer).
#    Footer menu includes /news/ which step 8 created above.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/rename-and-menus.php");'

# 10. Populate Astra's Main Sidebar with two poster image widgets. Used by any
#     page configured with a right-sidebar layout (the Elementor home below
#     deliberately does NOT use the sidebar — its posters are a column instead).
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/set-sidebar-widgets.php");'

# 10b. Strip Site123 breadcrumbs + related-article blocks from imported post
#      content so the home news cards' excerpts read cleanly and individual
#      post pages don't render a redundant top breadcrumb.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/clean-post-content.php");'

# 10c. Normalize ALL-CAPS imported titles to title case (Site123 had many
#      pages with screaming titles). Acronyms like FNHA / STN / OYEP stay
#      uppercase via the KEEP_UPPER list in the script.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/normalize-titles.php");'

# 10d. Rename ugly Site123 post slugs (e.g. "9-steps-to-starting-a-business")
#      to slugs that match the post title.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/fix-post-slugs.php");'

# 10e. Split the combined FNHA News post into two single-topic posts.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/split-fnha-news.php");'

# 10f. Convert specific event/program pages to posts so they appear in the
#      Events / Programs category archives.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/convert-pages-to-posts.php");'

# 10g. Set up hierarchical category taxonomy (Events / Programs / News /
#      Announcements with sub-cats) and assign posts to multiple categories.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/setup-categories.php");'

# 10h. Split the Burns Lake District news page into individual News posts and
#      convert "Let the Preparations Begin" to an Events post.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/split-burns-lake-news.php");'

# 11. Rebuild the home page as native Elementor widgets (hero / 2-col body /
#     news / testimonial). This clears the home's post_content; _elementor_data
#     is the single source of truth from here on.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/build-home-elementor.php");'

# 12. Rebuild the 6 main section pages (About / History / Culture / Leadership /
#     Administration / Projects) with researched content + hero photos for the
#     non-staff pages.
docker compose run --rm \
  --entrypoint /usr/local/bin/php \
  wpcli -r 'require_once("/var/www/html/wp-load.php"); require("/importer/build-section-pages.php");'

echo ""
echo "[done] http://localhost:8080/"
echo "       admin: http://localhost:8080/wp-admin/  (admin / admin)"
