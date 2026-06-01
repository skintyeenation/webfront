# What we actually use Entra ID for

The companion to [`entra-id.md`](./entra-id.md). That one explains *what
Entra ID is* and how the admin account / SSO / Entra Connect fit in
abstractly. This one is the **operational inventory**: every service
and app currently relying on Entra, every app that *will* once Phase 2
lands, and a few that deliberately won't.

## In production today

### Identity / SSO for Microsoft surfaces

| Service | What it's used for | Who signs in |
|---|---|---|
| **Microsoft 365** — Outlook, Teams, OneDrive, SharePoint, Office desktop apps | Daily email, files, meetings, collaboration | Every licensed staff member |
| **Azure DevOps** (`dev.azure.com/skintyeenation`) | Source control + CI/CD | Developers + admins |
| **Azure Portal** (`portal.azure.com`) | Subscription / DNS / Storage / DB management | Admins |
| **SharePoint Online** (`skintyeenation.sharepoint.com`) | The auto-published docs site, plus any future team sites | Staff (read-only on docs site by default; explicit grants for editor roles) |
| **1Password** *(optional, opt-in per user)* | Unlock the vault with Entra account instead of master password | Any staff who enable "Unlock with SSO" in their 1Password app |

Each service uses the **same `firstname.lastname@skintyee.ca` Entra
account**. No separate logins. Disabling that account in Entra
immediately revokes access everywhere.

### Service-to-service authentication (apps acting without a user)

| App registration | Role | Used by | Permissions | Credential type |
|---|---|---|---|---|
| **`it-project-docs-publisher`** | App-only auth target | The Azure Pipeline that publishes `docs/` to SharePoint | Microsoft Graph **`Sites.Selected`** (Application) — explicitly granted on the `it-project-docs` SharePoint site only | **Federated credential** (workload identity federation via ADO service connection — no client secret) |
| **`skintyeenation-admin-cli`** | Interactive sign-in for admin tooling | Lucas / admins running the m365 CLI locally for setup tasks | Microsoft Graph **`Sites.FullControl.All`** + **`User.Read`** (Delegated); SharePoint Online **`AllSites.FullControl`** (Delegated, best-effort) | None — public client, browser-flow sign-in only |
| **`skintyee-prod-deploy`** | App-only auth target | ADO pipelines that build/push images + update Container Apps + manage SWAs | Contributor on `skintyeeprodacr` + the 2 Container Apps + the 2 Static Web Apps in `skintyee-prod-rg` | **Federated credential** (WIF via ADO service connection) — see [`scripts/setup-api-azure.sh`](../../scripts/setup-api-azure.sh) |
| **`skintyee-m365-backup`** *(to be created)* | App-only auth target | The M365 email backup script on the onsite Windows Server 2022 | Microsoft Graph: **`Mail.Read`** + **`Calendars.Read`** + **`Contacts.Read`** + **`User.Read.All`** (all Application) — read-only across every mailbox in the tenant | **Client secret** (24-month rotation; 1Password) — see [`scripts/setup-backup-cloud.sh`](../../scripts/setup-backup-cloud.sh) and [`docs/365/email-backup.md`](./email-backup.md) |
| **`skintyee-app-graph`** *(to be created)* | App-only auth target | The community app's NestJS api/ — reads Planner + Teams meeting calendar data for the unified homescreen feed | Microsoft Graph: **`Tasks.Read.All`** + **`Group.Read.All`** + **`Calendars.Read`** + **`User.Read.All`** (all Application) | **Client secret** (24-month rotation; stored as Container App secret env vars) — see [`scripts/setup-app-graph.sh`](../../scripts/setup-app-graph.sh) and [`docs/features/planner-dashboard.md`](../features/planner-dashboard.md) (ADR-14) |

Setup walkthrough for both:
[`sharepoint-docs-publish.md`](./sharepoint-docs-publish.md).
Operational gotchas + post-mortem of the live setup:
[`../devops/sharepoint-pipeline-postmortem.md`](../devops/sharepoint-pipeline-postmortem.md).

> **Zero secrets in this picture.** Both apps exist in Entra but
> neither has a client_secret or certificate attached. The publisher
> uses federation; the CLI app is a public client. Nothing to rotate,
> nothing to leak.

## Planned for our own apps (Phase 2)

The community app and its API server are **proof-of-concept** for the
three-month proposal. Both have Entra ID listed as the production auth
target in the ADRs, but auth is stubbed today so the demo runs
without provisioning real test users.

