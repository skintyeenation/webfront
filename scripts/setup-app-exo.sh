#!/usr/bin/env bash
# setup-app-exo.sh — wire skintyee-app-graph for Exchange Online PowerShell
# ----------------------------------------------------------------------------
# Exchange Online does NOT accept client secrets for app-only auth — only
# certificates. This script:
#
#   1. Generates a self-signed cert (RSA 2048, 2yr) using openssl
#   2. Uploads the public cert (.cer) to the skintyee-app-graph Entra app
#   3. Adds the Exchange.ManageAsApp application permission (Office 365
#      Exchange Online resource appId 00000002-0000-0ff1-ce00-000000000000)
#   4. Admin-consents the permission
#   5. Assigns the Entra directory role "Exchange Recipient Administrator"
#      to the SP — this role grants the SP the rights needed to manage
#      mailbox permissions (Add-MailboxPermission, etc.)
#   6. Persists EXO_CERT_PATH, EXO_CERT_PASSWORD, EXO_CERT_THUMBPRINT,
#      EXO_ORGANIZATION, EXO_APP_ID to api/.env
#
# Why a directory role and not just an app permission? Exchange's RBAC
# layer requires the SP to be a recognized admin role-holder; the app-only
# Exchange.ManageAsApp permission is necessary but not sufficient. The
# narrowest role for our needs (mailbox permissions only) is "Exchange
# Recipient Administrator" — not "Exchange Administrator" — least
# privilege.
#
# Re-run safely: idempotent. Use --rotate-cert to mint a fresh one.
# ----------------------------------------------------------------------------
set -euo pipefail

APP_NAME="skintyee-app-graph"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/api"
CERT_DIR="$API_DIR/.exo-cert"
CERT_PFX="$CERT_DIR/exo-app.pfx"
CERT_CER="$CERT_DIR/exo-app.cer"
CERT_KEY="$CERT_DIR/exo-app.key"
CERT_PEM="$CERT_DIR/exo-app.pem"

# Well-known IDs (stable forever)
EXO_RESOURCE_APP_ID="00000002-0000-0ff1-ce00-000000000000"     # Office 365 Exchange Online
EXO_MANAGE_AS_APP="dc50a0fb-09a3-484d-be87-e023b12c6440"        # Exchange.ManageAsApp (Application)
EXO_RECIPIENT_ADMIN_ROLE_TEMPLATE="31392ffb-586c-42d1-9346-e59415a2cc4e"  # Exchange Recipient Administrator

ROTATE_CERT=0
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --rotate-cert) ROTATE_CERT=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --help|-h)
      sed -n '2,/^# ----/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown flag: $1 (use --help)" >&2; exit 1 ;;
  esac
done

say()  { printf "\033[36m▸\033[0m %s\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
die()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }
run()  { if [ $DRY_RUN -eq 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }

# --- Preflight --------------------------------------------------------------
command -v az >/dev/null      || die "az CLI not installed"
command -v openssl >/dev/null || die "openssl not installed"
command -v jq >/dev/null      || die "jq not installed"
command -v pwsh >/dev/null    || die "pwsh not installed — brew install powershell"

TENANT_ID=$(az account show --query 'tenantId' -o tsv)
SUB_ID=$(az account show --query 'id' -o tsv)
say "tenant:       $TENANT_ID"
say "subscription: $SUB_ID"

# Resolve the app's IDs
APP_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)
[ -n "$APP_ID" ] || die "app '$APP_NAME' not found — run scripts/setup-app-graph.sh first"
APP_OBJ_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].id' -o tsv)
SP_OBJ_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)
[ -n "$SP_OBJ_ID" ] || die "service principal for '$APP_NAME' not found"
ok "app: $APP_NAME ($APP_ID)"
ok "  app objectId: $APP_OBJ_ID"
ok "  sp objectId:  $SP_OBJ_ID"

# Resolve tenant's vanity .onmicrosoft.com (EXO -Organization expects this)
TENANT_DOMAIN=$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/organization" \
  --query "value[0].verifiedDomains[?isInitial].name | [0]" -o tsv)
[ -n "$TENANT_DOMAIN" ] || die "couldn't resolve tenant .onmicrosoft.com domain"
ok "  organization: $TENANT_DOMAIN"

# --- Cert generation ----------------------------------------------------
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

