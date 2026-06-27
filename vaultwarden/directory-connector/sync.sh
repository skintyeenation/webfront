#!/usr/bin/env bash
# Entrypoint for the Directory Connector ACA Job (ADR-19 Phase A). Points bwdc at
# Vaultwarden, logs in with the org API key, and syncs Entra members + groups.
#
# Directory config (Azure tenant/app/key + sync filters) lives in bwdc's appdata
# data.json, persisted on the mounted Azure Files volume at
# BITWARDENCLI_CONNECTOR_APPDATA_DIR. Seed it ONCE (see ../entra-sync.md):
# configure in the bwdc desktop app and copy its data.json onto the share, or
# run `bwdc config`/`bwdc data-environment` here interactively the first time.
#
# Required env (from Container App secrets):
#   VAULT_URL        https://vault.skintyee.ca
#   BW_CLIENTID      organization.<org-api-key client_id>
#   BW_CLIENTSECRET  <org api key client_secret>
# Optional: SYNC_TEST_ONLY=1 -> dry test (no writes).
#
# SCAFFOLD: verify the exact bwdc subcommands against the packaged version.
set -euo pipefail
: "${VAULT_URL:?set VAULT_URL}"
: "${BW_CLIENTID:?set BW_CLIENTID (org API key)}"
: "${BW_CLIENTSECRET:?set BW_CLIENTSECRET (org API key)}"

echo "> server $VAULT_URL"
bwdc config server "$VAULT_URL"

echo "> login (org API key)"
bwdc login   # reads BW_CLIENTID / BW_CLIENTSECRET from env

if [ "${SYNC_TEST_ONLY:-0}" = "1" ]; then
  echo "> test (no writes)"
  exec bwdc test
fi

echo "> sync"
bwdc sync
echo "[ok] directory sync complete"
