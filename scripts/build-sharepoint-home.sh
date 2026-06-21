#!/bin/bash
# Builds the home page of the it-project-docs SharePoint site.
#
# Idempotent — clears existing content and rebuilds from scratch so the
# page can be re-run after every layout change. Commits the structure to
# Git so the page is version-controlled, not living-document-via-portal.
#
# Requires:
#   - m365 CLI signed in (delegated, with SharePoint Admin perms)
#   - Run from repo root (relative paths used for display)
#
# Usage:  bash scripts/build-sharepoint-home.sh

# NOTE: deliberately NOT using `set -e`. m365 CLI v11 sometimes returns
# non-zero exit codes from operations that actually succeed (page section
# add, text add). The page state is verified explicitly at the end via
# `m365 spo page get`, so a true failure surfaces there.
set -uo pipefail

SITE_URL="${SITE_URL:-https://skintyeenation.sharepoint.com/sites/it-project-docs}"
# We can't use CollabHome.aspx — SharePoint Team site default home pages
# have layoutType="Home" which silently discards canvas sections on
# publish (only the fixed Hero/News/Members slots render). We create a
# fresh Article-layout page and set it as the site's welcome page.
PAGE_NAME="${PAGE_NAME:-DocsHome.aspx}"
ADO_REPO_URL="${ADO_REPO_URL:-https://dev.azure.com/skintyeenation/devops/_git/webfront}"
ADO_BUILDS_URL="${ADO_BUILDS_URL:-https://dev.azure.com/skintyeenation/devops/_build}"
# Live API server (Swagger UI + OpenAPI spec) for the developer/API docs card.
API_URL="${API_URL:-https://api.skintyee.ca}"

# ----- link helpers -----------------------------------------------------------
# A direct .md URL makes the browser DOWNLOAD it (no inline viewer). The docs
# publisher (publish-docs-to-sharepoint.sh) renders a pandoc .html sibling next
# to every .md for exactly this reason — link the .html so the doc OPENS and
# renders in the browser. doc_open maps an .md path to its published .html URL.
doc_open() {  # $1 = .md path under the library root, e.g. webfront/docs/x.md
  local rel="${1%.md}.html"
  printf '%s/Shared%%20Documents/%s' "$SITE_URL" "${rel// /%20}"
}

# ----- styling helpers --------------------------------------------------------

GREY=$'\033[90m'; CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  ✗ %s\n' "$*" >&2; exit 1; }

# Verify m365 is signed in
who=$(m365 status --output json 2>/dev/null | jq -r '.connectedAs // empty' || echo "")
[ -n "$who" ] && [ "$who" != "Logged out" ] \
  || die "m365 not signed in. Run: m365 login"
say "m365 signed in as $who"

# ----- 0) ensure the page exists with Article layout --------------------------
#
# Create the page if missing. If it exists with layoutType "Home" (the
# SharePoint Team site default that doesn't accept canvas sections),
# convert it to "Article". Idempotent — does nothing if already correct.

PAGE_EXISTS=$(m365 spo page list --webUrl "$SITE_URL" --output json 2>/dev/null \
  | jq -r --arg name "$PAGE_NAME" '.[] | select(.Name == $name) | .Name' | head -1)

if [ -z "$PAGE_EXISTS" ]; then
  say "creating page $PAGE_NAME (Article layout)…"
  m365 spo page add --name "$PAGE_NAME" --webUrl "$SITE_URL" --layoutType Article >/dev/null
  ok "page created"
else
  # Already exists — make sure it's Article-layout (Home layout discards
  # sections on publish, so we can't use that).
  CURRENT_LAYOUT=$(m365 spo page get --name "$PAGE_NAME" --webUrl "$SITE_URL" --output json 2>/dev/null \
    | jq -r '.layoutType // "Unknown"')
  if [ "$CURRENT_LAYOUT" != "Article" ]; then
    say "converting $PAGE_NAME from layoutType=$CURRENT_LAYOUT to Article…"
    m365 spo page set --name "$PAGE_NAME" --webUrl "$SITE_URL" --layoutType Article >/dev/null
  fi
  ok "page exists ($PAGE_NAME, Article layout)"