if [ -f "$CERT_PFX" ] && [ $ROTATE_CERT -eq 0 ]; then
  say "cert already exists at $CERT_PFX — skipping (use --rotate-cert to mint a new one)"
else
  say "generating self-signed cert (RSA 2048, 730 days)…"
  CERT_PASSWORD=$(openssl rand -base64 24)

  run openssl req -x509 -newkey rsa:2048 -nodes -days 730 \
    -keyout "$CERT_KEY" -out "$CERT_PEM" \
    -subj "/CN=skintyee-app-exo" 2>/dev/null

  # OpenSSL 3 defaults to AES-256-CBC which .NET's PFX reader on macOS
  # can't decrypt (PlatformNotSupportedException). The -legacy flag
  # forces SHA1-3DES which Connect-ExchangeOnline can load.
  run openssl pkcs12 -export -legacy \
    -in "$CERT_PEM" -inkey "$CERT_KEY" \
    -out "$CERT_PFX" \
    -password "pass:$CERT_PASSWORD"

  # Public cert in PEM format for upload to Entra app
  cp "$CERT_PEM" "$CERT_CER"
  chmod 600 "$CERT_PFX" "$CERT_KEY" "$CERT_PEM"
  ok "cert generated"

  # Persist password to a sibling file (gitignored) — needed by api/ to
  # decrypt the PFX at runtime.
  echo -n "$CERT_PASSWORD" > "$CERT_DIR/.password"
  chmod 600 "$CERT_DIR/.password"
fi

# Extract thumbprint (SHA1, uppercase, no colons — EXO format)
CERT_THUMBPRINT=$(openssl x509 -in "$CERT_PEM" -noout -fingerprint -sha1 \
  | sed 's/^.*=//' | tr -d ':' | tr '[:lower:]' '[:upper:]')
ok "thumbprint: $CERT_THUMBPRINT"
CERT_PASSWORD=$(cat "$CERT_DIR/.password")

# --- Upload public cert to the Entra app -------------------------------
say "uploading public cert to '$APP_NAME'…"
# Check if already uploaded (match by thumbprint)
EXISTING_CERT=$(az ad app show --id "$APP_ID" \
  --query "keyCredentials[?customKeyIdentifier=='$(openssl x509 -in $CERT_PEM -noout -fingerprint -sha1 | sed 's/^.*=//' | tr -d ':' | xxd -r -p | base64)'].keyId | [0]" -o tsv 2>/dev/null || true)

if [ -n "$EXISTING_CERT" ]; then
  ok "cert already on app (keyId=$EXISTING_CERT) — skipping upload"
else
  if [ $DRY_RUN -eq 0 ]; then
    az ad app credential reset --id "$APP_ID" \
      --cert "@$CERT_CER" --append --years 2 \
      --display-name "exo-cert-$(date +%Y%m%d)" \
      --query 'keyId' -o tsv > /dev/null
    ok "cert uploaded"
  else
    echo "  [dry-run] az ad app credential reset --id $APP_ID --cert @$CERT_CER --append"
  fi
fi

# --- Add Exchange.ManageAsApp permission ------------------------------
say "adding Exchange.ManageAsApp application permission…"
if [ $DRY_RUN -eq 0 ]; then
  az ad app permission add --id "$APP_ID" \
    --api "$EXO_RESOURCE_APP_ID" \
    --api-permissions "$EXO_MANAGE_AS_APP=Role" 2>&1 | tail -2 || true
  ok "permission added"
fi

# --- Admin-consent ------------------------------------------------------
say "granting admin consent…"
if [ $DRY_RUN -eq 0 ]; then
  # Some tenants need a moment for the permission catalog to propagate
  sleep 3
  az ad app permission admin-consent --id "$APP_ID" 2>&1 | tail -2 || warn "admin-consent returned non-zero — may need manual retry"
  ok "admin consent attempted"
fi

