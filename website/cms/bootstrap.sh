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

echo "==> content taxonomy (categories: projects, programs, jobs) — mirrors the website nav"
# Program categories + major-projects + jobs. Posts are filed under these so the
# Next.js Projects / Programs/<slug> / Jobs pages have content.
for cat in major-projects jobs news housing education lands-economic-development social child-family-services health; do
  wpc term list category --field=slug | grep -qx "$cat" || \
    wpc term create category "$cat" --slug="$cat" >/dev/null 2>&1 || true
done

echo "==> sample content (idempotent by slug)"
wpc post list --post_type=page --field=post_name --post_status=any | grep -qx welcome || \
  wpc post create --post_type=page --post_status=publish \
    --post_title='Welcome' --post_name='welcome' \
    --post_content='<p>Welcome to Skin Tyee First Nation.</p>' >/dev/null
# One post per nav category so the website pages render real content.
seed_post() { # slug, title, category, body
  wpc post list --post_type=post --field=post_name --post_status=any | grep -qx "$1" || \
    wpc post create --post_type=post --post_status=publish \
      --post_title="$2" --post_name="$1" --post_category="$(wpc term get category "$3" --by=slug --field=term_id 2>/dev/null)" \
      --post_content="$4" >/dev/null
}
seed_post 'water-system-upgrade' 'Water System Upgrade' 'major-projects' '<p>Major capital project to upgrade the community water system.</p>'
seed_post 'housing-applications-open' 'Housing Applications Open' 'housing' '<p>Applications for on-reserve housing are now open.</p>'
seed_post 'post-secondary-sponsorship' 'Post-Secondary Sponsorship' 'education' '<p>Education sponsorship intake for the coming year.</p>'
seed_post 'band-administrator-posting' 'Band Administrator (Posting)' 'jobs' '<p>We are hiring a Band Administrator. Apply by the closing date.</p>'

echo "==> news posts (dummy content for the website News section)"
NEWS_CAT=$(wpc term get category news --by=slug --field=term_id 2>/dev/null)
seed_news() { # slug, title, excerpt, body
  wpc post list --post_type=post --field=post_name --post_status=any | grep -qx "$1" || \
    wpc post create --post_type=post --post_status=publish \
      --post_title="$2" --post_name="$1" --post_category="$NEWS_CAT" \
      --post_excerpt="$3" --post_content="$4" >/dev/null
}
seed_news 'band-council-election-results' 'Band Council Election Results Announced' 'Members have elected their Chief and Council for the next term.' '<p>Members have elected their Chief and Council for the next term. Meet the incoming leadership.</p>'
seed_news 'new-housing-units-southbank' 'New Housing Units Open at Southbank' 'Six new on-reserve homes are now ready for families.' '<p>Six new on-reserve homes are now ready for families, part of the ongoing housing program.</p>'
seed_news 'annual-salmon-harvest' 'Annual Salmon Harvest Begins on Francois Lake' 'The community gathers for the seasonal salmon harvest.' '<p>The community gathers for the seasonal salmon harvest, continuing a tradition carried for generations.</p>'
seed_news 'water-system-upgrade-milestone' 'Water System Upgrade Reaches Milestone' 'Phase two of the water infrastructure project is complete.' '<p>Phase two of the water infrastructure project is complete, improving service across the reserve.</p>'
seed_news 'youth-culture-camp' 'Youth Culture Camp Returns This Summer' 'Registration is open for the on-the-land culture and language camp.' '<p>Registration is open for the on-the-land culture and language camp for youth ages 8 to 16.</p>'
seed_news 'health-centre-wellness-programs' 'Health Centre Adds New Wellness Programs' 'Expanded mental-health and wellness supports are now available.' '<p>Expanded mental-health and wellness supports are now available to all community members.</p>'
seed_news 'wildfire-preparedness-meeting' 'Wildfire Preparedness Meeting Scheduled' 'Review evacuation plans and FireSmart resources ahead of the season.' '<p>Join emergency services to review evacuation plans and FireSmart resources ahead of the season.</p>'
seed_news 'forestry-partnership-agreement' 'Skin Tyee Signs Forestry Partnership Agreement' 'A new agreement advances sustainable forestry on the territory.' '<p>A new agreement advances sustainable forestry and shared stewardship of the territory.</p>'
seed_news 'elders-gathering-language' "Elders Gathering Celebrates Witsuwit'en Language" "Elders and youth shared stories, songs, and the Witsuwit'en language." "<p>Elders and youth came together to share stories, songs, and the living Witsuwit'en language.</p>"
seed_news 'broadband-expansion' 'Broadband Expansion Connects More Homes' 'High-speed internet reaches additional households.' '<p>High-speed internet reaches additional households as the connectivity project continues.</p>'
seed_news 'community-garden-volunteers' 'Community Garden Project Seeks Volunteers' 'Lend a hand at the community garden, all ages welcome.' '<p>Lend a hand at the community garden. No experience needed, all ages welcome.</p>'
seed_news 'road-maintenance-southbank' 'Road Maintenance Notice: Southbank Road' 'Expect short delays next week as crews complete repairs.' '<p>Expect short delays next week as crews complete seasonal grading and repairs on Southbank Road.</p>'

echo ""
echo "==> CMS ready"
echo "    Admin: $URL/wp-admin   ($ADMIN_USER / $ADMIN_PASS — local dev only)"
echo "    REST:  $URL/wp-json/wp/v2/posts"