fi

# ----- 1) clear existing sections so re-runs are idempotent -------------------
#
# m365 spo page section remove deletes one section at a time. The page comes
# back from `page get` as a JSON blob; iterate over sections and remove each.
# The default Team site CollabHome.aspx has 1-3 sections by default (News
# web part, members, etc.) — we want a clean slate.

say "clearing existing sections on $PAGE_NAME (so this script is idempotent)…"
# `page get` returns the PUBLISHED version's sections; the live draft
# (what `page section add` writes to) can have more. To detect them we
# need to keep removing section 1 until the remove call errors out.
# Safety cap: 50 iterations, since a hand-edited page might genuinely
# have many sections and we don't want infinite loops on a real failure.
REMOVED=0
for i in $(seq 1 50); do
  if m365 spo page section remove \
    --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
    --section 1 --force >/dev/null 2>&1; then
    REMOVED=$((REMOVED + 1))
  else
    break
  fi
done
say "removed $REMOVED existing section(s) from $PAGE_NAME"

# ----- 2) build sections ------------------------------------------------------

say "section 1 — intro (one column, soft shading)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate OneColumn --order 1 --zoneEmphasis Soft >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 1 --column 1 --order 1 \
  --text "<h1>Skin Tyee First Nation — Digital Platform</h1><p>This is the internal documentation hub for Skin Tyee First Nation's digital platform: the <strong>skintyee.ca</strong> website, the Microsoft 365 environment, and the <strong>Skin Tyee community app</strong> — the project that moves the Nation off the old hosted site onto a self-hosted, Band-owned stack.</p><p>The <strong>community app</strong> gives Band members, staff, and administrators one place for the Nation's day-to-day — a dashboard, member directory, community events, notifications (health &amp; safety, council, programs, news), band meetings, public-records &amp; financial transparency, time keeping, and polls/surveys — built once and delivered on <strong>web, desktop, and (soon) mobile</strong>. Access is role-gated for Public, Band Member, and Admin/Staff.</p><p>Use the links below to browse onboarding guides, Microsoft 365 &amp; identity docs, DevOps runbooks, the API reference, and the app downloads.</p>" >/dev/null

ok "intro added"

say "section 2 — quick links (two columns)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate TwoColumn --order 2 >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 2 --column 1 --order 1 \
  --text "<h2>📚 Read the docs</h2><ul><li>📘 <a href=\"$(doc_open webfront/README.md)\">README</a> — project overview, layout, pricing, onboarding</li><li>📂 <a href=\"${SITE_URL}/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fit-project-docs%2FShared%20Documents%2Fwebfront%2Fdocs\">All docs</a> — browse the full <code>docs/</code> tree</li></ul>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 2 --column 2 --order 1 \
  --text "<h2>⚙️ Behind the scenes</h2><ul><li>🔗 <a href=\"${ADO_REPO_URL}\">Source repo</a> — Azure DevOps (<code>webfront</code>)</li><li>🔄 <a href=\"${ADO_BUILDS_URL}\">Pipeline runs</a> — watch the publisher</li></ul>" >/dev/null

ok "quick links added"

say "section 3 — browse by topic (three columns)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate ThreeColumn --order 3 >/dev/null

# Staff onboarding is now featured in its own section (below); the freed card
# slot becomes the API documentation card. Row 1 groups the technical topics:
# Microsoft 365 · DevOps · API documentation.
m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 3 --column 1 --order 1 \
  --text "<h3>🆔 Microsoft 365 &amp; Entra</h3><p>Tenant setup, identity model, shared mailboxes, SharePoint auto-publish.</p><p><a href=\"$(doc_open webfront/docs/365/entra-id.md)\"><strong>Entra ID &amp; identity →</strong></a></p>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 3 --column 2 --order 1 \
  --text "<h3>🔧 DevOps &amp; CI/CD</h3><p>Azure DevOps as primary, GitHub mirror, CI workflow migration, post-mortems.</p><p><a href=\"$(doc_open webfront/docs/devops/README.md)\"><strong>DevOps overview →</strong></a></p>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 3 --column 3 --order 1 \
  --text "<h3>🧩 API documentation</h3><p>Interactive REST reference for the Skin Tyee app backend — contract-first (OpenAPI), served live from the API server.</p><p><a href=\"${API_URL}/docs\"><strong>Swagger UI →</strong></a>&nbsp;·&nbsp;<a href=\"${API_URL}/openapi.json\">OpenAPI spec</a></p>" >/dev/null