| Component | Today (POC) | Phase 2 target |
|---|---|---|
| **`app/`** (React Native + Expo) | Stubbed dev role switcher (`app/src/store/modules/auth.ts` + Account screen) — pick `public` / `member` / `staff` / `admin` from a dropdown for demo | MSAL sign-in (`@azure/msal-react-native` or `react-native-msal`); app role claims drive screen gating |
| **`api/`** (NestJS) | `x-role` header from the client gates writes; no real verification | Entra JWT validation middleware (against the tenant's JWKS); `@Roles('admin')` guards read from verified token claims |
| **App distribution** | Whatever Expo dev mode hands you | Same MSAL sign-in across iOS (TestFlight) + Android (Play) |

Catalogue of every stub: [`/app/STUBS.md`](../../app/STUBS.md). Each
auth-related stub points at the Phase 2 Entra integration.

### What Phase 2 looks like end-to-end

```
[ staff phone — Skin Tyee app ]
   │
   │ MSAL sign-in → Entra ID  (firstname.lastname@skintyee.ca + MFA)
   │
   ▼ Authorization: Bearer <access_token>
[ api.skintyee.ca — NestJS ]
   │
   │ verify token signature against Entra JWKS
   │ extract role claims, scope claims
   │
   ▼ role-gated CRUD
[ Azure DB for PostgreSQL Flexible Server (PostGIS) ]
```

One identity end-to-end. Same `@skintyee.ca` account that signs into
Outlook signs into the app. Adding a new staff member: one form in M365
admin center; they immediately have app access at whatever role their
Entra app-role assignment gives them. Offboarding: block sign-in in
Entra; the app session dies along with every other Microsoft service.

The relevant ADRs:

- [ADR-1 — auth provider: Entra ID (not Cognito)](../architecture-decisions.md)
- [ADR-7 — API stack: NestJS + Prisma + Postgres + Entra auth](../architecture-decisions.md)

## Not using Entra (and won't)

| | Why |
|---|---|
| **WordPress site** (`skintyee.ca`) | Uses WordPress's own admin auth. The "Login with Microsoft" plugin exists but isn't worth the integration complexity for a 2–3 admin site. Trade-off: WP admin credentials live in 1Password, separate from Entra. |
| **Lookup tool** (`lookup/` — the Canadian business / Nations lookup) | Public utility; no sign-in required. If it later needs auth, Entra (or External ID if public) is the path. |
| **Public-facing app sign-up** (hypothetical — band members or general public, not staff) | Would use **Entra External ID** (formerly Azure AD B2C), not Entra ID itself. Sibling product, separate licensing. Free up to 50K monthly active users. See [`pricing.md § Multi-tenant scenarios`](./pricing.md). |

## Quick inventory: what's in our Entra tenant

```
skintyeenation.onmicrosoft.com (tenant)
│
├── Users
│   ├── admin@skintyeenation.onmicrosoft.com  ← break-glass Global Admin
│   └── firstname.lastname@skintyee.ca         ← named user accounts
│       (one per staff member, each licensed
│        with M365 Business Standard)
│
├── App registrations
│   ├── it-project-docs-publisher              ← SharePoint publisher (app-only)
│   │   ├── permission: Sites.Selected (Application, admin-consented)
│   │   ├── federated credential: ADO service connection trust
│   │   └── client secrets: none ← intentional
│   │
│   └── skintyeenation-admin-cli               ← m365 CLI sign-in (delegated)
│       ├── permissions: Sites.FullControl.All + User.Read (Delegated)
│       │   + AllSites.FullControl (Delegated, SP REST API)
│       ├── public client: true, http://localhost redirect
│       └── client secrets: none ← intentional
│
├── Enterprise applications
│   ├── (auto-created service principals for the two apps above)
│   ├── Microsoft 365 (built-in)
│   ├── Azure DevOps (built-in)
│   └── 1Password (if Entra-SSO has been enabled)
│
└── Groups
    └── (none scripted yet — TBD as group-based licensing becomes
         worthwhile, see groups.md)
```

To see this live in the tenant:

- Users: <https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade>
- App registrations: <https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade>
- Enterprise applications: <https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade>

## Cost of all this

**Entra ID Free tier** — included with every Microsoft 365 Business
Standard license. App registrations, federated credentials, basic SSO,
MFA, and B2B guest invites (up to 50K MAU) are all included.

The two app registrations we have, the federated credential, the
service principal grants — **zero incremental cost** beyond the M365
licenses we'd be paying for staff anyway.

See [`pricing.md § Entra ID`](./pricing.md#entra-id--whats-included-whats-extra)
for what would cost extra (P1 / P2 / External ID / multi-tenant scenarios).

## See also

- [`entra-id.md`](./entra-id.md) — what Entra ID is, the admin account, SSO concepts
- [`groups.md`](./groups.md) — M365 Groups vs Security Groups (when group-based licensing becomes relevant)
- [`sharepoint-docs-publish.md`](./sharepoint-docs-publish.md) — the live workload using both app registrations
- [`../devops/sharepoint-pipeline-postmortem.md`](../devops/sharepoint-pipeline-postmortem.md) — what went wrong setting it up the first time, how the script now handles each gap
- [`/app/STUBS.md`](../../app/STUBS.md) — what auth is mocked in the POC + the Phase 2 Entra integration points
