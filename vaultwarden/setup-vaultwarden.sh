#!/usr/bin/env bash
#
# setup-vaultwarden.sh - one-time provisioning for the Vaultwarden Container App
# (shared password manager). Idempotent + re-runnable. After this, the
# azure-pipelines/Deployments/deploy-vaultwarden.yml pipeline handles all future
# image bumps + secret/env syncs.
#
# Creates / ensures:
#   1. the `vaultwarden` database on the existing skintyee-prod-pg flex server
#   2. a Storage account + Azure Files share for /data, registered on the
#      managed environment (RSA JWT keys, attachments, Sends, icon cache)
#   3. the Container App (from containerapp.yaml) - external HTTPS, single replica
#   4. its secrets (DATABASE_URL -> vaultwarden db, ADMIN_TOKEN for /admin)
#   5. the vault.skintyee.ca custom hostname (prints the DNS records to add;
#      binds when DNS resolves, unless --skip-domain)
#
# Decision + topology: ADR-18 + vaultwarden/README.md.
#
# Usage:
#   PG_PASSWORD=... [VW_ADMIN_TOKEN=...] ./setup-vaultwarden.sh [--dry-run] [--skip-domain]
#
# Requires: az (logged in, correct subscription). Optionally docker (to hash the
# admin token via the vaultwarden image; falls back to a random plain token).
# Keep this file ASCII-only.
set -euo pipefail

# ---- config (env-overridable) ---------------------------------------------
RG=${RG:-skintyee-prod-rg}
ENV_NAME=${ENV_NAME:-skintyee-prod-env}
APP=${APP:-vaultwarden}
REGION=${REGION:-canadacentral}
DOMAIN=${DOMAIN:-vault.skintyee.ca}

PG_SERVER=${PG_SERVER:-skintyee-prod-pg}
PG_DB=${PG_DB:-vaultwarden}
PG_HOST=${PG_HOST:-${PG_SERVER}.postgres.database.azure.com}
PG_PORT=${PG_PORT:-5432}
PG_SSL=${PG_SSL:-require}
PG_USER=${PG_USER:-pgadmin}
PG_PASSWORD=${PG_PASSWORD:-}                 # optional: if unset, the pg creds are
                                            # reused from API_APP's database-url
                                            # secret (already in Azure) - no extra env.
API_APP=${API_APP:-api-prod}

STORAGE_ACCOUNT=${STORAGE_ACCOUNT:-skintyeevwdata}
FILE_SHARE=${FILE_SHARE:-vaultwarden-data}
FILE_QUOTA_GB=${FILE_QUOTA_GB:-5}
ENV_STORAGE=${ENV_STORAGE:-vwdata}

IMAGE=${IMAGE:-vaultwarden/server:1.32.7}
VW_ADMIN_TOKEN=${VW_ADMIN_TOKEN:-}           # optional; generated if unset

DRY_RUN=0
SKIP_DOMAIN=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[err]\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '\033[33m[dry-run]\033[0m %s\n' "$*"; else eval "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     DRY_RUN=1; shift ;;
    --skip-domain) SKIP_DOMAIN=1; shift ;;
    -h|--help)     grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)             die "unknown arg: $1 (try --help)" ;;
  esac
done

command -v az >/dev/null || die "az CLI not found"
SUB=$(az account show --query id -o tsv 2>/dev/null) || die "not logged in (az login)"
say "subscription $SUB / rg $RG / app $APP"

# ---- 1. vault database -----------------------------------------------------
say "ensuring Postgres db '$PG_DB' on $PG_SERVER"
if az postgres flexible-server db show -g "$RG" -s "$PG_SERVER" -d "$PG_DB" >/dev/null 2>&1; then
  ok "db '$PG_DB' already exists"
else
  run az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB" --output none
  ok "db '$PG_DB' created"
fi

# ---- 2. storage account + file share + env storage -------------------------
say "ensuring storage account '$STORAGE_ACCOUNT' + share '$FILE_SHARE'"
if ! az storage account show -g "$RG" -n "$STORAGE_ACCOUNT" >/dev/null 2>&1; then
  run az storage account create -g "$RG" -n "$STORAGE_ACCOUNT" -l "$REGION" \
    --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --output none
  ok "storage account created"
else
  ok "storage account exists"
fi
SA_KEY=$(az storage account keys list -g "$RG" -n "$STORAGE_ACCOUNT" --query "[0].value" -o tsv 2>/dev/null || echo "DRYRUNKEY")
run az storage share-rm create -g "$RG" --storage-account "$STORAGE_ACCOUNT" -n "$FILE_SHARE" --quota "$FILE_QUOTA_GB" --output none
say "registering env storage '$ENV_STORAGE' on $ENV_NAME"
run az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name "$ENV_STORAGE" \
  --azure-file-account-name "$STORAGE_ACCOUNT" --azure-file-account-key "'$SA_KEY'" \
  --azure-file-share-name "$FILE_SHARE" --access-mode ReadWrite --output none
ok "env storage ready"

# ---- 3. container app (flags-based create) ---------------------------------
# NOTE: `az containerapp create --yaml` is broken in the containerapp extension
# 1.3.0b4 (400 "JSON value could not be converted to System.Boolean"), so we
# create with flags. The /data Azure Files volume CANNOT be set via flags and is
# added once out-of-band: Portal -> Container App -> Volumes -> AzureFile
# 'vwdata' mounted at /data (or `az containerapp update --yaml containerapp.yaml`
# once the extension is on a stable version). See README "Provisioning notes".
say "ensuring Container App '$APP'"
if az containerapp show -g "$RG" -n "$APP" >/dev/null 2>&1; then
  ok "app '$APP' already exists (deploy pipeline will roll it)"
