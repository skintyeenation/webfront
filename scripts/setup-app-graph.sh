#!/bin/bash
# Provision the Entra app `skintyee-app-graph` — the application the
# community app's API server uses to read Microsoft Graph data
# (Planner tasks, Teams meeting calendar events, user lookups for
# task-assignee names).
#
# Read-only application permissions:
#   - Tasks.Read.All       — Planner tasks across the tenant
#   - Group.ReadWrite.All  — enumerate the M365 Groups that own each Planner
#                            plan, AND write-back security-group memberships
#                            from the app's EditMember screen (POST/DELETE
#                            /groups/{id}/members/$ref).
#   - Calendars.Read       — calendar events including Teams meetings
#   - User.Read.All        — resolve task-assignee user IDs → display names
#
# Reads + grants admin consent + creates a 24-month client secret +
# wires the credentials into the api-prod Container App as secrets +
# updates the ADO variable group with non-secret fields.
#
# Per ADR-14 + docs/features/planner-dashboard.md.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/setup-app-graph.sh                              # interactive (secret to stdout)
#   bash scripts/setup-app-graph.sh --dry-run                    # preview the az calls
#   bash scripts/setup-app-graph.sh --rotate-secret              # mint a fresh client secret
#   bash scripts/setup-app-graph.sh --rotate-secret \\
#        --secret-to-file ~/Desktop/app-graph-secret.json        # secret to FILE (mode 600),
#                                                                # nothing sensitive on stdout —
#                                                                # use when running in an
#                                                                # observed terminal / chat session

set -uo pipefail

# ----- styling --------------------------------------------------------------
CYAN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN"  "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YLW"  "$RST" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED"  "$RST" "$*" >&2; exit 1; }

# ----- defaults (match docs/features/planner-dashboard.md) ------------------
APP_DISPLAY="${APP_DISPLAY:-skintyee-app-graph}"
RG="${RG:-skintyee-prod-rg}"
CA_API_NAME="${CA_API_NAME:-api-prod}"
ADO_ORG="${ADO_ORG:-https://dev.azure.com/skintyeenation}"
ADO_PROJECT="${ADO_PROJECT:-devops}"
ADO_VARGROUP="${ADO_VARGROUP:-skintyee-prod-azure}"

# Microsoft Graph application IDs — the well-known appId is all zeros
# (NOT ...c000-000000000046 — that's a different/legacy/typo'd ID. Verify
# always: az ad sp list --filter "appId eq '<GUID>'" --query '[].{displayName:displayName, appRoleCount:length(appRoles)}'
#  — the real Microsoft Graph SP has 600+ appRoles.)
GRAPH_RESOURCE_ID="00000003-0000-0000-c000-000000000000"

# Application-permission IDs (NOT delegated).
#
# Verify each via:
#   GRAPH_SP=$(az ad sp list --filter "appId eq '${GRAPH_RESOURCE_ID}'" --query '[0].id' -o tsv)
#   az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${GRAPH_SP}?\$select=appRoles" \
#     --query "appRoles[?value=='Tasks.Read.All' && contains(allowedMemberTypes,'Application')].id" -o tsv
#
# Common gotcha: the Microsoft docs sometimes show the DELEGATED permission
# GUID; for an app-only flow you need the APPLICATION permission GUID, which
# is different. Tasks.Read.All is a known example:
#   - delegated:    2c6a42ca-0d4d-49ad-bea1-30dc69e9a6ab  ← wrong here
#   - application:  f10e1f91-74ed-437f-a6fd-d6ae88e26c1f  ← what we want
PERMS=(
  "f10e1f91-74ed-437f-a6fd-d6ae88e26c1f=Role:Tasks.Read.All"        # Planner tasks across tenant
  "62a82d76-70ea-41e2-9197-370581804d09=Role:Group.ReadWrite.All"   # Read M365 Groups (plan owners) + manage security-group membership write-back
  "ef54d2bf-783f-4e0f-bca1-3210c0444d99=Role:Calendars.ReadWrite"   # Calendar events: read (Teams meetings) + create Band Meetings
  "df021288-bdef-4463-88db-98f22de89214=Role:User.Read.All"         # Assignee ID → display name lookup
)
# Note: Group.ReadWrite.All (62a82d76-…) is a superset of Group.Read.All
# (5b567255-…). Granted because the api/'s EditMember screen writes
# security-group memberships back via POST/DELETE /groups/{id}/members/$ref
# — admins curate role assignments in the app, and Entra is the storage.

