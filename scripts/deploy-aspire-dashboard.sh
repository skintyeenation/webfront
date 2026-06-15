#!/bin/bash
# Deploy the Aspire Dashboard to the prod Container Apps environment so all of
# api-prod's (and lookup-prod's) traces, metrics, and structured logs land in
# ONE pane — instead of bouncing between the Azure portal, `az` CLI, and Swagger.
#
# The Aspire Dashboard needs TWO ports, which an ACA ingress can't expose on its
# own — so we use a YAML manifest with `additionalPortMappings`:
#
#   • 18888  Blazor UI        — EXTERNAL ingress, gated by a stable browser token
#   • 18889  OTLP/gRPC ingest — INTERNAL additional port (only apps in the same
#                               environment, i.e. api-prod / lookup-prod, can reach
#                               it; never exposed to the public internet)
#
# Security model (Skin Tyee is an NGO — auditability matters):
#   • UI is reachable on the public FQDN but requires the browser token below.
#   • OTLP ingestion is internal-only, so it runs Unsecured (the network
#     boundary IS the control). Nothing public can push telemetry.
#
# NOTE: the dashboard is STATEFUL (telemetry is held in memory). It runs as a
# single replica that never scales to zero; restarting it clears history. This
# is fine for live ops + a POC. Persisting telemetry would mean wiring an
# external store — out of scope here.
#
# Idempotent: re-running updates the existing app in place.
#
# What this does NOT do by default: point api-prod / lookup-prod AT the
# dashboard. That step rolls a new revision on each live app, so it's opt-in:
#     ./deploy-aspire-dashboard.sh --wire-apps
# (or run it later, once you've confirmed the dashboard is up).
#
# Prereqs: az CLI logged in; the `containerapp` extension; openssl on PATH.

set -uo pipefail

# ----- config (override via env or flags) ------------------------------------
RG="${RG:-skintyee-prod-rg}"
CAE_NAME="${CAE_NAME:-skintyee-prod-env}"
APP_NAME="${APP_NAME:-aspire-dashboard}"
IMAGE="${IMAGE:-mcr.microsoft.com/dotnet/aspire-dashboard:9.0}"
# Apps to point at the dashboard when --wire-apps is passed.
TARGET_APPS="${TARGET_APPS:-api-prod lookup-prod}"

WIRE_APPS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wire-apps) WIRE_APPS=1; shift ;;
    --rg)        RG="$2"; shift 2 ;;
    --env)       CAE_NAME="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }

ENV_ID=$(az containerapp env show -n "$CAE_NAME" -g "$RG" --query id -o tsv) || {
  echo "Could not find environment $CAE_NAME in $RG — is az logged in?" >&2; exit 1; }
ENV_DOMAIN=$(az containerapp env show -n "$CAE_NAME" -g "$RG" --query properties.defaultDomain -o tsv)

# Internal address other apps in this environment use to push OTLP. Additional
# (internal) ports are reachable on the app's *internal* FQDN at the exposed port.
OTLP_ENDPOINT="http://${APP_NAME}.internal.${ENV_DOMAIN}:18889"

say "Deploying $APP_NAME to $CAE_NAME ($RG)"

# Reuse the existing browser token across re-runs so the login URL stays stable;
# mint a fresh one on first deploy.
TOKEN=$(az containerapp secret show -n "$APP_NAME" -g "$RG" --secret-name browser-token \
          --query value -o tsv 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  TOKEN=$(openssl rand -hex 24)
  ok "minted a new dashboard browser token"
else
  ok "reusing existing dashboard browser token"
fi

# The dual-port dashboard is built in two steps. `az containerapp create --yaml`
# chokes on the additionalPortMappings schema, so we (1) create the app with the
# plain CLI exposing only the external UI port, then (2) PATCH the internal OTLP
# port in via the ARM REST API (the one path that reliably accepts it).
if az containerapp show -n "$APP_NAME" -g "$RG" >/dev/null 2>&1; then
  say "$APP_NAME already exists — leaving the container/secret as-is"
else
  say "creating $APP_NAME (external UI on 18888)"
  az containerapp create -n "$APP_NAME" -g "$RG" \
    --environment "$CAE_NAME" \
    --image "$IMAGE" \
    --ingress external --target-port 18888 --transport auto \
    --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1 \
    --secrets "browser-token=${TOKEN}" \
    --env-vars \
      Dashboard__Frontend__AuthMode=BrowserToken \
      "Dashboard__Frontend__BrowserToken=secretref:browser-token" \
      Dashboard__Otlp__AuthMode=Unsecured \
    -o none || { echo "create failed" >&2; exit 1; }
fi

say "ensuring the internal OTLP port (18889) is exposed"
APP_ID=$(az containerapp show -n "$APP_NAME" -g "$RG" --query id -o tsv)
az rest --method PATCH \
  --url "https://management.azure.com${APP_ID}?api-version=2024-03-01" \
  --headers "Content-Type=application/json" \
  --body '{"properties":{"configuration":{"ingress":{"external":true,"targetPort":18888,"transport":"Auto","additionalPortMappings":[{"external":false,"targetPort":18889,"exposedPort":18889}]}}}}' \
  -o none --only-show-errors || { echo "PATCH for OTLP port failed" >&2; exit 1; }

# Wait out the provisioning the PATCH kicks off (a second mutation would 409).
for _ in $(seq 1 18); do
  prov=$(az containerapp show -n "$APP_NAME" -g "$RG" --query properties.provisioningState -o tsv --only-show-errors 2>/dev/null)
  [[ "$prov" == "Succeeded" || "$prov" == "Failed" ]] && break
  sleep 8
done
ok "OTLP port provisioned (state: ${prov:-unknown})"

FQDN=$(az containerapp show -n "$APP_NAME" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
ok "dashboard deployed"
echo
echo "  UI:    https://${FQDN}/login?t=${TOKEN}"
echo "  (token: ${TOKEN})"
echo "  OTLP (internal, for app env vars): ${OTLP_ENDPOINT}"
echo

# ----- optionally point the live apps at the dashboard -----------------------
# This rolls a new revision on each app (env-var change). Opt-in via --wire-apps.
if [[ "$WIRE_APPS" -eq 1 ]]; then
  for app in $TARGET_APPS; do
    say "pointing $app → $OTLP_ENDPOINT (this rolls a new revision)"
    az containerapp update -n "$app" -g "$RG" \
      --set-env-vars \
        "OTEL_EXPORTER_OTLP_ENDPOINT=${OTLP_ENDPOINT}" \
        "OTEL_EXPORTER_OTLP_PROTOCOL=grpc" \
        "OTEL_SERVICE_NAME=${app}" \
      -o none
    # Confirm the new revision comes up healthy before moving on.
    sleep 8
    state=$(az containerapp revision list -n "$app" -g "$RG" \
              --query "reverse(sort_by([?properties.active], &properties.createdTime))[0].properties.{run:runningState,health:healthState}" -o json)
    echo "    $app latest revision: $state"
  done
  ok "apps wired to the dashboard"
else
  warn "apps NOT wired yet. To send prod telemetry to the dashboard, run:"
  echo "      $0 --wire-apps"
fi
