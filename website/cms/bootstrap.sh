#!/usr/bin/env bash
#
# Bring up the headless WordPress CMS and make it ready for the Next.js frontend:
# install WP, activate the base block theme, enable pretty permalinks (clean REST
# + page slugs), and create a little idempotent sample content. Re-runnable.
#
#   ./cms/bootstrap.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."   # website/ — the docker-compose root

URL=${WP_URL:-http://localhost:8080}
TITLE=${WP_TITLE:-Skin Tyee First Nation}
ADMIN_USER=${WP_ADMIN_USER:-admin}
ADMIN_PASS=${WP_ADMIN_PASS:-admin}
ADMIN_EMAIL=${WP_ADMIN_EMAIL:-admin@skintyee.ca}

wpc() { docker compose run --rm -T wpcli wp "$@"; }

echo "==> bringing up the CMS stack"
docker compose up -d

echo "==> waiting for WordPress at $URL"
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ]; } && break
  sleep 2
done
echo "    http $code"

if wpc core is-installed >/dev/null 2>&1; then
  echo "==> WordPress already installed"
else
  echo "==> installing WordPress"
  wpc core install --url="$URL" --title="$TITLE" \
    --admin_user="$ADMIN_USER" --admin_password="$ADMIN_PASS" \
    --admin_email="$ADMIN_EMAIL" --skip-email
fi

echo "==> base block theme + pretty permalinks"
wpc theme activate twentytwentyfive 2>/dev/null || wpc theme activate twentytwentyfour
wpc rewrite structure '/%postname%/' --hard >/dev/null
wpc rewrite flush --hard >/dev/null

echo "==> sample content (idempotent by slug)"
wpc post list --post_type=page --field=post_name --post_status=any | grep -qx welcome || \
  wpc post create --post_type=page --post_status=publish \
    --post_title='Welcome' --post_name='welcome' \
    --post_content='<p>Welcome to Skin Tyee First Nation.</p>' >/dev/null
wpc post list --post_type=post --field=post_name --post_status=any | grep -qx hello-skintyee || \
  wpc post create --post_type=post --post_status=publish \
    --post_title='Hello Skin Tyee' --post_name='hello-skintyee' \
    --post_content='<p>The first community post on the new site.</p>' >/dev/null

echo ""
echo "==> CMS ready"
echo "    Admin: $URL/wp-admin   ($ADMIN_USER / $ADMIN_PASS — local dev only)"
echo "    REST:  $URL/wp-json/wp/v2/posts"
