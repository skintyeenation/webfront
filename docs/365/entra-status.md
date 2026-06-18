# Entra ID — current realized state

**What this is:** a snapshot of what is *actually provisioned* in the
`skintyeenation` Entra tenant right now — as opposed to
[`entra-usage.md`](./entra-usage.md) (what we *intend* to use Entra for) and the
[`app-graph` runbook](../devops/app-graph-setup-runbook.md) (the *procedure*).
Those describe the plan; this records the fact.

**As of:** 2026-06-17. Regenerate with the verification commands at the bottom —
the live tenant is the source of truth; this file goes stale the moment someone
runs a script. Treat any disagreement between this doc and `az` output as "this
doc is wrong."

Tenant `ee46daed-e89f-4438-b1f7-dc26203a4bec` · subscription
`8d847916-9aeb-4e92-ba2f-2c3579826c0e`.

---

## App registrations (5)

| App | appId | Purpose | Credential | State |
|---|---|---|---|---|
| `it-project-docs-publisher` | `0d6f0c13…` | ADO pipeline publishing `docs/` → SharePoint | Federated (WIF) | ✅ live |
| `skintyee-prod-deploy` | `cb91f9d8…` | ADO CI/CD (ACR push, Container Apps, SWAs) | Federated (WIF) | ✅ live |
| `skintyeenation-admin-cli` | `cc85d6bc…` | Interactive admin tooling (m365 CLI) | None (public client) | ✅ live |
| `skintyee-app-graph` | `d6b7e4fc…` | api/ app-only Graph + Exchange access | **Client secret** | ✅ live, consented |
| `skintyee-app-signin` | `d0bf0488…` | Community-app **user SSO** | None (public client, PKCE) | ✅ registered |

`skintyee-m365-backup` from `entra-usage.md` is **not yet created** (the
"(to be created)" marker there is still accurate).

---

## `skintyee-app-graph` — permissions (configured vs. granted)

⚠️ **The live grant is broader than the docs describe.** `entra-usage.md` and the
runbook call this a *read-only* feed reader (`Group.Read.All`, `Calendars.Read`).
It is not — it has **write** scopes, because the directory/staff-auth features
write group membership back to Entra (`PATCH /v1/directory/:id/groups`) and send
mail. It evolved from "Planner feed reader" (ADR-14) into a read-write directory +
mail agent.

**Microsoft Graph** (`00000003-…`):

| Permission | Configured | Admin-consented (granted) |
|---|---|---|
| `User.Read.All` | ✅ | ✅ |
| `Tasks.Read.All` | ✅ | ✅ |
| `Group.ReadWrite.All` | ✅ | ✅ |
| `Calendars.ReadWrite` | ✅ | ✅ |
| `User.ReadWrite.All` | ✅ | ❌ **configured but NOT consented** |

**Office 365 Exchange Online** (`00000002-…`): `Exchange.ManageAsApp` —
✅ configured + ✅ granted (used by `exo-function/` for shared-mailbox / sendMail).

- **Client secret** valid until **2028-06-01** (keyId `f4f8e941…`).
- **Data hygiene:** `requiredResourceAccess` contains many **duplicate** entries
  (the Graph block lists the same role 3–4× each; the EXO block repeats
  `Exchange.ManageAsApp` 4×). Harmless to Entra, but `setup-app-graph.sh` is
  appending without de-duping — worth a cleanup pass.

---

## `skintyee-app-signin` — user SSO (public client)

- **Audience:** `AzureADMyOrg` (single-tenant).
- **No secret** — public client; PKCE protects the code→token exchange.
- **Redirect URIs:**
  - SPA/web: `http://localhost:19006`, `http://localhost:8081`,
    `https://app.skintyee.ca`
  - Native: `ca.skintyee.app://auth`, `msauth.ca.skintyee.app://auth`
- **Delegated Graph scopes:** `User.Read`, `Calendars.ReadWrite`,
  `Group.ReadWrite.All` (the write scopes back the admin-side directory edits).