else
  run az containerapp create -g "$RG" -n "$APP" --environment "$ENV_NAME" \
    --image "$IMAGE" --target-port 80 --ingress external \
    --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1.0Gi \
    --secrets database-url=placeholder admin-token=placeholder \
    --env-vars "DOMAIN=https://${DOMAIN}" SIGNUPS_ALLOWED=false ROCKET_PORT=80 \
               DATA_FOLDER=/data DATABASE_URL=secretref:database-url ADMIN_TOKEN=secretref:admin-token \
    --output none
  ok "app '$APP' created -- add the /data volume once (Portal/yaml; see README)"
fi

# ---- 4. secrets ------------------------------------------------------------
if [ -z "$VW_ADMIN_TOKEN" ]; then
  if command -v docker >/dev/null 2>&1 && [ "$DRY_RUN" = 0 ]; then
    say "hashing a fresh ADMIN_TOKEN via the vaultwarden image"
    VW_ADMIN_TOKEN=$(printf '%s' "$(openssl rand -base64 36)" | docker run --rm -i "$IMAGE" /vaultwarden hash --preset owasp 2>/dev/null | tail -1 || true)
  fi
  if [ -z "$VW_ADMIN_TOKEN" ]; then
    VW_ADMIN_TOKEN=$(openssl rand -base64 48)
    warn "using a random PLAIN admin token (no docker to argon2-hash it). Rotate to a PHC hash later for the /admin panel."
  fi
fi
# Reuse the Postgres creds already in Azure: read API_APP's database-url secret
# and swap the db name to vaultwarden. No separate PG password env needed.
if [ -n "$PG_PASSWORD" ]; then
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?sslmode=${PG_SSL}"
else
  say "deriving Postgres creds from $API_APP's database-url secret (Azure)"
  API_DBURL=$(az containerapp secret show -g "$RG" -n "$API_APP" --secret-name database-url --query value -o tsv 2>/dev/null || echo "")
  if [ -z "$API_DBURL" ]; then
    [ "$DRY_RUN" = 1 ] && API_DBURL="postgresql://USER:PASS@${PG_HOST}:${PG_PORT}/api?sslmode=${PG_SSL}" \
      || die "couldn't read $API_APP database-url secret (need Contributor on it). Pass PG_PASSWORD instead."
  fi
  # Keep user:pass@host:port, swap the db path to vaultwarden, normalize to sslmode only.
  PREFIX=$(printf '%s' "$API_DBURL" | sed -E 's#(postgresql://[^/]+/).*#\1#')
  DATABASE_URL="${PREFIX}${PG_DB}?sslmode=${PG_SSL}"
fi
say "setting secrets (database-url, admin-token)"
run az containerapp secret set -g "$RG" -n "$APP" \
  --secrets "database-url='$DATABASE_URL'" "admin-token='$VW_ADMIN_TOKEN'" --output none
ok "secrets set"
if [ "$DRY_RUN" = 0 ]; then
  printf '\033[33m[save this]\033[0m ADMIN_TOKEN (for /admin + the deploy variable group VW_ADMIN_TOKEN):\n  %s\n' "$VW_ADMIN_TOKEN"
fi

# Container Apps only read secrets on a NEW revision, so roll one now that the
# real database-url/admin-token are set (the create used empty placeholders).
say "rolling a revision so the new secrets take effect"
run az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" --output none

# ---- 5. custom domain ------------------------------------------------------
if [ "$SKIP_DOMAIN" = 1 ]; then
  warn "skipping custom domain (--skip-domain). Bind later: az containerapp hostname bind ..."
else
  say "adding custom hostname $DOMAIN (create the printed DNS records, then this binds)"
  APP_FQDN=$(az containerapp show -g "$RG" -n "$APP" --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "<app-fqdn>")
  VTOKEN=$(az containerapp hostname add -g "$RG" -n "$APP" --hostname "$DOMAIN" --query "[0].validationToken" -o tsv 2>/dev/null || echo "")
  cat <<EOF

  DNS records to create for ${DOMAIN}:
    CNAME  ${DOMAIN}  ->  ${APP_FQDN}
    TXT    asuid.${DOMAIN%%.*}  ->  ${VTOKEN:-<run: az containerapp show ... customDomainVerificationId>}

EOF
  if [ "$DRY_RUN" = 0 ]; then
    if az containerapp hostname bind -g "$RG" -n "$APP" --hostname "$DOMAIN" --environment "$ENV_NAME" --validation-method CNAME --output none 2>/dev/null; then
      ok "hostname bound + managed cert issuing for $DOMAIN"
    else
      warn "bind failed (DNS not propagated yet). After creating the records above, re-run or: az containerapp hostname bind -g $RG -n $APP --hostname $DOMAIN --environment $ENV_NAME --validation-method CNAME"
    fi
  fi
fi

ok "Vaultwarden setup complete."
cat <<EOF

Next:
  - Put the ADMIN_TOKEN above into the ADO variable group skintyee-prod-azure as
    VW_ADMIN_TOKEN (secret) so deploy-vaultwarden can re-apply it.
  - Open https://${DOMAIN}/admin (ADMIN_TOKEN) -> create the org + collections,
    invite staff (signups are disabled).
  - Future updates: run the deploy-vaultwarden pipeline.
EOF
