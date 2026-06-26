#!/usr/bin/env bash
#
# deploy-guacamole.sh — reusable deploy for the Apache Guacamole stack.
#
# Ships docker-compose.yml + .env to a LAN-reachable host and brings the stack
# up (idempotent). Optionally provisions an Azure VM first (`--provision-vm`).
# Run it directly, or let the Azure DevOps pipeline
# (azure-pipelines/Deployments/deploy-guacamole.yml) call the same steps.
#
# The host MUST be able to reach the band PCs on RDP/3389 — i.e. on the
# STFN.local LAN, or an Azure VM with a site-to-site VPN to the office. See
# README.md (Network reachability).
#
# Usage:
#   ./deploy-guacamole.sh --host azureuser@1.2.3.4 [--path /opt/guacamole]
#                         [--env-file .env] [--dry-run]
#   ./deploy-guacamole.sh --provision-vm [--rg skintyee-prod-rg]
#                         [--location canadacentral] [--vm-name skintyee-guac]
#
# Requires: ssh/scp; az CLI only for --provision-vm. Keep this file ASCII-only.
set -euo pipefail

HOST=""
DEPLOY_PATH="/opt/guacamole"
ENV_FILE=".env"
PROVISION_VM=0
RG="skintyee-prod-rg"
LOCATION="canadacentral"
VM_NAME="skintyee-guac"
VM_SIZE="Standard_B1ms"
DRY_RUN=0

say() { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[err]\033[0m %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY_RUN" = 1 ]; then printf '\033[33m[dry-run]\033[0m %s\n' "$*"; else eval "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --host)         HOST="$2"; shift 2 ;;
    --path)         DEPLOY_PATH="$2"; shift 2 ;;
    --env-file)     ENV_FILE="$2"; shift 2 ;;
    --provision-vm) PROVISION_VM=1; shift ;;
    --rg)           RG="$2"; shift 2 ;;
    --location)     LOCATION="$2"; shift 2 ;;
    --vm-name)      VM_NAME="$2"; shift 2 ;;
    --vm-size)      VM_SIZE="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    -h|--help)      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "unknown arg: $1 (try --help)" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---- 1. Optionally provision an Azure VM (cloud-init installs Docker) --------
if [ "$PROVISION_VM" = 1 ]; then
  command -v az >/dev/null || die "az CLI not found (needed for --provision-vm)"
  say "provisioning Azure VM $VM_NAME ($VM_SIZE) in $RG/$LOCATION"
  CLOUDINIT="$(mktemp)"
  cat > "$CLOUDINIT" <<'YAML'
#cloud-config
package_update: true
packages: [docker.io, docker-compose-plugin]
runcmd:
  - systemctl enable --now docker
  - usermod -aG docker azureuser
YAML
  run az group create --name "$RG" --location "$LOCATION" --only-show-errors -o none
  run az vm create --resource-group "$RG" --name "$VM_NAME" --image Ubuntu2204 \
    --size "$VM_SIZE" --admin-username azureuser --generate-ssh-keys \
    --custom-data "$CLOUDINIT" --public-ip-sku Standard --only-show-errors -o none
  run az vm open-port --resource-group "$RG" --name "$VM_NAME" --port 80,443 --priority 900 --only-show-errors -o none
  rm -f "$CLOUDINIT"
  if [ "$DRY_RUN" != 1 ]; then
    IP="$(az vm show -d --resource-group "$RG" --name "$VM_NAME" --query publicIps -o tsv)"
    HOST="azureuser@${IP}"
    ok "VM ready at $HOST  — point ${GUAC_DOMAIN:-remote.skintyee.ca} DNS A record here"
  fi
fi

[ -n "$HOST" ] || die "no --host given (and no VM provisioned)"
[ -f "$ENV_FILE" ] || die "env file '$ENV_FILE' not found — copy .env.example to .env and fill it in"

# ---- 2. Ship compose + env to the host --------------------------------------
say "deploying to $HOST:$DEPLOY_PATH"
run ssh "$HOST" "mkdir -p '$DEPLOY_PATH'"
run scp docker-compose.yml "$HOST:$DEPLOY_PATH/docker-compose.yml"
run scp "$ENV_FILE" "$HOST:$DEPLOY_PATH/.env"
run ssh "$HOST" "chmod 600 '$DEPLOY_PATH/.env'"

# ---- 3. Bring the stack up (idempotent) -------------------------------------
say "starting stack (docker compose up -d)"
run ssh "$HOST" "cd '$DEPLOY_PATH' && docker compose pull && docker compose up -d"

# ---- 4. Initialise the Guacamole DB schema once -----------------------------
# Guacamole ships the schema SQL in its image; load it only the first time.
say "ensuring Guacamole DB schema is loaded"
run ssh "$HOST" "cd '$DEPLOY_PATH' && if [ ! -f .db-initialized ]; then \
  echo 'loading schema...'; \
  docker compose run --rm guacamole /opt/guacamole/bin/initdb.sh --postgresql \
    | docker compose exec -T postgres psql -U \"\${DB_USER:-guacamole}\" -d \"\${DB_NAME:-guacamole_db}\" \
  && touch .db-initialized && echo 'schema loaded'; \
else echo 'schema already initialised'; fi"

ok "Guacamole deployed."
cat <<EOF

Next steps (one-time):
  1. DNS: point an A record for GUAC_DOMAIN at the host's public IP.
  2. Entra: add redirect URI https://<GUAC_DOMAIN> to the skintyee-guacamole app.
  3. Add one RDP connection per PC (hostname <pc>.stfn.local, port 3389, NLA),
     or auto-provision from the api/ (see README "Connections").
  4. Enable in the app: set EXPO_PUBLIC_RDP_BROWSER_BASE_URL=https://<GUAC_DOMAIN>
     and redeploy the web app -> the "Browser" connect mode lights up.
EOF