# --- Assign Exchange Recipient Administrator role to the SP -----------
say "assigning 'Exchange Recipient Administrator' role to SP…"
# The role is a directoryRole — activate it (in case it's not already) and assign
EXO_RECIP_ROLE_ID=$(az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles?\$filter=roleTemplateId eq '$EXO_RECIPIENT_ADMIN_ROLE_TEMPLATE'" \
  --query 'value[0].id' -o tsv 2>/dev/null)

if [ -z "$EXO_RECIP_ROLE_ID" ]; then
  warn "directory role not yet activated — activating from template…"
  if [ $DRY_RUN -eq 0 ]; then
    EXO_RECIP_ROLE_ID=$(az rest --method POST \
      --uri "https://graph.microsoft.com/v1.0/directoryRoles" \
      --headers 'Content-Type=application/json' \
      --body "{\"roleTemplateId\": \"$EXO_RECIPIENT_ADMIN_ROLE_TEMPLATE\"}" \
      --query 'id' -o tsv 2>/dev/null || echo "")
  fi
fi
ok "directoryRole id: ${EXO_RECIP_ROLE_ID:-?}"

if [ -n "$EXO_RECIP_ROLE_ID" ] && [ $DRY_RUN -eq 0 ]; then
  # Idempotent: the POST returns "Request_BadRequest: object references
  # already exist" if the SP is already in the role. Tolerate that.
  ADD_OUTPUT=$(az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/directoryRoles/$EXO_RECIP_ROLE_ID/members/\$ref" \
    --headers 'Content-Type=application/json' \
    --body "{\"@odata.id\":\"https://graph.microsoft.com/v1.0/directoryObjects/$SP_OBJ_ID\"}" 2>&1 || true)
  if echo "$ADD_OUTPUT" | grep -q "already exist"; then
    ok "SP already in 'Exchange Recipient Administrator' role"
  elif echo "$ADD_OUTPUT" | grep -qiE "error|bad request"; then
    warn "role assignment had a non-fatal error (see below) — continuing"
    echo "$ADD_OUTPUT" | head -3
  else
    ok "SP assigned to 'Exchange Recipient Administrator'"
  fi
fi

# --- Persist env to api/.env -------------------------------------------
say "writing EXO_* env vars to $API_DIR/.env…"
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$API_DIR/.env" 2>/dev/null; then
    # macOS sed needs the -i ''
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$API_DIR/.env"
  else
    echo "${key}=${val}" >> "$API_DIR/.env"
  fi
}
[ $DRY_RUN -eq 0 ] && {
  upsert_env "EXO_APP_ID"          "$APP_ID"
  upsert_env "EXO_CERT_PATH"       "$CERT_PFX"
  upsert_env "EXO_CERT_PASSWORD"   "$CERT_PASSWORD"
  upsert_env "EXO_CERT_THUMBPRINT" "$CERT_THUMBPRINT"
  upsert_env "EXO_ORGANIZATION"    "$TENANT_DOMAIN"
  chmod 600 "$API_DIR/.env"
  ok "env vars persisted"
}

printf "\n\033[36m═══════════════════════════════════════════════════════════════════════\033[0m\n"
printf "\033[33m   skintyee-app-graph now wired for Exchange Online   \033[0m\n"
printf "\033[36m═══════════════════════════════════════════════════════════════════════\033[0m\n\n"
cat <<EOF
api/.env now contains:
  EXO_APP_ID          $APP_ID
  EXO_CERT_PATH       $CERT_PFX
  EXO_CERT_PASSWORD   *** (24 chars)
  EXO_CERT_THUMBPRINT $CERT_THUMBPRINT
  EXO_ORGANIZATION    $TENANT_DOMAIN

Permissions granted (application):
  • Exchange.ManageAsApp  (Office 365 Exchange Online)

Directory roles assigned to SP:
  • Exchange Recipient Administrator

Test the connection:
  pwsh -NoProfile -Command "
    Connect-ExchangeOnline -AppId $APP_ID \\
      -CertificateFilePath '$CERT_PFX' \\
      -CertificatePassword (ConvertTo-SecureString -String '\$EXO_CERT_PASSWORD' -AsPlainText -Force) \\
      -Organization $TENANT_DOMAIN -ShowBanner:\\\$false
    Get-Mailbox -ResultSize 5 | Select Name,UserPrincipalName,RecipientTypeDetails | Format-Table -AutoSize
    Disconnect-ExchangeOnline -Confirm:\\\$false
  "

To rotate the cert later:
  bash scripts/setup-app-exo.sh --rotate-cert

NOTE: Exchange's RBAC layer may take 5-30 minutes to propagate the role
assignment. If Get-Mailbox returns "access denied" right after setup,
wait and retry.
EOF