DRY_RUN=0
ROTATE_SECRET=0
SECRET_TO_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)             DRY_RUN=1; shift ;;
    --rotate-secret)       ROTATE_SECRET=1; shift ;;
    --secret-to-file)      SECRET_TO_FILE="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown flag: $1 (use --help)" ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (dry-run) %s\n' "$*"
  else
    "$@"
  fi
}

# ----- prereqs --------------------------------------------------------------
command -v az >/dev/null || die "az CLI not found"
command -v jq >/dev/null || die "jq not found (brew install jq)"

if ! az account show >/dev/null 2>&1; then
  warn "not signed in to az — running az login"
  [ "$DRY_RUN" -eq 0 ] && az login --only-show-errors >/dev/null
fi

TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null)
SUB_ID=$(az account show --query id -o tsv 2>/dev/null)
say "tenant:        $TENANT_ID"
say "subscription:  $SUB_ID"

# ----- 0) Pre-flight: ensure Microsoft Graph SP exists in this tenant ------
# In tenants that have never had a service principal for Microsoft Graph
# provisioned (rare, but happens in new sandbox tenants), the admin
# consent step at the end will fail with an opaque "application doesn't
# exist" error. Create it now if missing — needs an EXPLICIT displayName;
# `az ad sp create --id` with no displayName fails.
say "ensuring Microsoft Graph SP exists in tenant…"
GRAPH_SP_ID=$(az ad sp list --filter "appId eq '$GRAPH_RESOURCE_ID'" \
  --query '[0].id' -o tsv 2>/dev/null || echo "")
