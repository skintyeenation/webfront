#!/usr/bin/env bash
# Export the imported content as a WXR (WordPress eXtended RSS) file that can
# be imported into the production WordPress install at skintyee.ca via:
#
#     Tools → Import → WordPress
#
# The WXR will include all posts, pages, attachments (as references — the
# importer on the target side downloads them from this site's /wp-content/uploads/),
# categories, tags, and menus.
#
# IMPORTANT: For attachments to import correctly on the target side, this
# instance's /wp-content/uploads/ must be reachable from the target server when
# the import runs. For a local-to-prod move, the recommended workflow is:
#
#   1. Run this script to get exports/skintyee-export.xml
#   2. Copy wp-data/wp-content/uploads/ to the target server's uploads/ dir
#   3. (Optional) Use the WP "Better Search Replace" plugin on the target to
#      rewrite http://localhost:8080 -> https://skintyee.ca in post content.
#   4. Import the WXR on the target — it will skip downloading attachments
#      because they're already at the matching path.

set -euo pipefail

cd "$(dirname "$0")"

mkdir -p exports
rm -f exports/skintyee-export exports/skintyee-export.xml

docker compose run --rm \
  -v "$(pwd)/exports:/exports" \
  wpcli export \
    --dir=/exports \
    --filename_format=skintyee-export \
    --skip_comments

# wp-cli writes a file named exactly as given by --filename_format (no .xml suffix).
# Rename so the result is recognizable as the WXR file it is.
mv exports/skintyee-export exports/skintyee-export.xml

echo ""
echo "Wrote exports/skintyee-export.xml"
ls -lh exports/skintyee-export.xml
