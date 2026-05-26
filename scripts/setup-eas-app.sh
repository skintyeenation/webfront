#!/bin/bash
# Set up EAS Build for the Skin Tyee community app (app/), and wire the
# EXPO_TOKEN secret into the ADO variable group so the build-app pipeline
# can run unattended.
#
# What this script does:
#
#   1. Verifies eas-cli is installed (installs globally if missing).
#   2. Logs you into Expo (interactive — opens browser).
#   3. Runs `eas init` in app/ — creates an Expo project on your
#      account if needed, writes the project ID into app.config.js
#      (under `extra.eas.projectId`). Idempotent.
#   4. Walks you through `eas credentials` for iOS + Android — uploads
#      your Apple Developer signing cert / Google Play service account
#      to EAS' encrypted credential store. (Interactive, one-time.)
#   5. Generates an Expo Personal Access Token (or asks you to paste
#      one you've already generated at expo.dev) and stores it as a
#      secret variable on the ADO 'skintyee-prod-azure' variable group.
#
# Prereqs:
#   - Expo account (free) at expo.dev. Use admin@skintyee.ca or the
#     team's shared developer account.
#   - Apple Developer Program account ($99/yr) for iOS App Store
#     distribution. App Store Connect API Key (.p8) ready (or EAS
#     will generate certificates for you on first run — easier).
#   - Google Play Console account ($25 one-time) for Android Play Store.
#     Service Account JSON key for the Play Developer API.
#   - az CLI signed in to skintyeenation; ADO variable group
#     'skintyee-prod-azure' already exists (run setup-api-azure.sh first).
#
# Usage:
#   bash scripts/setup-eas-app.sh

set -uo pipefail

# ----- styling helpers --------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
[ -d "$APP_DIR" ] || die "expected app/ directory at $APP_DIR"

ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VG_NAME="${ADO_VG_NAME:-skintyee-prod-azure}"

# ----- prereqs ---------------------------------------------------------------
command -v node >/dev/null || die "node not found — install Node 22 (nvm install 22; nvm use 22)"
command -v npm  >/dev/null || die "npm not found — comes with Node"
command -v az   >/dev/null || die "az CLI not found — see docs/devops/azure-devops-setup.md"

# Node 22 check — EAS CLI 12+ requires it.
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || warn "Node $NODE_MAJOR detected — EAS CLI prefers Node 22+. Consider \`nvm use 22\`."

# ----- 1) install eas-cli ----------------------------------------------------
if ! command -v eas >/dev/null 2>&1; then
  say "installing eas-cli globally…"
  npm install -g eas-cli
fi
say "eas version: $(eas --version)"

# ----- 2) Expo login ---------------------------------------------------------
if ! eas whoami >/dev/null 2>&1; then
  say "logging in to Expo (browser will open)…"
  eas login \
    || die "eas login failed."
fi
EXPO_USER=$(eas whoami 2>/dev/null | head -1)
ok "Expo signed in as: $EXPO_USER"

# ----- 3) eas init in app/ ---------------------------------------------------
cd "$APP_DIR"