- **App-side flow is implemented** (`app/src/store/modules/auth.ts`, via
  `expo-auth-session` — real PKCE sign-in, not the dev role-switcher stub) and
  points at this app.

---

## Groups

All role / program-area groups exist: `Skin Tyee Staff`, `Council`,
`Management`, `Finance`, `Forestry`, `Land Resources`, `Housing`, `Fire Chief`,
`IT`, `GIS`, `Band Members`, `Contractors`, `System Admin`, `Chief`,
`Band Manager`, `Band`.

⚠️ **Duplicates exist** — two each of `Skin Tyee Management`, `Skin Tyee Council`,
and `Skin Tyee Band Members`, where the duplicate has an all-zeros
`mailNickname`. Cleanup candidate (verify nothing references the dupes before
deleting).

---

## staff-auth feature

Built through **Slice 4** (`docs/features/staff-auth.md`):

| Slice | What | State |
|---|---|---|
| 1 | Skin Tyee Staff group sync | ✅ |
| 2 | Schema + endpoints + JWT middleware | ✅ |
| 3a–c | Email/password sign-in; Add/Edit Person; OTP; reset/revoke | ✅ |
| 4 | Forgot/reset password via Graph sendMail | ✅ |

The **password sign-in path is complete end-to-end**: api/ mints and verifies its
own JWT (`aud: skintyee-app-staff`, `kind: 'staff'`).

---

## Open items

1. **api-side Entra JWT verification is NOT wired.** `staff-auth.service.ts`
   `verifyToken()` validates only the staff *password* JWT. The Entra SSO path
   (tokens from `skintyee-app-signin`, validated against the tenant JWKS /
   issuer / audience) is marked "planned, not yet wired" in
   [`app-roles.md`](./app-roles.md) and `entra-usage.md` Phase 2; the
   `kind: 'staff'` discriminator is the placeholder for it. **This is the main
   gap** — SSO authenticates the user client-side but the backend can't yet
   verify those tokens.
2. **Least-privilege review** of `skintyee-app-graph`: it holds
   `Group.ReadWrite.All` + `Calendars.ReadWrite` (+ configured `User.ReadWrite.All`).
   Confirm each write scope is actually required, or split read vs. write apps.
3. **Decide on `User.ReadWrite.All`** — configured but unconsented. Either grant
   it (if a feature needs it) or remove it from `requiredResourceAccess`.
4. **De-dupe** `skintyee-app-graph`'s `requiredResourceAccess` entries and fix
   `setup-app-graph.sh` to be idempotent.
5. **Clean up duplicate `Skin Tyee *` groups.**

---

## Verification commands

```bash
# All app registrations
az ad app list --all --query "sort_by([].{name:displayName, appId:appId}, &name)" -o table

# app-graph: granted (admin-consented) app roles
SP=$(az ad sp list --filter "appId eq 'd6b7e4fc-5714-438a-8d30-11ef8efeca3a'" --query '[0].id' -o tsv)
az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${SP}/appRoleAssignments" \
  --query "value[].{appRoleId:appRoleId, resource:resourceDisplayName}" -o table

# app-graph: secret expiry
az ad app credential list --id d6b7e4fc-5714-438a-8d30-11ef8efeca3a --query "[].{keyId:keyId, end:endDateTime}" -o table

# app-signin: redirect URIs + delegated scopes
az ad app show --id d0bf0488-20b1-4b6d-a03e-fca253c3968f \
  --query "{spa:spa.redirectUris, native:publicClient.redirectUris, audience:signInAudience}" -o json

# Skin Tyee groups (spot the duplicates)
az ad group list --filter "startswith(displayName,'Skin Tyee')" --query "[].displayName" -o table
```

## See also

- [`entra-usage.md`](./entra-usage.md) — intended usage (the plan)
- [`app-graph-setup-runbook.md`](../devops/app-graph-setup-runbook.md) — the setup procedure
- [`../features/staff-auth.md`](../features/staff-auth.md) — two-path sign-in design
- [`app-roles.md`](./app-roles.md) — role model
