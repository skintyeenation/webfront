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

# Preseed a brand-new instance from the checked-in dataset, so a fresh
# staging/production WordPress comes up with the existing content instead of an
# empty install. Only runs when WordPress isn't installed yet.
SEED_SQL="cms/wp-initial.sql"
if [ -f "$SEED_SQL" ] && ! wpc core is-installed >/dev/null 2>&1; then
  echo "==> preseeding database from $SEED_SQL"
  docker compose exec -T db mysql -uroot -proot "${WORDPRESS_DB_NAME:-skintyee}" < "$SEED_SQL"
  # Point the imported site at this instance's URL.
  wpc option update home "$URL" >/dev/null 2>&1 || true
  wpc option update siteurl "$URL" >/dev/null 2>&1 || true
fi

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
for cat in major-projects jobs news oil-gas minerals-mining housing-economic-development forestry-conservation telecommunications housing education lands-economic-development social child-family-services health; do
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
seed_news 'language-nest-program' "Witsuwit'en Language Nest Welcomes New Learners" 'More young children are learning the language this fall.' "<p>The Witsuwit'en language nest welcomes more young learners this fall as the program expands.</p>"

echo "==> major-project sector posts (dummy projects under the home-page sectors)"
seed_post 'coastal-gaslink-benefit' 'Coastal GasLink Benefit Agreement' 'oil-gas' '<p>Benefit and revenue-sharing agreement for natural gas activity on the territory.</p>'
seed_post 'natural-gas-revenue-sharing' 'Natural Gas Revenue Sharing' 'oil-gas' '<p>Negotiating revenue sharing from natural gas development.</p>'
seed_post 'mineral-exploration-agreement' 'Mineral Exploration Agreement' 'minerals-mining' '<p>Responsible mineral exploration partnership and impact-benefit terms.</p>'
seed_post 'southbank-housing-development' 'Southbank Housing Development' 'housing-economic-development' '<p>New on-reserve housing and infrastructure at Southbank.</p>'
seed_post 'band-owned-enterprise' 'Band-Owned Enterprise Initiative' 'housing-economic-development' '<p>Developing band-owned enterprises and local employment.</p>'
seed_post 'community-forest-tenure' 'Community Forest Tenure' 'forestry-conservation' '<p>Pursuing a community forest tenure for sustainable forestry.</p>'
seed_post 'salmon-habitat-restoration' 'Salmon Habitat Restoration' 'forestry-conservation' '<p>Restoring salmon habitat and stewarding the watershed.</p>'
seed_post 'rural-broadband-expansion' 'Rural Broadband Expansion' 'telecommunications' '<p>Extending high-speed broadband to more homes in the community.</p>'
seed_post 'lng-workforce-training' 'LNG Workforce Training' 'oil-gas' '<p>Training and employment pathways in the natural gas sector.</p>'
seed_post 'pipeline-row-monitoring' 'Pipeline Right-of-Way Monitoring' 'oil-gas' '<p>Community monitoring of the pipeline right-of-way and reclamation.</p>'
seed_post 'geoscience-mapping' 'Geoscience Mapping Project' 'minerals-mining' '<p>Mapping mineral potential across the territory.</p>'
seed_post 'reclamation-standards-review' 'Reclamation Standards Review' 'minerals-mining' '<p>Reviewing mine reclamation and closure standards.</p>'
seed_post 'elder-housing-renovations' 'Elder Housing Renovations' 'housing-economic-development' '<p>Renovating and adapting homes for elders.</p>'
seed_post 'community-economic-plan' 'Community Economic Plan' 'housing-economic-development' '<p>A five-year community economic development plan.</p>'
seed_post 'wildfire-fuel-management' 'Wildfire Fuel Management' 'forestry-conservation' '<p>FireSmart fuel management around the community.</p>'
seed_post 'caribou-habitat-stewardship' 'Caribou Habitat Stewardship' 'forestry-conservation' '<p>Protecting and stewarding caribou habitat.</p>'
seed_post 'emergency-communications-upgrade' 'Emergency Communications Upgrade' 'telecommunications' '<p>Upgrading emergency communications coverage.</p>'
seed_post 'public-wifi-hotspots' 'Public Wi-Fi Hotspots' 'telecommunications' '<p>Free public Wi-Fi at community facilities.</p>'

echo ""
echo "==> CMS ready"
echo "    Admin: $URL/wp-admin   ($ADMIN_USER / $ADMIN_PASS — local dev only)"
echo "    REST:  $URL/wp-json/wp/v2/posts"