if [ -z "$GRAPH_SP_ID" ] && [ "$DRY_RUN" -eq 0 ]; then
  warn "Microsoft Graph SP not provisioned — creating it now"
  CREATED=$(az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals" \
    --body "{\"appId\":\"$GRAPH_RESOURCE_ID\",\"displayName\":\"Microsoft Graph\"}" 2>&1)
  if echo "$CREATED" | grep -q '"id"'; then
    GRAPH_SP_ID=$(echo "$CREATED" | jq -r .id)
    ok "Microsoft Graph SP provisioned ($GRAPH_SP_ID)"
    # Wait for the appRoles catalog to sync — admin consent will fail otherwise
    say "  waiting up to 90s for appRoles catalog to populate…"
    for i in $(seq 1 18); do
      ROLE_COUNT=$(az rest --method GET \
        --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${GRAPH_SP_ID}?\$select=appRoles" \
        --query 'length(appRoles)' -o tsv 2>/dev/null || echo "0")
      if [ "$ROLE_COUNT" -gt 100 ]; then
        ok "  catalog synced ($ROLE_COUNT appRoles)"
        break
      fi
      sleep 5
    done
  else
    warn "couldn't provision Microsoft Graph SP — admin consent will likely fail"
    warn "  $(echo "$CREATED" | grep -oE '\"message\":[^,]*' | head -1)"
  fi
elif [ -n "$GRAPH_SP_ID" ]; then
  ROLE_COUNT=$(az rest --method GET \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${GRAPH_SP_ID}?\$select=appRoles" \
    --query 'length(appRoles)' -o tsv 2>/dev/null || echo "0")
  ok "Microsoft Graph SP exists ($GRAPH_SP_ID, $ROLE_COUNT appRoles)"
  if [ "$ROLE_COUNT" -lt 100 ]; then
    warn "  but only $ROLE_COUNT appRoles — catalog may be partial; consent may fail"
  fi
fi

# ----- 1) Create / find the Entra app ---------------------------------------
say "ensuring Entra app '$APP_DISPLAY' exists…"
APP_ID=$(az ad app list --display-name "$APP_DISPLAY" --query '[0].appId' -o tsv 2>/dev/null || echo "")
if [ -z "$APP_ID" ]; then
  if [ "$DRY_RUN" -eq 0 ]; then
    APP_ID=$(az ad app create \
      --display-name "$APP_DISPLAY" \
      --sign-in-audience AzureADMyOrg \
      --query appId -o tsv 2>/dev/null)
    [ -n "$APP_ID" ] || die "couldn't create the app"
    ok "Entra app created — appId=$APP_ID"
  else
    APP_ID="00000000-0000-0000-0000-DRYRUN0000ID"
    printf '  (dry-run) az ad app create --display-name %s\n' "$APP_DISPLAY"
  fi
else
  ok "$APP_DISPLAY already exists — appId=$APP_ID"
fi

# Create the SP (idempotent)
if [ "$DRY_RUN" -eq 0 ]; then
  az ad sp show --id "$APP_ID" >/dev/null 2>&1 \
    || az ad sp create --id "$APP_ID" --only-show-errors >/dev/null 2>&1 \
    || warn "couldn't create SP (may already exist)"
fi

# ----- 2) Add the application permissions ----------------------------------
say "adding 4 Microsoft Graph application permissions…"
for PERM in "${PERMS[@]}"; do
  PERM_SPEC="${PERM%%:*}"   # 'id=Role'
  PERM_NAME="${PERM##*:}"   # 'Tasks.Read.All'
  printf '  • %s\n' "$PERM_NAME"
  run az ad app permission add \
    --id "$APP_ID" \
    --api "$GRAPH_RESOURCE_ID" \
    --api-permissions "$PERM_SPEC" \
    --only-show-errors 2>/dev/null
done

# ----- 3) Admin consent -----------------------------------------------------
say "granting admin consent (interactive — may open a browser)…"
if [ "$DRY_RUN" -eq 0 ]; then
  az ad app permission admin-consent --id "$APP_ID" --only-show-errors 2>/dev/null \
    && ok "admin consent granted" \
    || warn "couldn't grant admin consent (do it manually in the Entra portal: App registrations → $APP_DISPLAY → API permissions → Grant admin consent)"
fi

# ----- 4) Client secret -----------------------------------------------------
SECRET_EXISTS=0
if [ "$DRY_RUN" -eq 0 ]; then
  SECRET_COUNT=$(az ad app credential list --id "$APP_ID" --query 'length(@)' -o tsv 2>/dev/null || echo "0")
  [ "$SECRET_COUNT" -gt 0 ] && SECRET_EXISTS=1
fi

if [ "$ROTATE_SECRET" -eq 1 ] || [ "$SECRET_EXISTS" -eq 0 ]; then
  say "creating client secret (24-month expiry)…"
  if [ "$DRY_RUN" -eq 0 ]; then
    # Reset the credential. `az ad app credential reset` returns the
    # secret in `password`; the expiry comes back via a separate
    # `az ad app credential list` call (the reset response doesn't
    # include endDateTime in current az CLI versions).
    SECRET_JSON=$(az ad app credential reset \
      --id "$APP_ID" \
      --display-name "app-graph-prod" \
      --years 2 \
      --query '{appId:appId, secret:password, tenantId:tenant}' \
      -o json 2>/dev/null)
    if [ -n "$SECRET_JSON" ]; then
      CLIENT_SECRET=$(echo "$SECRET_JSON" | jq -r .secret)
      # Fetch endDateTime separately — reset response doesn't include it
      EXPIRES=$(az ad app credential list --id "$APP_ID" \
        --query 'sort_by([], &endDateTime)[-1].endDateTime' -o tsv 2>/dev/null)
      ok "client secret created (expires $EXPIRES)"
    else
      die "couldn't create client secret"
    fi
  fi
else
  ok "client secret already exists (use --rotate-secret to mint a fresh one)"
fi

# If --secret-to-file was given, write the secret there with mode 600
# and DON'T print to stdout (avoids leaking via terminal capture / chat
# transcripts when run by automation or in an observed session).
if [ -n "$SECRET_TO_FILE" ] && [ -n "${CLIENT_SECRET:-}" ]; then
  SECRET_FILE_TMP=$(mktemp)
  chmod 600 "$SECRET_FILE_TMP"
  cat > "$SECRET_FILE_TMP" <<EOF
{
  "tenantId":     "$TENANT_ID",
  "appId":        "$APP_ID",
  "appDisplay":   "$APP_DISPLAY",
  "clientSecret": "$CLIENT_SECRET",
  "expires":      "${EXPIRES:-unknown}",
  "issuedAt":     "$(date -u +%FT%TZ)"
}
EOF
  mv "$SECRET_FILE_TMP" "$SECRET_TO_FILE"
  chmod 600 "$SECRET_TO_FILE"
  ok "secret written to: $SECRET_TO_FILE (mode 600)"
  # Blank the variable so the summary at the end skips the stdout reveal
  CLIENT_SECRET_HIDDEN=1
fi

# ----- 5) Wire credentials into api-prod Container App ----------------------
if [ -n "${CLIENT_SECRET:-}" ] && [ "$DRY_RUN" -eq 0 ]; then
  say "writing credentials into api-prod Container App secrets…"
  if az containerapp show --resource-group "$RG" --name "$CA_API_NAME" >/dev/null 2>&1; then
    # Secrets get stored encrypted at rest in the Container App; env vars
    # are bound to secretref:<name> so the value never appears in any log
    az containerapp secret set \
      --resource-group "$RG" --name "$CA_API_NAME" \
      --secrets \
        "graph-client-id=$APP_ID" \
        "graph-client-secret=$CLIENT_SECRET" \
        "graph-tenant-id=$TENANT_ID" \
      --only-show-errors >/dev/null \
      && ok "secrets stored on $CA_API_NAME" \
      || warn "couldn't set Container App secrets"

    # Bind env vars to the secrets (idempotent — re-applies on every run)
    az containerapp update \
      --resource-group "$RG" --name "$CA_API_NAME" \
      --set-env-vars \
        "GRAPH_CLIENT_ID=secretref:graph-client-id" \
        "GRAPH_CLIENT_SECRET=secretref:graph-client-secret" \
        "GRAPH_TENANT_ID=secretref:graph-tenant-id" \
      --only-show-errors >/dev/null \
      && ok "env vars bound on next revision" \
      || warn "couldn't bind env vars — set manually via az containerapp update"
  else
    warn "Container App $CA_API_NAME not found — skipping secret wiring (run when it exists)"
  fi
fi

# ----- 6) Update ADO variable group (non-secret fields) ---------------------
if [ "$DRY_RUN" -eq 0 ]; then
  say "updating ADO variable group '$ADO_VARGROUP' with non-secret fields…"
  VG_ID=$(az pipelines variable-group list \
    --org "$ADO_ORG" --project "$ADO_PROJECT" \
    --query "[?name=='$ADO_VARGROUP'].id | [0]" -o tsv 2>/dev/null)
  if [ -n "$VG_ID" ]; then
    # GRAPH_APP_ID + GRAPH_TENANT_ID as non-secret; the SECRET stays
    # in the Container App secret store, NOT in the variable group
    for KV in "GRAPH_APP_ID=$APP_ID" "GRAPH_TENANT_ID=$TENANT_ID" "GRAPH_APP_DISPLAY=$APP_DISPLAY"; do
      KEY="${KV%%=*}"
      VAL="${KV#*=}"
      EXISTS=$(az pipelines variable-group variable list \
        --org "$ADO_ORG" --project "$ADO_PROJECT" --group-id "$VG_ID" \
        --query "$KEY" -o tsv 2>/dev/null || echo "")
      if [ -n "$EXISTS" ]; then
        az pipelines variable-group variable update \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$KEY" --value "$VAL" \
          --only-show-errors >/dev/null 2>&1 && ok "$KEY updated"
      else
        az pipelines variable-group variable create \
          --org "$ADO_ORG" --project "$ADO_PROJECT" \
          --group-id "$VG_ID" --name "$KEY" --value "$VAL" \
          --only-show-errors >/dev/null 2>&1 && ok "$KEY added"
      fi
    done
  else
    warn "variable group '$ADO_VARGROUP' not found — skipping"
  fi
fi

# ----- 6.5) Verify the grants actually landed against the correct Graph SP -
# Catches the WRONG-PERMISSION-GUID bug (using a delegated permission ID
# in an application-permissions add) — that bug is silent at add time and
# only surfaces as a 403 from Graph at the first real api call.
if [ "$DRY_RUN" -eq 0 ] && [ -n "${GRAPH_SP_ID:-}" ]; then
  say "verifying admin-consent grants landed on the correct Graph SP…"
  APP_SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv 2>/dev/null)
  if [ -n "$APP_SP_ID" ]; then
    GRANTS=$(az rest --method GET \
      --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${APP_SP_ID}/appRoleAssignments" \
      --query 'value[?resourceId==`'"$GRAPH_SP_ID"'`].appRoleId' -o tsv 2>/dev/null)
    GRANT_COUNT=$(echo "$GRANTS" | grep -c . || echo "0")
    if [ "$GRANT_COUNT" -eq 4 ]; then
      ok "all 4 application permissions granted against Microsoft Graph"
    elif [ "$GRANT_COUNT" -gt 0 ]; then
      warn "only $GRANT_COUNT of 4 grants are live"
      warn "  finish via Entra portal: App registrations → $APP_DISPLAY → API permissions → Grant admin consent"
    else
      warn "ZERO grants are live — admin consent didn't propagate"
      warn "  finish via Entra portal: App registrations → $APP_DISPLAY → API permissions → Grant admin consent"
      warn "  OR manually via Graph API (see docs/devops/app-graph-setup-runbook.md § Troubleshooting)"
    fi
  fi
fi

# ----- 7) Summary -----------------------------------------------------------
printf '\n%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"
printf '%s   skintyee-app-graph provisioned   %s\n' "$YLW" "$RST"
printf '%s═══════════════════════════════════════════════════════════════════════%s\n' "$CYAN" "$RST"

cat <<EOF

Save to 1Password → IT/Admin → 'skintyee-app-graph':
  tenantId:     ${TENANT_ID}
  appId:        ${APP_ID:-DRY-RUN}
EOF

if [ -n "${CLIENT_SECRET:-}" ] && [ "${CLIENT_SECRET_HIDDEN:-0}" -eq 0 ]; then
  cat <<EOF
  clientSecret: ${CLIENT_SECRET}
  expires:      ${EXPIRES}
EOF
elif [ -n "${CLIENT_SECRET:-}" ]; then
  printf '  clientSecret: <written to %s>\n  expires:      %s\n' "$SECRET_TO_FILE" "${EXPIRES:-unknown}"
fi

cat <<EOF

Permissions granted (application):
  • Tasks.Read.All       — Planner tasks                              (read)
  • Group.ReadWrite.All  — M365 Groups (read) + write-back security
                           group memberships from EditMember screen   (read/write)
  • Calendars.Read       — Calendar events (incl. Teams meetings)     (read)
  • User.Read.All        — Assignee ID → display name lookup           (read)

What the api/ now has available (via Container App secrets):
  GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID

Next steps:
  1) Copy secret above into 1Password (if shown)
  2) Re-deploy api-prod so the new env vars take effect:
       Force re-deploy with no source change — touch any api/ file
       and push, OR manually: az containerapp revision restart …
  3) Test the integration:
       curl https://api.skintyee.ca/v1/planner/plans -H "x-role: admin"
       (should return the list of plans visible to skintyee-app-graph)

To rotate the secret later:
  bash scripts/setup-app-graph.sh --rotate-secret

To revoke entirely:
  az ad app delete --id ${APP_ID:-<appId>}

See:
  docs/features/planner-dashboard.md  — the full design
  docs/architecture-decisions.md      — ADR-14
EOF