# Check if the project is already initialized — look for `extra.eas.projectId`
# in app.config.js or app.json.
PROJ_INITIALIZED=$(node -e "
  try {
    const cfg = require('./app.config.js').expo;
    process.stdout.write(cfg.extra?.eas?.projectId || '');
  } catch (e) { process.stdout.write(''); }
")

if [ -z "$PROJ_INITIALIZED" ]; then
  say "running 'eas init' to create the project on Expo…"
  warn "  if prompted to create a new project, accept the default slug 'skintyee-app'."
  eas init || die "eas init failed — try manually: cd app && eas init"
  ok "eas init complete"
else
  ok "Expo project already initialized (id: ${PROJ_INITIALIZED:0:8}…)"
fi

# ----- 4) credentials for iOS + Android --------------------------------------
say "configuring iOS credentials (interactive — uploads or generates certs)…"
warn "  Recommended: pick 'Let Expo manage certificates' if this is your first build."
warn "  You'll need to sign in with admin@skintyee.ca / your Apple ID + 2FA."
echo
printf '  Skip iOS credentials setup for now? [y/N] '
read -r skip_ios
if [ "$skip_ios" != "y" ] && [ "$skip_ios" != "Y" ]; then
  eas credentials --platform ios \
    || warn "iOS credentials setup had issues — re-run \`eas credentials --platform ios\` later."
else
  warn "iOS credentials skipped — first build will fail until configured."
fi

echo
say "configuring Android credentials (interactive — uploads keystore + Play service account)…"
warn "  Recommended: pick 'Generate a new Keystore' if this is your first build."
warn "  For submission to Play Store, also upload your service account JSON."
echo
printf '  Skip Android credentials setup for now? [y/N] '
read -r skip_android
if [ "$skip_android" != "y" ] && [ "$skip_android" != "Y" ]; then
  eas credentials --platform android \
    || warn "Android credentials setup had issues — re-run \`eas credentials --platform android\` later."
else
  warn "Android credentials skipped — first build will fail until configured."
fi

# ----- 5) EXPO_TOKEN for CI -------------------------------------------------
echo
say "wiring EXPO_TOKEN into the ADO '$ADO_VG_NAME' variable group…"
echo
echo "  1) Open <https://expo.dev/settings/access-tokens> in a browser"
echo "     (signed in as $EXPO_USER)"
echo "  2) Click 'Create Token', give it the name 'azure-pipelines-skintyee'"
echo "  3) Copy the token (only shown once — also save to 1Password IT/Admin vault)"
echo

printf '  Paste the token here (input hidden): '
read -rs EXPO_TOKEN_VALUE; echo
[ -n "$EXPO_TOKEN_VALUE" ] || die "no token provided."

# Sign in to az if needed
if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  az login --only-show-errors >/dev/null
fi

VG_ID=$(az pipelines variable-group list \
  --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='$ADO_VG_NAME'].id | [0]" -o tsv 2>/dev/null || echo "")
[ -n "$VG_ID" ] && [ "$VG_ID" != "null" ] \
  || die "variable group '$ADO_VG_NAME' not found. Run scripts/setup-api-azure.sh first."

EXISTS=$(az pipelines variable-group variable list \
  --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --group-id "$VG_ID" \
  --query 'EXPO_TOKEN.value' -o tsv 2>/dev/null || echo "")

if [ -z "$EXISTS" ]; then
  az pipelines variable-group variable create \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --group-id "$VG_ID" \
    --name EXPO_TOKEN \
    --secret true \
    --value "$EXPO_TOKEN_VALUE" \
    --only-show-errors >/dev/null
  ok "EXPO_TOKEN created in $ADO_VG_NAME"
else
  az pipelines variable-group variable update \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --group-id "$VG_ID" \
    --name EXPO_TOKEN \
    --secret true \
    --value "$EXPO_TOKEN_VALUE" \
    --only-show-errors >/dev/null
  ok "EXPO_TOKEN updated in $ADO_VG_NAME"
fi

# ----- 6) register the build-app pipeline ------------------------------------
say "registering ADO pipeline 'build-app' (azure-pipelines/Builds/build-app.yml)…"
P_ID=$(az pipelines list --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
  --query "[?name=='build-app'].id | [0]" -o tsv 2>/dev/null || echo "")
if [ -z "$P_ID" ] || [ "$P_ID" = "null" ]; then
  az pipelines create \
    --org "$ADO_ORG_URL" --project "$ADO_PROJECT" \
    --name "build-app" \
    --repository webfront \
    --repository-type tfsgit \
    --branch master \
    --yml-path "azure-pipelines/Builds/build-app.yml" \
    --skip-first-run \
    --only-show-errors >/dev/null \
    && ok "build-app pipeline registered" \
    || warn "couldn't register pipeline — register manually in ADO UI."
else
  ok "build-app pipeline already exists (id $P_ID)"
fi

# ----- final summary ---------------------------------------------------------
cat <<EOF

${GRN}✔ done — EAS Build is wired up.${RST}

Next steps:

  1. ${CYAN}Test a 'development' build${RST} (fastest, no signing in real cert sense):

       cd app
       eas build --platform ios --profile development --non-interactive

     Watch progress at https://expo.dev → Builds tab.

  2. ${CYAN}First production build${RST}, from ADO:

       Go to $ADO_ORG_URL/$ADO_PROJECT/_build → 'build-app' → Run pipeline.
       Pick: buildProfile = preview, platform = all.

  3. ${CYAN}Submit to TestFlight / Play Internal Testing${RST} when ready:

       Run the pipeline with: buildProfile = production, submitToStores = true.
     Or manually:  cd app && eas submit --platform ios --latest

  4. ${CYAN}Replace placeholders in app/eas.json${RST}:
     - submit.production.ios.appleId        → your Apple ID email
     - submit.production.ios.ascAppId       → App Store Connect app id
     - submit.production.ios.appleTeamId    → your Apple Developer Team id

For more detail, see docs/devops/app-deploy-eas.md.

EOF