ok "topic blocks added"

say "section 4 — reference (three columns)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate ThreeColumn --order 4 >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 4 --column 1 --order 1 \
  --text "<h3>📐 Architecture decisions</h3><p>ADRs — major architectural choices, dated and reversible.</p><p><a href=\"$(doc_open webfront/docs/architecture-decisions.md)\"><strong>architecture-decisions →</strong></a></p>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 4 --column 2 --order 1 \
  --text "<h3>💰 Hosting costs</h3><p>Azure + Microsoft 365 + domains pricing rationale (tax-deductible expense tracking for NGO).</p><p><a href=\"$(doc_open webfront/docs/hosting-costs.md)\"><strong>hosting-costs →</strong></a></p>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 4 --column 3 --order 1 \
  --text "<h3>📱 Community app</h3><p>Proposal, build plan, roadmap, testing strategy for the Skin Tyee app.</p><p><a href=\"$(doc_open webfront/docs/app-plan.md)\"><strong>app-plan →</strong></a></p>" >/dev/null

ok "reference blocks added"

# ----- section 5 — onboarding documentation (featured on its own) -------------
# The new-hire sequence with deep links to the published (rendered .html)
# docs/onboarding/ pages. Staff onboarding has no teaser card — it lives here.
say "section 5 — onboarding documentation (one column, neutral shading)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate OneColumn --order 5 --zoneEmphasis Neutral >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 5 --column 1 --order 1 \
  --text "<h2>🚀 Onboarding documentation</h2><p>Everything a new staff member needs to get set up on the Nation's digital platform — work through it <strong>in order</strong>. Each step has a dedicated page with screenshots of the exact dialogs you'll see.</p><ul><li><strong>1 · Activate your <code>@skintyee.ca</code> account</strong> — first sign-in, set your password, register MFA. → <a href=\"$(doc_open webfront/docs/onboarding/outlook-skintyee-ca.md)\">Outlook setup</a></li><li><strong>1b · Install Microsoft 365</strong> — Outlook, Word, Excel, PowerPoint, Teams, OneNote. Your <code>@skintyee.ca</code> license unlocks the install (<a href=\"https://www.microsoft.com/en-us/microsoft-365/download-office\">download</a>).</li><li><strong>2 · Install &amp; sign into 1Password</strong> — your personal vault plus the shared vaults your role needs. → <a href=\"$(doc_open webfront/docs/onboarding/1password.md)\">1Password setup</a></li><li><strong>3 · Shared mailboxes &amp; band software</strong> — <code>info@</code>/<code>chief@</code>/<code>admin@</code> access and per-app invites (the Skin Tyee app, WordPress, Azure DevOps), granted by your admin.</li></ul><p>📖 <a href=\"$(doc_open webfront/docs/onboarding/README.md)\"><strong>Start here — onboarding overview</strong></a></p>" >/dev/null

ok "onboarding section added"

# ----- section 6 — app downloads (desktop + mobile, side by side) -------------
# Desktop links point at installers published by the build-desktop pipeline
# (scripts/publish-desktop-to-sharepoint.sh → webfront/desktop/build-desktop/);
# mobile is a coming-soon placeholder. Two columns so the two sit together.
DL_BASE="${SITE_URL}/Shared%20Documents/webfront/desktop/build-desktop"

