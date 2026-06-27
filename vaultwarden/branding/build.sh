#!/usr/bin/env bash
# Generate user.vaultwarden.scss.hbs from the .in template by inlining the
# Skin Tyee login logo as a base64 data-URI (so the lock screen needs no
# external asset fetch). Re-run after changing the logo or the template.
#
#   ./build.sh
#
# Then deploy the generated file to the running app's /data share:
#   az storage file upload --account-name <vwdata-acct> --share-name vwdata \
#     --source user.vaultwarden.scss.hbs --path templates/scss/user.vaultwarden.scss.hbs
# (see ../README.md → "Branding").
set -euo pipefail
cd "$(dirname "$0")"

LOGO="skintyee-login-logo.png"
TEMPLATE="user.vaultwarden.scss.hbs.in"
OUT="user.vaultwarden.scss.hbs"

[ -f "$LOGO" ] || { echo "missing $LOGO" >&2; exit 1; }
[ -f "$TEMPLATE" ] || { echo "missing $TEMPLATE" >&2; exit 1; }

B64="$(base64 < "$LOGO" | tr -d '\n')"
DATA_URI="data:image/png;base64,${B64}"

# Use awk to substitute so the long data-URI never hits sed's line limits.
awk -v uri="$DATA_URI" '{ gsub(/@@LOGO_DATA_URI@@/, uri); print }' "$TEMPLATE" > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