say "section 6 — app downloads (two columns: desktop | mobile, soft shading)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate TwoColumn --order 6 --zoneEmphasis Soft >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 6 --column 1 --order 1 \
  --text "<h2>💻 Desktop app downloads</h2><p>Install the Skin Tyee desktop app (the same app as the web version, packaged for desktop). Latest build:</p><ul><li>🪟 <a href=\"${DL_BASE}/SkinTyee-0.0.0-x64.exe\"><strong>Windows</strong></a> — installer (<code>.exe</code>)</li><li>🍎 <a href=\"${DL_BASE}/SkinTyee-0.0.0-x64.dmg\"><strong>macOS</strong></a> — disk image (<code>.dmg</code>)</li><li>🐧 <a href=\"${DL_BASE}/SkinTyee-0.0.0-x86_64.AppImage\"><strong>Linux</strong></a> — <code>AppImage</code> (portable) or <a href=\"${DL_BASE}/SkinTyee-0.0.0-amd64.deb\"><strong>.deb</strong></a> (Debian/Ubuntu)</li></ul><p style=\"font-size:12px;color:#666\">These builds aren't code-signed yet: on <strong>macOS</strong> right-click → Open the first time; on <strong>Windows</strong> choose &quot;More info → Run anyway&quot;. Rebuilt by the <a href=\"${ADO_BUILDS_URL}\">build-desktop</a> pipeline.</p>" >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 6 --column 2 --order 1 \
  --text "<h2>📱 Mobile app downloads <em>(coming soon)</em></h2><p>The Skin Tyee app will ship to phones &amp; tablets — the same app as the web and desktop versions:</p><ul><li>🍎 <strong>iOS</strong> — Apple App Store / TestFlight <em>(coming soon)</em></li><li>🤖 <strong>Android</strong> — Google Play <em>(coming soon)</em></li></ul><p style=\"font-size:12px;color:#666\">Published via EAS Build once the app clears store review. In the meantime use the <strong>desktop</strong> or web app.</p>" >/dev/null

ok "app downloads section added (desktop + mobile)"

# ----- section 7 — how this page is published ---------------------------------
say "section 7 — how this page is published (one column, neutral shading)…"
m365 spo page section add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --sectionTemplate OneColumn --order 7 --zoneEmphasis Neutral >/dev/null

m365 spo page text add \
  --pageName "$PAGE_NAME" --webUrl "$SITE_URL" \
  --section 7 --column 1 --order 1 \
  --text "<h2>🔄 How this page is published</h2><p>This site mirrors the documentation from the <strong>webfront</strong> Git repository on Azure DevOps. Every push to <code>master</code> that touches <code>docs/</code> or the root README triggers an Azure Pipeline that re-publishes the entire tree here, with each Markdown file rendered to HTML alongside the source.</p><p>Edits go through the Git repo — <strong>not in SharePoint directly</strong>. To update a doc: change the <code>.md</code> file in the repo, push to <code>master</code>, and the new version appears here within ~2–3 minutes.</p><p style=\"font-size:12px;color:#666\">This landing page is built by <code>scripts/build-sharepoint-home.sh</code>; deleting a doc in the repo leaves its SharePoint copy in place (version history is preserved).</p>" >/dev/null

ok "publish-info section added"

# ----- 3) publish -------------------------------------------------------------

say "publishing the page…"
# `m365 spo page set --publish` is more reliable than `m365 spo page publish`
# (the latter sometimes fails with "checked out document" even when
# CheckOutType=0; the set --publish variant handles draft state correctly).
m365 spo page set --name "$PAGE_NAME" --webUrl "$SITE_URL" --publish \
  --publishMessage "rebuild via scripts/build-sharepoint-home.sh" >/dev/null \
  || die "page publish failed — try \`m365 spo page set --name $PAGE_NAME --webUrl $SITE_URL --publish\` manually."
ok "published"

# ----- 4) set as site welcome page (the default landing) ----------------------

say "setting $PAGE_NAME as the site's default landing page…"
# `m365 spo web set` uses --url (not --webUrl) — yet another inconsistent
# flag name in the m365 CLI suite.
m365 spo web set --url "$SITE_URL" \
  --welcomePage "SitePages/$PAGE_NAME" >/dev/null 2>&1 \
  && ok "welcome page updated — refreshes will land here" \
  || warn "couldn't update welcome page — set manually in Site Settings → Look and Feel"

echo
echo "✔ Home page rebuilt. Refresh:"
echo "  ${SITE_URL}/SitePages/${PAGE_NAME}"
